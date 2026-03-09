import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Check, CheckResult } from './checks/types.js'
import type { ResolvedConfig } from './config.js'
import { statsOverview, statsComplexity, statsLines } from './checks/stats.js'
import { unusedCheck } from './checks/unused.js'
import { duplicatesCheck } from './checks/duplicates.js'
import { cyclesCheck } from './checks/cycles.js'
import { printResult, printSummary, toJson, toMarkdown } from './output.js'

const defaultChecks: Check[] = [
  statsOverview,
  statsComplexity,
  statsLines,
  unusedCheck,
  duplicatesCheck,
  cyclesCheck,
]

export async function runAll(config: ResolvedConfig): Promise<number> {
  const results: CheckResult[] = []

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

  // Write markdown report
  const md = toMarkdown(results)
  const outPath = resolve(config.cwd, 'codeweather-report.md')
  writeFileSync(outPath, md)
  if (!config.json) {
    console.log(`  Report saved to ${outPath}\n`)
  }

  return results.some((r) => r.status === 'fail') ? 1 : 0
}
