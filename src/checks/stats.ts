import type { Check, CheckResult } from './types.js'
import type { ResolvedConfig } from '../config.js'
import { exec, isOnPath } from '../utils/exec.js'
import { sccInstallHint } from '../utils/detect.js'

type StatsMode = 'overview' | 'complexity' | 'lines' | 'dry'

function buildArgs(config: ResolvedConfig, mode: StatsMode): string[] {
  const ext = config.extensions.join(',')
  const base = [config.src, '--no-cocomo', '-i', ext]

  switch (mode) {
    case 'overview':
      return [...base, '--no-min-gen']
    case 'complexity':
      return [
        ...base,
        '-w',
        '--by-file',
        '-s',
        'complexity',
        '--large-line-count',
        '99999',
      ]
    case 'lines':
      return [
        ...base,
        '--by-file',
        '-s',
        'lines',
        '--large-line-count',
        '99999',
      ]
    case 'dry':
      return [...base, '-a']
  }
}

function truncateOutput(output: string, top: number): string {
  const lines = output.split('\n')
  // Find the header separator line(s) and keep header + top data lines
  let headerEnd = 0
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('─') || lines[i].startsWith('—') || lines[i].match(/^-{3,}/)) {
      headerEnd = i + 1
      break
    }
  }
  if (headerEnd === 0) {
    // No separator found, just truncate
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
