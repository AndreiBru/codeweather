import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { loadConfig, type CLIFlags } from './config.js'
import type { SnapshotGitMeta } from './history/types.js'
import { runAll } from './runner.js'
import { exec, isOnPath } from './utils/exec.js'

export interface BackfillOptions extends Pick<CLIFlags, 'src' | 'config' | 'top'> {
  count: number
  every: number
}

interface RepoContext {
  repoRoot: string
  branch: string
  relativeCwd: string
}

interface BackfillCommit {
  sha: string
  shortSha: string
  timestamp: string
  message: string
}

function assertPositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`\`${name}\` must be a positive integer.`)
  }

  return value
}

async function execOrThrow(
  command: string,
  args: string[],
  cwd: string,
  errorMessage: string,
): Promise<string> {
  const result = await exec(command, args, { cwd })
  if (result.exitCode !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim()
    throw new Error(detail ? `${errorMessage}\n${detail}` : errorMessage)
  }

  return result.stdout.trim()
}

async function getRepoContext(cwd: string): Promise<RepoContext> {
  const insideWorkTree = await exec('git', ['rev-parse', '--is-inside-work-tree'], { cwd })
  if (insideWorkTree.exitCode !== 0 || insideWorkTree.stdout.trim() !== 'true') {
    throw new Error('Backfill requires a git working tree.')
  }

  const [repoRoot, branch] = await Promise.all([
    execOrThrow('git', ['rev-parse', '--show-toplevel'], cwd, 'Failed to locate the git repository root.'),
    execOrThrow('git', ['branch', '--show-current'], cwd, 'Failed to determine the current branch.'),
  ])

  if (!branch) {
    throw new Error('Backfill requires a checked out branch, not a detached HEAD.')
  }

  return {
    repoRoot,
    branch,
    relativeCwd: relative(repoRoot, cwd) || '.',
  }
}

export function selectBackfillCommits(
  revisions: string[],
  count: number,
  every: number,
): string[] {
  const snapshotCount = assertPositiveInteger(count, 'count')
  const interval = assertPositiveInteger(every, 'every')
  const oldestIndex = snapshotCount * interval

  if (revisions.length <= oldestIndex) {
    throw new Error(
      `Not enough first-parent history for ${snapshotCount} snapshots every ${interval} commits.`,
    )
  }

  const selected: string[] = []
  for (let index = snapshotCount; index >= 1; index -= 1) {
    selected.push(revisions[index * interval] as string)
  }

  return selected
}

async function loadCommitMetadata(repoRoot: string, sha: string): Promise<BackfillCommit> {
  const output = await execOrThrow(
    'git',
    ['show', '-s', '--format=%H%x1f%h%x1f%cI%x1f%s', sha],
    repoRoot,
    `Failed to read metadata for commit ${sha}.`,
  )
  const [fullSha, shortSha, timestamp, message] = output.split('\u001f')

  if (!fullSha || !shortSha || !timestamp) {
    throw new Error(`Failed to parse metadata for commit ${sha}.`)
  }

  return {
    sha: fullSha,
    shortSha,
    timestamp,
    message: message ?? '',
  }
}

async function resolveBackfillCommits(
  repoRoot: string,
  count: number,
  every: number,
): Promise<BackfillCommit[]> {
  const needed = assertPositiveInteger(count, 'count') * assertPositiveInteger(every, 'every') + 1
  const history = await execOrThrow(
    'git',
    ['rev-list', '--first-parent', `--max-count=${needed}`, 'HEAD'],
    repoRoot,
    'Failed to read first-parent history.',
  )
  const revisions = history.split('\n').map((line) => line.trim()).filter(Boolean)
  const selected = selectBackfillCommits(revisions, count, every)

  return Promise.all(selected.map((sha) => loadCommitMetadata(repoRoot, sha)))
}

export async function runBackfill(cwd: string, options: BackfillOptions): Promise<number> {
  const count = assertPositiveInteger(options.count, 'count')
  const every = assertPositiveInteger(options.every, 'every')

  if (!await isOnPath('pnpm')) {
    throw new Error('Backfill requires `pnpm` to be available on your PATH.')
  }

  const repo = await getRepoContext(cwd)
  const commits = await resolveBackfillCommits(repo.repoRoot, count, every)
  const tempRoot = mkdtempSync(join(tmpdir(), 'codeweather-backfill-'))
  const worktreeDir = join(tempRoot, 'repo')
  let exitCode = 0

  try {
    await execOrThrow(
      'git',
      ['worktree', 'add', '--detach', worktreeDir, 'HEAD'],
      repo.repoRoot,
      'Failed to create the temporary backfill worktree.',
    )

    for (const [index, commit] of commits.entries()) {
      console.log(`Backfill ${index + 1}/${commits.length}: ${commit.shortSha} ${commit.message}`.trim())

      await execOrThrow(
        'git',
        ['checkout', '--detach', commit.sha],
        worktreeDir,
        `Failed to check out commit ${commit.shortSha} in the backfill worktree.`,
      )
      await execOrThrow(
        'pnpm',
        ['install'],
        worktreeDir,
        `Failed to install dependencies for commit ${commit.shortSha}.`,
      )

      const analysisCwd = resolve(worktreeDir, repo.relativeCwd)
      if (!existsSync(analysisCwd)) {
        throw new Error(
          `Current directory is missing in commit ${commit.shortSha}: ${repo.relativeCwd}`,
        )
      }

      const config = await loadConfig(analysisCwd, {
        src: options.src,
        config: options.config,
        top: options.top,
        json: false,
      })

      config.history.enabled = true
      config.history.maxSnapshots = undefined

      const git: SnapshotGitMeta = {
        commit: commit.shortSha,
        branch: repo.branch,
        dirty: false,
        message: commit.message || undefined,
      }

      const commitExitCode = await runAll(config, {
        outputCwd: cwd,
        previousSnapshot: null,
        snapshotGit: git,
        snapshotTimestamp: commit.timestamp,
        writeRootReport: false,
        printDelta: false,
      })
      exitCode = exitCode === 0 ? commitExitCode : exitCode
    }
  } finally {
    await exec('git', ['worktree', 'remove', '--force', worktreeDir], { cwd: repo.repoRoot })
    rmSync(tempRoot, { recursive: true, force: true })
  }

  return exitCode
}
