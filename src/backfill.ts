import { existsSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import pc from 'picocolors'
import { loadConfig, type ResolvedConfig } from './config.js'
import { runChecks } from './runner.js'
import { getCommitList, type CommitInfo } from './history/git.js'
import { getExistingCommitHashes, saveSnapshot } from './history/store.js'
import { exec } from './utils/exec.js'

export interface BackfillOptions {
  cwd: string
  commits: number
  noInstall: boolean
  config: ResolvedConfig
}

interface BackfillResult {
  created: number
  existed: number
  failed: number
}

// ── Spinner ──────────────────────────────────────────────────

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

class Spinner {
  private frameIndex = 0
  private timer: ReturnType<typeof setInterval> | undefined
  private text = ''
  private stream = process.stderr

  start(text: string) {
    this.text = text
    this.frameIndex = 0
    this.render()
    this.timer = setInterval(() => this.render(), 80)
  }

  update(text: string) {
    this.text = text
  }

  stop(finalText?: string) {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }
    this.clearLine()
    if (finalText) {
      this.stream.write(`${finalText}\n`)
    }
  }

  private render() {
    const frame = pc.cyan(SPINNER_FRAMES[this.frameIndex % SPINNER_FRAMES.length])
    this.clearLine()
    this.stream.write(`${frame} ${this.text}`)
    this.frameIndex++
  }

  private clearLine() {
    this.stream.write('\r\x1b[K')
  }
}

// ── Progress bar ─────────────────────────────────────────────

function progressBar(current: number, total: number, width = 20): string {
  const ratio = current / total
  const filled = Math.round(width * ratio)
  const empty = width - filled
  const bar = pc.green('█'.repeat(filled)) + pc.dim('░'.repeat(empty))
  const pct = `${Math.round(ratio * 100)}%`
  return `${bar} ${pc.dim(pct)}`
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const min = Math.floor(ms / 60_000)
  const sec = Math.round((ms % 60_000) / 1000)
  return `${min}m${sec}s`
}

// ── Internals ────────────────────────────────────────────────

function detectInstallCommand(worktreeCwd: string): string[] | undefined {
  if (existsSync(join(worktreeCwd, 'pnpm-lock.yaml'))) {
    return ['pnpm', 'install', '--frozen-lockfile', '--ignore-scripts']
  }
  if (existsSync(join(worktreeCwd, 'package-lock.json'))) {
    return ['npm', 'ci', '--ignore-scripts']
  }
  if (existsSync(join(worktreeCwd, 'yarn.lock'))) {
    return ['yarn', 'install', '--frozen-lockfile', '--ignore-scripts']
  }
  if (existsSync(join(worktreeCwd, 'bun.lockb'))) {
    return ['bun', 'install', '--frozen-lockfile']
  }
  return undefined
}

async function setupWorktree(
  cwd: string,
  hash: string,
  tmpPath: string,
): Promise<boolean> {
  const result = await exec('git', ['worktree', 'add', '--detach', tmpPath, hash], { cwd })
  return result.exitCode === 0
}

async function cleanupWorktree(cwd: string, tmpPath: string): Promise<void> {
  await exec('git', ['worktree', 'remove', '--force', tmpPath], { cwd })
}

async function installDeps(
  worktreeCwd: string,
  originalCwd: string,
  noInstall: boolean,
): Promise<boolean> {
  if (noInstall) {
    const originalModules = join(originalCwd, 'node_modules')
    const targetModules = join(worktreeCwd, 'node_modules')
    if (existsSync(originalModules) && !existsSync(targetModules)) {
      symlinkSync(originalModules, targetModules)
    }
    return true
  }

  const command = detectInstallCommand(worktreeCwd)
  if (!command) {
    // No lockfile — try symlinking as fallback
    const originalModules = join(originalCwd, 'node_modules')
    const targetModules = join(worktreeCwd, 'node_modules')
    if (existsSync(originalModules) && !existsSync(targetModules)) {
      symlinkSync(originalModules, targetModules)
    }
    return true
  }

  const [bin, ...args] = command
  const result = await exec(bin, args, { cwd: worktreeCwd })
  return result.exitCode === 0
}

// ── Main ─────────────────────────────────────────────────────

export async function runBackfill(options: BackfillOptions): Promise<BackfillResult> {
  const { cwd, commits: count, noInstall, config } = options
  const result: BackfillResult = { created: 0, existed: 0, failed: 0 }
  const spinner = new Spinner()

  spinner.start('Loading commit history…')
  const commitList = await getCommitList(cwd, count)
  spinner.stop()

  if (commitList.length === 0) {
    console.log(pc.yellow('No commits found.'))
    return result
  }

  const existingHashes = getExistingCommitHashes(cwd, config.history.dir)

  // Filter out already-snapshotted commits
  const toProcess: CommitInfo[] = []
  for (const commit of commitList) {
    if (existingHashes.has(commit.shortHash)) {
      result.existed++
    } else {
      toProcess.push(commit)
    }
  }

  if (toProcess.length === 0) {
    console.log(
      `${pc.green('✓')} All ${pc.bold(String(commitList.length))} commits already have snapshots.`,
    )
    return result
  }

  const line = '─'.repeat(60)
  console.log(pc.cyan(line))
  console.log(
    pc.bold(pc.cyan('  Backfill')),
    pc.dim(`— ${toProcess.length} commits to process`),
    result.existed > 0 ? pc.dim(`(${result.existed} already exist)`) : '',
  )
  console.log(pc.cyan(line))
  console.log()

  // Process oldest first for chronological snapshot order
  toProcess.reverse()

  let currentWorktree: string | undefined
  const totalStart = Date.now()

  const cleanup = async () => {
    if (currentWorktree) {
      await cleanupWorktree(cwd, currentWorktree)
      currentWorktree = undefined
    }
  }

  const onSignal = () => {
    spinner.stop()
    cleanup().finally(() => {
      exec('git', ['worktree', 'prune'], { cwd }).finally(() => process.exit(1))
    })
  }

  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)

  for (let i = 0; i < toProcess.length; i++) {
    const commit = toProcess[i]
    const dateShort = commit.authorDate.slice(0, 10)
    const num = `${i + 1}/${toProcess.length}`
    const commitLabel = `${pc.bold(pc.white(commit.shortHash))} ${pc.dim('—')} ${commit.message}`
    const dateDim = pc.dim(`(${dateShort})`)

    console.log(
      `  ${progressBar(i, toProcess.length)} ${pc.dim(num)}`,
    )
    console.log(
      `  ${commitLabel} ${dateDim}`,
    )

    const tmpPath = join(tmpdir(), `codeweather-backfill-${commit.shortHash}`)
    currentWorktree = tmpPath
    const commitStart = Date.now()

    try {
      // Step 1: Worktree
      spinner.start(pc.dim('  Creating worktree…'))
      const created = await setupWorktree(cwd, commit.hash, tmpPath)
      if (!created) {
        spinner.stop(`  ${pc.red('✗')} Failed to create worktree`)
        result.failed++
        console.log()
        continue
      }

      // Step 2: Dependencies
      spinner.update(pc.dim(`  ${noInstall ? 'Linking' : 'Installing'} dependencies…`))
      const installed = await installDeps(tmpPath, cwd, noInstall)
      if (!installed) {
        spinner.stop(`  ${pc.red('✗')} Failed to install dependencies`)
        result.failed++
        console.log()
        continue
      }

      // Step 3: Running checks
      spinner.update(pc.dim('  Running checks…'))
      const worktreeConfig = await loadConfig(tmpPath, {
        json: true,
      })
      const checkResults = await runChecks(worktreeConfig)
      const duration = checkResults.reduce((sum, r) => sum + r.duration, 0)

      // Step 4: Saving snapshot
      spinner.update(pc.dim('  Saving snapshot…'))
      saveSnapshot({
        cwd,
        historyDir: config.history.dir,
        results: checkResults,
        duration,
        git: {
          commit: commit.shortHash,
          branch: 'backfill',
          dirty: false,
          message: commit.message,
        },
        timestamp: commit.authorDate,
      })

      const elapsed = formatElapsed(Date.now() - commitStart)
      const passes = checkResults.filter((r) => r.status === 'pass').length
      const warns = checkResults.filter((r) => r.status === 'warn').length
      const fails = checkResults.filter((r) => r.status === 'fail').length
      const skips = checkResults.filter((r) => r.status === 'skip').length

      const parts: string[] = []
      if (passes) parts.push(pc.green(`${passes} pass`))
      if (warns) parts.push(pc.yellow(`${warns} warn`))
      if (fails) parts.push(pc.red(`${fails} fail`))
      if (skips) parts.push(pc.dim(`${skips} skip`))

      spinner.stop(
        `  ${pc.green('✓')} Done ${pc.dim(`in ${elapsed}`)} ${pc.dim('—')} ${parts.join(pc.dim(', '))}`,
      )

      result.created++
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      spinner.stop(`  ${pc.red('✗')} Error: ${msg}`)
      result.failed++
    } finally {
      spinner.update(pc.dim('  Cleaning up…'))
      await cleanup()
      currentWorktree = undefined
    }

    console.log()
  }

  process.removeListener('SIGINT', onSignal)
  process.removeListener('SIGTERM', onSignal)

  // Final cleanup
  await exec('git', ['worktree', 'prune'], { cwd })

  // Final progress bar at 100%
  console.log(`  ${progressBar(toProcess.length, toProcess.length)}`)
  console.log()

  // Summary
  const totalElapsed = formatElapsed(Date.now() - totalStart)
  const summaryLine = '═'.repeat(60)
  console.log(pc.bold(summaryLine))
  console.log(pc.bold('  Backfill complete'), pc.dim(`in ${totalElapsed}`))
  console.log(pc.bold(summaryLine))
  console.log()

  const summaryParts: string[] = []
  if (result.created) summaryParts.push(pc.green(`${result.created} created`))
  if (result.existed) summaryParts.push(pc.dim(`${result.existed} already existed`))
  if (result.failed) summaryParts.push(pc.red(`${result.failed} failed`))
  console.log(`  ${summaryParts.join(pc.dim(' · '))}`)

  if (result.created > 0) {
    console.log()
    console.log(
      pc.dim(`  Run ${pc.white('codeweather history')} or ${pc.white('codeweather dashboard')} to see trends`),
    )
  }

  console.log()

  return result
}
