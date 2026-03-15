import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Check, CheckResult } from './checks/types.js'
import type { ResolvedConfig } from './config.js'
import { statsOverview, statsComplexity, statsLines } from './checks/stats.js'
import { unusedCheck } from './checks/unused.js'
import { duplicatesCheck } from './checks/duplicates.js'
import { cyclesCheck } from './checks/cycles.js'
import {
  getTrendLine,
  printDelta,
  printResult,
  printSummary,
  toJson,
  toMarkdown,
} from './output.js'
import { getGitMeta } from './history/git.js'
import { loadLatestSnapshot, pruneSnapshots, saveSnapshot } from './history/store.js'
import type { SnapshotGitMeta, SnapshotSummary } from './history/types.js'

const defaultChecks: Check[] = [
  statsOverview,
  statsComplexity,
  statsLines,
  unusedCheck,
  duplicatesCheck,
  cyclesCheck,
]

export interface RunAllOptions {
  outputCwd?: string
  previousSnapshot?: SnapshotSummary | null
  snapshotGit?: SnapshotGitMeta
  snapshotTimestamp?: string
  writeRootReport?: boolean
  printDelta?: boolean
}

export async function runAll(
  config: ResolvedConfig,
  options: RunAllOptions = {},
): Promise<number> {
  const runStart = Date.now()
  const results: CheckResult[] = []
  const outputCwd = options.outputCwd ?? config.cwd
  const previousSnapshot = config.history.enabled
    ? options.previousSnapshot === undefined
      ? loadLatestSnapshot(outputCwd, config.history.dir)
      : (options.previousSnapshot ?? undefined)
    : undefined

  for (const check of defaultChecks) {
    const result = await check.run(config)
    results.push(result)

    if (!config.json) {
      printResult(result)
    }
  }

  if (config.json) {
    console.log(toJson(results))
  } else {
    printSummary(results)
  }

  const trendLine = previousSnapshot ? getTrendLine(results, previousSnapshot) : undefined
  const md = toMarkdown(results, { trendLine, top: config.top })
  const shouldWriteRootReport = options.writeRootReport ?? true
  const outPath = resolve(outputCwd, 'codeweather-report.md')
  if (shouldWriteRootReport) {
    writeFileSync(outPath, md)
  }

  const duration = Date.now() - runStart

  if (config.history.enabled) {
    const git = options.snapshotGit ?? await getGitMeta(config.cwd)
    saveSnapshot({
      cwd: outputCwd,
      src: config.src,
      historyDir: config.history.dir,
      results,
      top: config.top,
      duration,
      report: md,
      git,
      timestamp: options.snapshotTimestamp,
    })

    if (config.history.maxSnapshots != null) {
      pruneSnapshots(outputCwd, config.history.dir, config.history.maxSnapshots)
    }
  }

  if (!config.json && previousSnapshot && (options.printDelta ?? true)) {
    printDelta(results, previousSnapshot)
  }

  if (!config.json && shouldWriteRootReport) {
    console.log(`  Report saved to ${outPath}\n`)
  }

  return results.some((result) => result.status === 'fail') ? 1 : 0
}
