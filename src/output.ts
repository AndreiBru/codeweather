import pc from 'picocolors'
import type {
  CheckResult,
  CyclesMetrics,
  DuplicatesMetrics,
  StatsOverviewMetrics,
  UnusedMetrics,
} from './checks/types.js'
import { findMetric } from './checks/metrics.js'
import type { Snapshot, SnapshotCheck } from './history/types.js'

export function header(title: string): string {
  const line = '─'.repeat(60)
  return `\n${pc.cyan(line)}\n${pc.bold(pc.cyan(`  ${title}`))}\n${pc.cyan(line)}`
}

export function statusIcon(status: CheckResult['status']): string {
  switch (status) {
    case 'pass':
      return pc.green('✓')
    case 'warn':
      return pc.yellow('⚠')
    case 'fail':
      return pc.red('✗')
    case 'skip':
      return pc.dim('○')
  }
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function printResult(result: CheckResult): void {
  console.log(header(result.name))
  if (result.output) {
    console.log(result.output)
  }
  const icon = statusIcon(result.status)
  const dur = pc.dim(`(${formatDuration(result.duration)})`)
  console.log(`\n${icon} ${result.summary} ${dur}`)
}

export function printSummary(results: CheckResult[]): void {
  const line = '═'.repeat(60)
  console.log(`\n${pc.bold(line)}`)
  console.log(pc.bold('  Summary'))
  console.log(`${pc.bold(line)}\n`)

  for (const result of results) {
    const icon = statusIcon(result.status)
    const dur = pc.dim(formatDuration(result.duration))
    console.log(`  ${icon} ${pc.bold(result.name.padEnd(24))} ${result.summary.padEnd(40)} ${dur}`)
  }

  const passed = results.filter((result) => result.status === 'pass').length
  const warned = results.filter((result) => result.status === 'warn').length
  const failed = results.filter((result) => result.status === 'fail').length
  const skipped = results.filter((result) => result.status === 'skip').length

  const parts: string[] = []
  if (passed) parts.push(pc.green(`${passed} passed`))
  if (warned) parts.push(pc.yellow(`${warned} warnings`))
  if (failed) parts.push(pc.red(`${failed} failed`))
  if (skipped) parts.push(pc.dim(`${skipped} skipped`))

  console.log(`\n  ${parts.join(', ')}\n`)
}

function formatNumber(value: number): string {
  return value.toLocaleString('en-US')
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

function formatDelta(value: number, options: { decimals?: number } = {}): string {
  const decimals = options.decimals ?? 0
  const rounded = Number(value.toFixed(decimals))

  if (rounded === 0) {
    return '='
  }

  const absolute = Math.abs(rounded)
  const formatted = decimals > 0
    ? absolute.toFixed(decimals)
    : formatNumber(Math.round(absolute))

  return rounded > 0 ? `+${formatted}` : `-${formatted}`
}

function formatPercentDelta(value: number): string {
  const formatted = formatDelta(value, { decimals: 1 })
  return formatted === '=' ? formatted : `${formatted}%`
}

export function getTrendLine(
  results: CheckResult[],
  previousSnapshot: Snapshot,
): string | undefined {
  const currentStats = findMetric(results, 'stats-overview') as StatsOverviewMetrics | undefined
  const currentUnused = findMetric(results, 'unused') as UnusedMetrics | undefined
  const currentDuplicates = findMetric(results, 'duplicates') as DuplicatesMetrics | undefined
  const currentCycles = findMetric(results, 'cycles') as CyclesMetrics | undefined

  const previousChecks = previousSnapshot.checks as SnapshotCheck[]
  const previousStats = findMetric(previousChecks, 'stats-overview') as StatsOverviewMetrics | undefined
  const previousUnused = findMetric(previousChecks, 'unused') as UnusedMetrics | undefined
  const previousDuplicates = findMetric(previousChecks, 'duplicates') as DuplicatesMetrics | undefined
  const previousCycles = findMetric(previousChecks, 'cycles') as CyclesMetrics | undefined

  if (
    !currentStats ||
    !currentUnused ||
    !currentDuplicates ||
    !currentCycles ||
    !previousStats ||
    !previousUnused ||
    !previousDuplicates ||
    !previousCycles
  ) {
    return undefined
  }

  return [
    `Lines ${formatNumber(currentStats.totalLines)} (${formatDelta(currentStats.totalLines - previousStats.totalLines)})`,
    `Complexity ${formatNumber(currentStats.totalComplexity)} (${formatDelta(currentStats.totalComplexity - previousStats.totalComplexity)})`,
    `Unused ${formatNumber(currentUnused.totalIssues)} (${formatDelta(currentUnused.totalIssues - previousUnused.totalIssues)})`,
    `Duplication ${formatPercent(currentDuplicates.duplicatedLinesPercent)} (${formatPercentDelta(currentDuplicates.duplicatedLinesPercent - previousDuplicates.duplicatedLinesPercent)})`,
    `Cycles ${formatNumber(currentCycles.cycleCount)} (${formatDelta(currentCycles.cycleCount - previousCycles.cycleCount)})`,
  ].join(' · ')
}

export function printDelta(results: CheckResult[], previousSnapshot: Snapshot): void {
  const trendLine = getTrendLine(results, previousSnapshot)
  if (!trendLine) {
    return
  }

  console.log(pc.dim(`  Trend: ${trendLine}\n`))
}

export function toJson(results: CheckResult[]): string {
  return JSON.stringify(
    results.map((result) => ({
      name: result.name,
      status: result.status,
      summary: result.summary,
      duration: result.duration,
      output: result.output,
      metrics: result.metrics,
    })),
    null,
    2,
  )
}

function mdStatusIcon(status: CheckResult['status']): string {
  switch (status) {
    case 'pass':
      return '\u2705'
    case 'warn':
      return '\u26A0\uFE0F'
    case 'fail':
      return '\u274C'
    case 'skip':
      return '\u23ED\uFE0F'
  }
}

function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*m/g, '')
}

export function toMarkdown(
  results: CheckResult[],
  options: { trendLine?: string } = {},
): string {
  const now = new Date()
  const timestamp = now.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')

  const lines: string[] = []
  lines.push('# Codeweather Report')
  lines.push('')
  lines.push(`> Generated on ${timestamp}`)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('| Status | Check | Result | Duration |')
  lines.push('|--------|-------|--------|----------|')
  for (const result of results) {
    const icon = mdStatusIcon(result.status)
    lines.push(`| ${icon} | **${result.name}** | ${result.summary} | ${formatDuration(result.duration)} |`)
  }
  lines.push('')

  const passed = results.filter((result) => result.status === 'pass').length
  const warned = results.filter((result) => result.status === 'warn').length
  const failed = results.filter((result) => result.status === 'fail').length
  const skipped = results.filter((result) => result.status === 'skip').length
  const parts: string[] = []
  if (passed) parts.push(`${passed} passed`)
  if (warned) parts.push(`${warned} warnings`)
  if (failed) parts.push(`${failed} failed`)
  if (skipped) parts.push(`${skipped} skipped`)
  lines.push(`**${parts.join(' · ')}**`)
  lines.push('')
  if (options.trendLine) {
    lines.push(`> Trend: ${options.trendLine}`)
    lines.push('')
  }
  lines.push('---')
  lines.push('')

  for (const result of results) {
    lines.push(`## ${mdStatusIcon(result.status)} ${result.name}`)
    lines.push('')
    if (result.output.trim()) {
      lines.push('```')
      lines.push(stripAnsi(result.output.trim()))
      lines.push('```')
    } else {
      lines.push('_No output._')
    }
    lines.push('')
  }

  return lines.join('\n')
}
