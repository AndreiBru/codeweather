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

const defaultChecks: Check[] = [
  statsOverview,
  statsComplexity,
  statsLines,
  unusedCheck,
  duplicatesCheck,
  cyclesCheck,
]

export async function runAll(config: ResolvedConfig): Promise<number> {
  const runStart = Date.now()
  const results: CheckResult[] = []
  const previousSnapshot = config.history.enabled
    ? loadLatestSnapshot(config.cwd, config.history.dir)
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
  const md = toMarkdown(results, { trendLine })
  const outPath = resolve(config.cwd, 'codeweather-report.md')
  writeFileSync(outPath, md)

  const duration = Date.now() - runStart

  if (config.history.enabled) {
    const git = await getGitMeta(config.cwd)
    saveSnapshot({
      cwd: config.cwd,
      historyDir: config.history.dir,
      results,
      duration,
      git,
    })

    if (config.history.maxSnapshots != null) {
      pruneSnapshots(config.cwd, config.history.dir, config.history.maxSnapshots)
    }
  }

  if (!config.json && previousSnapshot) {
    printDelta(results, previousSnapshot)
  }

  if (!config.json) {
    console.log(`  Report saved to ${outPath}\n`)
  }

  return results.some((result) => result.status === 'fail') ? 1 : 0
}
