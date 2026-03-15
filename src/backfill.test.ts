import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ResolvedConfig } from './config.js'

const tempDirs: string[] = []

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'codeweather-backfill-test-'))
  tempDirs.push(dir)
  return dir
}

function makeConfig(cwd: string): ResolvedConfig {
  return {
    cwd,
    src: 'src',
    extensions: ['ts', 'tsx', 'js', 'jsx'],
    top: 25,
    json: false,
    stats: {
      top: 25,
      exclude: [],
      excludeDir: [],
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
      tsConfig: undefined,
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
      maxSnapshots: 3,
    },
  }
}

afterEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('selectBackfillCommits', () => {
  it('selects first-parent commits oldest to newest and skips HEAD', async () => {
    const { selectBackfillCommits } = await import('./backfill.js')

    expect(selectBackfillCommits(['head', 'c1', 'c2', 'c3', 'c4'], 2, 2)).toEqual(['c4', 'c2'])
  })

  it('rejects invalid values and short history', async () => {
    const { selectBackfillCommits } = await import('./backfill.js')

    expect(() => selectBackfillCommits(['head', 'c1'], 0, 1)).toThrow(/count/)
    expect(() => selectBackfillCommits(['head', 'c1', 'c2'], 2, 2)).toThrow(/Not enough first-parent history/)
  })
})

describe('runBackfill', () => {
  it('walks selected commits, installs with pnpm, and saves snapshots into the active cwd', async () => {
    const repoRoot = makeTempDir()
    const activeCwd = resolve(repoRoot, 'packages/app')
    mkdirSync(activeCwd, { recursive: true })
    const loadConfigMock = vi.fn(async (cwd: string) => makeConfig(cwd))
    const runAllMock = vi.fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
    const execMock = vi.fn(async (command: string, args: string[], options?: { cwd?: string }) => {
      const cwd = options?.cwd

      if (command === 'git' && args[0] === 'rev-parse' && args[1] === '--is-inside-work-tree') {
        return { stdout: 'true\n', stderr: '', exitCode: 0 }
      }
      if (command === 'git' && args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
        return { stdout: `${repoRoot}\n`, stderr: '', exitCode: 0 }
      }
      if (command === 'git' && args[0] === 'branch' && args[1] === '--show-current') {
        return { stdout: 'main\n', stderr: '', exitCode: 0 }
      }
      if (command === 'git' && args[0] === 'rev-list') {
        return {
          stdout: ['head', 'sha1', 'sha2', 'sha3', 'sha4'].join('\n'),
          stderr: '',
          exitCode: 0,
        }
      }
      if (command === 'git' && args[0] === 'show' && args[1] === '-s') {
        const sha = args[3] as string
        if (sha === 'sha4') {
          return { stdout: 'sha4\u001fsh4\u001f2026-03-01T00:00:00.000Z\u001fFourth commit', stderr: '', exitCode: 0 }
        }
        if (sha === 'sha2') {
          return { stdout: 'sha2\u001fsh2\u001f2026-03-03T00:00:00.000Z\u001fSecond commit', stderr: '', exitCode: 0 }
        }
      }
      if (command === 'git' && args[0] === 'worktree' && args[1] === 'add') {
        const worktreeDir = args[3] as string
        mkdirSync(resolve(worktreeDir, 'packages/app'), { recursive: true })
        return { stdout: '', stderr: '', exitCode: 0 }
      }
      if (command === 'git' && args[0] === 'checkout') {
        expect(cwd).toMatch(/codeweather-backfill/)
        return { stdout: '', stderr: '', exitCode: 0 }
      }
      if (command === 'pnpm' && args[0] === 'install') {
        expect(cwd).toMatch(/codeweather-backfill/)
        return { stdout: '', stderr: '', exitCode: 0 }
      }
      if (command === 'git' && args[0] === 'worktree' && args[1] === 'remove') {
        return { stdout: '', stderr: '', exitCode: 0 }
      }

      return { stdout: '', stderr: `Unexpected command: ${command} ${args.join(' ')}`, exitCode: 1 }
    })

    vi.doMock('./utils/exec.js', () => ({
      exec: execMock,
      isOnPath: vi.fn(async (binary: string) => binary === 'pnpm'),
    }))
    vi.doMock('./config.js', () => ({
      loadConfig: loadConfigMock,
    }))
    vi.doMock('./runner.js', () => ({
      runAll: runAllMock,
    }))

    const { runBackfill } = await import('./backfill.js')
    const exitCode = await runBackfill(activeCwd, { count: 2, every: 2 })

    expect(exitCode).toBe(1)
    expect(loadConfigMock).toHaveBeenNthCalledWith(1, expect.stringMatching(/packages\/app$/), {
      src: undefined,
      config: undefined,
      top: undefined,
      json: false,
    })
    expect(runAllMock).toHaveBeenCalledTimes(2)
    expect(runAllMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      cwd: expect.stringMatching(/packages\/app$/),
      history: expect.objectContaining({ enabled: true, maxSnapshots: undefined }),
    }), expect.objectContaining({
      outputCwd: activeCwd,
      previousSnapshot: null,
      snapshotGit: {
        commit: 'sh4',
        branch: 'main',
        dirty: false,
        message: 'Fourth commit',
      },
      snapshotTimestamp: '2026-03-01T00:00:00.000Z',
      writeRootReport: false,
      printDelta: false,
    }))
    expect(runAllMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      cwd: expect.stringMatching(/packages\/app$/),
    }), expect.objectContaining({
      outputCwd: activeCwd,
      snapshotGit: expect.objectContaining({ commit: 'sh2', message: 'Second commit' }),
      snapshotTimestamp: '2026-03-03T00:00:00.000Z',
    }))
    expect(execMock).toHaveBeenCalledWith('pnpm', ['install'], expect.objectContaining({
      cwd: expect.stringMatching(/codeweather-backfill.*\/repo$/),
    }))
    expect(execMock).toHaveBeenCalledWith('git', ['worktree', 'remove', '--force', expect.stringMatching(/codeweather-backfill.*\/repo$/)], expect.objectContaining({
      cwd: repoRoot,
    }))
  })

  it('cleans up the worktree when a backfill step fails', async () => {
    const repoRoot = makeTempDir()
    const activeCwd = resolve(repoRoot, 'app')
    mkdirSync(activeCwd, { recursive: true })
    const execMock = vi.fn(async (command: string, args: string[], options?: { cwd?: string }) => {
      if (command === 'git' && args[0] === 'rev-parse' && args[1] === '--is-inside-work-tree') {
        return { stdout: 'true\n', stderr: '', exitCode: 0 }
      }
      if (command === 'git' && args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
        return { stdout: `${repoRoot}\n`, stderr: '', exitCode: 0 }
      }
      if (command === 'git' && args[0] === 'branch' && args[1] === '--show-current') {
        return { stdout: 'main\n', stderr: '', exitCode: 0 }
      }
      if (command === 'git' && args[0] === 'rev-list') {
        return { stdout: ['head', 'sha1', 'sha2'].join('\n'), stderr: '', exitCode: 0 }
      }
      if (command === 'git' && args[0] === 'show') {
        return { stdout: 'sha1\u001fsh1\u001f2026-03-01T00:00:00.000Z\u001fFirst commit', stderr: '', exitCode: 0 }
      }
      if (command === 'git' && args[0] === 'worktree' && args[1] === 'add') {
        mkdirSync(resolve(args[3] as string, 'app'), { recursive: true })
        return { stdout: '', stderr: '', exitCode: 0 }
      }
      if (command === 'git' && args[0] === 'checkout') {
        return { stdout: '', stderr: '', exitCode: 0 }
      }
      if (command === 'pnpm' && args[0] === 'install') {
        return { stdout: '', stderr: 'boom', exitCode: 1 }
      }
      if (command === 'git' && args[0] === 'worktree' && args[1] === 'remove') {
        return { stdout: '', stderr: '', exitCode: 0 }
      }

      return { stdout: '', stderr: '', exitCode: 0 }
    })

    vi.doMock('./utils/exec.js', () => ({
      exec: execMock,
      isOnPath: vi.fn(async () => true),
    }))
    vi.doMock('./config.js', () => ({
      loadConfig: vi.fn(async (cwd: string) => makeConfig(cwd)),
    }))
    vi.doMock('./runner.js', () => ({
      runAll: vi.fn(async () => 0),
    }))

    const { runBackfill } = await import('./backfill.js')

    await expect(runBackfill(activeCwd, { count: 1, every: 1 })).rejects.toThrow(/Failed to install dependencies/)
    expect(execMock).toHaveBeenCalledWith('git', ['worktree', 'remove', '--force', expect.stringMatching(/codeweather-backfill.*\/repo$/)], expect.objectContaining({
      cwd: repoRoot,
    }))
  })

  it('fails fast when pnpm is not available', async () => {
    vi.doMock('./utils/exec.js', () => ({
      exec: vi.fn(),
      isOnPath: vi.fn(async () => false),
    }))

    const { runBackfill } = await import('./backfill.js')

    await expect(runBackfill(process.cwd(), { count: 1, every: 1 })).rejects.toThrow(/pnpm/)
  })
})
