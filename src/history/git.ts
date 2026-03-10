import type { SnapshotGitMeta } from './types.js'
import { exec } from '../utils/exec.js'

export interface CommitInfo {
  hash: string
  shortHash: string
  authorDate: string
  message: string
}

export async function getCommitList(cwd: string, count: number): Promise<CommitInfo[]> {
  const result = await exec(
    'git',
    ['log', `--format=%H%n%h%n%aI%n%s`, `-n`, String(count)],
    { cwd },
  )

  if (result.exitCode !== 0 || !result.stdout.trim()) {
    return []
  }

  const lines = result.stdout.trim().split('\n')
  const commits: CommitInfo[] = []

  for (let i = 0; i + 3 < lines.length; i += 4) {
    commits.push({
      hash: lines[i],
      shortHash: lines[i + 1],
      authorDate: lines[i + 2],
      message: lines[i + 3],
    })
  }

  return commits
}

export async function getGitMeta(cwd: string): Promise<SnapshotGitMeta | undefined> {
  const insideWorkTree = await exec('git', ['rev-parse', '--is-inside-work-tree'], {
    cwd,
  })

  if (insideWorkTree.exitCode !== 0 || insideWorkTree.stdout.trim() !== 'true') {
    return undefined
  }

  const [commit, branch, status, message] = await Promise.all([
    exec('git', ['rev-parse', '--short', 'HEAD'], { cwd }),
    exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd }),
    exec('git', ['status', '--porcelain'], { cwd }),
    exec('git', ['log', '-1', '--pretty=%s'], { cwd }),
  ])

  if (commit.exitCode !== 0 || branch.exitCode !== 0) {
    return undefined
  }

  const commitSha = commit.stdout.trim()
  const branchName = branch.stdout.trim()

  if (!commitSha || !branchName) {
    return undefined
  }

  const git: SnapshotGitMeta = {
    commit: commitSha,
    branch: branchName,
    dirty: status.stdout.trim().length > 0,
  }

  const summary = message.stdout.trim()
  if (summary) {
    git.message = summary
  }

  return git
}
