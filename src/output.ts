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
