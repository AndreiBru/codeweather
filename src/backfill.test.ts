import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ResolvedConfig } from './config.js'
import { loadConfig } from './config.js'
import { rebaseConfigForWorktree } from './backfill.js'
import { getCommitList } from './history/git.js'
import { getExistingCommitHashes, getSnapshotDir } from './history/store.js'

let tempDir: string

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'codeweather-backfill-test-'))
})

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    cwd: tempDir,
    src: 'packages/app/src',
    extensions: ['ts', 'tsx', 'js', 'jsx'],
    top: 25,
    json: false,
    stats: {
      top: 25,
      exclude: ['**/fixtures/'],
      excludeDir: ['node_modules', '.git', '.codeweather'],
      excludeExt: [],
      notMatch: undefined,
      wide: false,
      noMinGen: true,
      noCocomo: true,
      noDuplicates: false,
      largeLineCount: undefined,
      largeByteCount: undefined,
      format: undefined,
      args: [],
    },
    unused: {
      configFile: undefined,
      include: [],
      exclude: [],
      production: false,
      strict: false,
      reporter: undefined,
      workspace: undefined,
      tags: [],
      maxIssues: undefined,
      includeEntryExports: false,
      cache: false,
      args: [],
    },
    duplicates: {
      formats: ['typescript', 'tsx', 'javascript', 'jsx'],
      minLines: undefined,
      minTokens: undefined,
      maxLines: undefined,
      maxSize: undefined,
      threshold: undefined,
      ignore: [],
      ignorePattern: undefined,
      reporters: [],
      mode: 'mild',
      gitignore: true,
      skipLocal: false,
      configFile: undefined,
      args: [],
    },
    cycles: {
      tsConfig: 'tsconfig.json',
      configFile: undefined,
      includeOnly: undefined,
      exclude: undefined,
      doNotFollow: undefined,
      severity: 'error',
      metrics: false,
      cache: false,
      args: [],
    },
    graph: {
      outputDir: 'reports',
      open: false,
      exclude: undefined,
      metrics: false,
      collapse: undefined,
      args: [],
    },
    history: {
      enabled: true,
      dir: '.codeweather',
      maxSnapshots: undefined,
    },
    ...overrides,
  }
}

describe('getCommitList', () => {
  it('returns commits from a git repo', async () => {
    // Initialize a git repo with a couple of commits
    const { execSync } = await import('node:child_process')
    execSync('git init', { cwd: tempDir })
    execSync('git config user.email "test@test.com"', { cwd: tempDir })
    execSync('git config user.name "Test"', { cwd: tempDir })

    writeFileSync(join(tempDir, 'file1.txt'), 'hello')
    execSync('git add . && git commit -m "first commit"', { cwd: tempDir })

    writeFileSync(join(tempDir, 'file2.txt'), 'world')
    execSync('git add . && git commit -m "second commit"', { cwd: tempDir })

    const commits = await getCommitList(tempDir, 5)

    expect(commits).toHaveLength(2)
    expect(commits[0].message).toBe('second commit')
    expect(commits[1].message).toBe('first commit')
    expect(commits[0].hash).toHaveLength(40)
    expect(commits[0].shortHash).toHaveLength(7)
    expect(commits[0].authorDate).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('returns empty array for non-git directory', async () => {
    const commits = await getCommitList(tempDir, 5)
    expect(commits).toEqual([])
  })

  it('respects the count parameter', async () => {
    const { execSync } = await import('node:child_process')
    execSync('git init', { cwd: tempDir })
    execSync('git config user.email "test@test.com"', { cwd: tempDir })
    execSync('git config user.name "Test"', { cwd: tempDir })

    for (let i = 0; i < 5; i++) {
      writeFileSync(join(tempDir, `file${i}.txt`), String(i))
      execSync(`git add . && git commit -m "commit ${i}"`, { cwd: tempDir })
    }

    const commits = await getCommitList(tempDir, 3)
    expect(commits).toHaveLength(3)
    expect(commits[0].message).toBe('commit 4')
  })
})

describe('getExistingCommitHashes', () => {
  it('extracts commit hashes from snapshot filenames', () => {
    const historyDir = '.codeweather'
    const snapshotDir = getSnapshotDir(tempDir, historyDir)
    mkdirSync(snapshotDir, { recursive: true })

    writeFileSync(resolve(snapshotDir, '2024-01-15T10-00-00.000Z_abc1234.json'), '{}')
    writeFileSync(resolve(snapshotDir, '2024-01-16T10-00-00.000Z_def5678.json'), '{}')

    const hashes = getExistingCommitHashes(tempDir, historyDir)

    expect(hashes).toEqual(new Set(['abc1234', 'def5678']))
  })

  it('returns empty set when no snapshots exist', () => {
    const hashes = getExistingCommitHashes(tempDir, '.codeweather')
    expect(hashes).toEqual(new Set())
  })

  it('ignores nogit entries', () => {
    const historyDir = '.codeweather'
    const snapshotDir = getSnapshotDir(tempDir, historyDir)
    mkdirSync(snapshotDir, { recursive: true })

    writeFileSync(resolve(snapshotDir, '2024-01-15T10-00-00.000Z_nogit.json'), '{}')

    const hashes = getExistingCommitHashes(tempDir, historyDir)
    expect(hashes).toEqual(new Set())
  })
})

describe('rebaseConfigForWorktree', () => {
  it('preserves scan settings while switching cwd for historical runs', () => {
    const config = makeConfig({
      src: 'apps/web/src',
      top: 10,
      stats: {
        ...makeConfig().stats,
        args: ['--by-file'],
      },
    })

    const worktreeConfig = rebaseConfigForWorktree(config, '/tmp/codeweather-worktree')

    expect(worktreeConfig.cwd).toBe('/tmp/codeweather-worktree')
    expect(worktreeConfig.json).toBe(true)
    expect(worktreeConfig.src).toBe('apps/web/src')
    expect(worktreeConfig.top).toBe(10)
    expect(worktreeConfig.stats.excludeDir).toEqual(['node_modules', '.git', '.codeweather'])
    expect(worktreeConfig.stats.args).toEqual(['--by-file'])
    expect(worktreeConfig.stats).not.toBe(config.stats)
  })
})

describe('loadConfig defaults', () => {
  it('excludes dependency and tool directories when falling back to "."', async () => {
    const config = await loadConfig(tempDir, {})

    expect(config.src).toBe('.')
    expect(config.stats.excludeDir).toEqual(['node_modules', '.git', '.codeweather'])
  })
})
