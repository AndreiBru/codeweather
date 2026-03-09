import pc from 'picocolors'
import type { CheckResult } from './checks/types.js'

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

  for (const r of results) {
    const icon = statusIcon(r.status)
    const dur = pc.dim(formatDuration(r.duration))
    console.log(`  ${icon} ${pc.bold(r.name.padEnd(24))} ${r.summary.padEnd(40)} ${dur}`)
  }

  const passed = results.filter((r) => r.status === 'pass').length
  const warned = results.filter((r) => r.status === 'warn').length
  const failed = results.filter((r) => r.status === 'fail').length
  const skipped = results.filter((r) => r.status === 'skip').length

  const parts: string[] = []
  if (passed) parts.push(pc.green(`${passed} passed`))
  if (warned) parts.push(pc.yellow(`${warned} warnings`))
  if (failed) parts.push(pc.red(`${failed} failed`))
  if (skipped) parts.push(pc.dim(`${skipped} skipped`))

  console.log(`\n  ${parts.join(', ')}\n`)
}

export function toJson(results: CheckResult[]): string {
  return JSON.stringify(
    results.map((r) => ({
      name: r.name,
      status: r.status,
      summary: r.summary,
      duration: r.duration,
      output: r.output,
    })),
    null,
    2,
  )
}

function mdStatusIcon(status: CheckResult['status']): string {
  switch (status) {
    case 'pass': return '\u2705'
    case 'warn': return '\u26A0\uFE0F'
    case 'fail': return '\u274C'
    case 'skip': return '\u23ED\uFE0F'
  }
}

// Strip ANSI escape codes so markdown output is clean
function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*m/g, '')
}

export function toMarkdown(results: CheckResult[]): string {
  const now = new Date()
  const timestamp = now.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')

  const lines: string[] = []
  lines.push('# Codeweather Report')
  lines.push('')
  lines.push(`> Generated on ${timestamp}`)
  lines.push('')

  // Summary table
  lines.push('## Summary')
  lines.push('')
  lines.push('| Status | Check | Result | Duration |')
  lines.push('|--------|-------|--------|----------|')
  for (const r of results) {
    const icon = mdStatusIcon(r.status)
    lines.push(`| ${icon} | **${r.name}** | ${r.summary} | ${formatDuration(r.duration)} |`)
  }
  lines.push('')

  const passed = results.filter((r) => r.status === 'pass').length
  const warned = results.filter((r) => r.status === 'warn').length
  const failed = results.filter((r) => r.status === 'fail').length
  const skipped = results.filter((r) => r.status === 'skip').length
  const parts: string[] = []
  if (passed) parts.push(`${passed} passed`)
  if (warned) parts.push(`${warned} warnings`)
  if (failed) parts.push(`${failed} failed`)
  if (skipped) parts.push(`${skipped} skipped`)
  lines.push(`**${parts.join(' · ')}**`)
  lines.push('')

  // Detail sections
  lines.push('---')
  lines.push('')
  for (const r of results) {
    lines.push(`## ${mdStatusIcon(r.status)} ${r.name}`)
    lines.push('')
    if (r.output.trim()) {
      lines.push('```')
      lines.push(stripAnsi(r.output.trim()))
      lines.push('```')
    } else {
      lines.push('_No output._')
    }
    lines.push('')
  }

  return lines.join('\n')
}
