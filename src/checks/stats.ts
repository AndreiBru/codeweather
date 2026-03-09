import type { Check, CheckResult } from './types.js'
import type { ResolvedConfig } from '../config.js'
import { exec, isOnPath } from '../utils/exec.js'
import { sccInstallHint } from '../utils/detect.js'

type StatsMode = 'overview' | 'complexity' | 'lines' | 'dry'

function buildArgs(config: ResolvedConfig, mode: StatsMode): string[] {
  const { stats } = config
  const ext = config.extensions.join(',')
  const base = [config.src, '-i', ext]

  if (stats.noCocomo) base.push('--no-cocomo')
  if (stats.noDuplicates) base.push('-d')
  if (stats.format) base.push('-f', stats.format)
  for (const dir of stats.excludeDir) base.push('--exclude-dir', dir)
  if (stats.excludeExt.length) base.push('-x', stats.excludeExt.join(','))
  if (stats.notMatch) base.push('-M', stats.notMatch)
  if (stats.largeByteCount != null) base.push('--large-byte-count', String(stats.largeByteCount))

  switch (mode) {
    case 'overview':
      if (stats.noMinGen) base.push('--no-min-gen')
      if (stats.wide) base.push('-w')
      break
    case 'complexity':
      base.push('-w', '--by-file', '-s', 'complexity')
      base.push('--large-line-count', String(stats.largeLineCount ?? 99999))
      break
    case 'lines':
      base.push('--by-file', '-s', 'lines')
      base.push('--large-line-count', String(stats.largeLineCount ?? 99999))
      break
    case 'dry':
      base.push('-a')
      break
  }

  base.push(...stats.args)
  return base
}

function truncateOutput(output: string, top: number): string {
  const lines = output.split('\n')
  let headerEnd = 0
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('─') || lines[i].startsWith('—') || lines[i].match(/^-{3,}/)) {
      headerEnd = i + 1
      break
    }
  }
  if (headerEnd === 0) {
    return lines.slice(0, top + 3).join('\n')
  }
  const header = lines.slice(0, headerEnd)
  const data = lines.slice(headerEnd, headerEnd + top)
  return [...header, ...data].join('\n')
}

function createStatsCheck(mode: StatsMode, displayName: string): Check {
  return {
    name: displayName,
    async isAvailable() {
      return isOnPath('scc')
    },
    async run(config: ResolvedConfig): Promise<CheckResult> {
      const available = await this.isAvailable()
      if (!available) {
        return {
          name: displayName,
          status: 'skip',
          summary: 'scc not installed',
          output: sccInstallHint(),
          duration: 0,
        }
      }

      const start = Date.now()
      const args = buildArgs(config, mode)
      const result = await exec('scc', args, { cwd: config.cwd })
      const duration = Date.now() - start

      if (result.exitCode !== 0) {
        return {
          name: displayName,
          status: 'fail',
          summary: 'scc failed',
          output: result.stderr || result.stdout,
          duration,
        }
      }

      let output = result.stdout
      if (mode === 'complexity' || mode === 'lines') {
        output = truncateOutput(output, config.stats.top)
      }

      return {
        name: displayName,
        status: 'pass',
        summary:
          mode === 'overview'
            ? 'Codebase overview generated'
            : mode === 'dry'
              ? 'DRYness analysis complete'
              : `Top ${config.stats.top} files by ${mode}`,
        output,
        duration,
      }
    },
  }
}

export const statsOverview = createStatsCheck('overview', 'Codebase Stats')
export const statsComplexity = createStatsCheck('complexity', 'Top Complexity')
export const statsLines = createStatsCheck('lines', 'Top File Size')
export const statsDry = createStatsCheck('dry', 'DRYness Score')
