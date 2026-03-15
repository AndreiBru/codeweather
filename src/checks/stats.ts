import type {
  Check,
  CheckResult,
  StatsComplexityMetrics,
  StatsLinesMetrics,
  StatsOverviewMetrics,
  StatsTopFileMetrics,
} from './types.js'
import type { ResolvedConfig } from '../config.js'
import { exec, isOnPath } from '../utils/exec.js'
import { sccInstallHint } from '../utils/detect.js'
import { stripFlagPairs } from '../utils/args.js'

type StatsMode = 'overview' | 'complexity' | 'lines' | 'dry'

interface SccFileEntry {
  Location?: string
  Lines?: number
  Code?: number
  Complexity?: number
}

interface SccLanguageEntry {
  Name?: string
  Count?: number
  Lines?: number
  Code?: number
  Blank?: number
  Comment?: number
  Complexity?: number
  Files?: SccFileEntry[]
}

function globToSccRegex(pattern: string): string {
  const normalized = pattern.replaceAll('\\', '/')
  const directoryOnly = normalized.endsWith('/')
  const trimmed = directoryOnly ? normalized.slice(0, -1) : normalized
  const hasLeadingGlob = trimmed.startsWith('**/')
  const body = hasLeadingGlob ? trimmed.slice(3) : trimmed

  const segments = body
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      if (segment === '**') {
        return '.*'
      }

      return segment
        .replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
        .replaceAll('*', '[^/]*')
    })
    .join('/')

  const prefix = hasLeadingGlob ? '(^|.*/)' : '^'
  const suffix = directoryOnly ? '(/.*)?$' : '$'

  return `${prefix}${segments}${suffix}`
}

function buildArgs(
  config: ResolvedConfig,
  mode: StatsMode,
  options: { forceJson?: boolean } = {},
): string[] {
  const { stats } = config
  const ext = config.extensions.join(',')
  const base = [config.src, '-i', ext]

  if (stats.noCocomo) base.push('--no-cocomo')
  if (stats.noDuplicates) base.push('-d')
  if (!options.forceJson && stats.format) base.push('-f', stats.format)
  for (const pattern of stats.exclude) base.push('-M', globToSccRegex(pattern))
  for (const dir of stats.excludeDir) base.push('--exclude-dir', dir)
  if (stats.excludeExt.length) base.push('-x', stats.excludeExt.join(','))
  if (stats.notMatch) base.push('-M', stats.notMatch)
  if (stats.largeByteCount != null) {
    base.push('--large-byte-count', String(stats.largeByteCount))
  }

  switch (mode) {
    case 'overview':
      if (stats.noMinGen) base.push('--no-min-gen')
      if (stats.wide) base.push('-w')
      break
    case 'complexity':
      if (!options.forceJson) {
        base.push('-w')
      }
      base.push('--by-file', '-s', 'complexity')
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

  const extraArgs = options.forceJson
    ? stripFlagPairs(stats.args, new Set(['-f', '--format', '--format-multi', '-o', '--output']))
    : stats.args

  base.push(...extraArgs)

  if (options.forceJson) {
    base.push('-f', 'json')
  }

  return base
}

function truncateOutput(output: string, top: number): string {
  const lines = output.split('\n')
  let headerEnd = 0
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].startsWith('─') || lines[i].startsWith('—') || lines[i].match(/^-{3,}/)) {
      headerEnd = i + 1
    } else if (headerEnd > 0) {
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

function parseSccJson(output: string): SccLanguageEntry[] | undefined {
  try {
    const parsed = JSON.parse(output)
    return Array.isArray(parsed) ? parsed as SccLanguageEntry[] : undefined
  } catch {
    return undefined
  }
}

function toTopFileMetrics(entry: SccFileEntry): StatsTopFileMetrics | undefined {
  if (!entry.Location) {
    return undefined
  }

  return {
    path: entry.Location,
    lines: entry.Lines ?? 0,
    code: entry.Code ?? 0,
    complexity: entry.Complexity ?? 0,
  }
}

export function parseSccOverviewMetrics(output: string): StatsOverviewMetrics | undefined {
  const rows = parseSccJson(output)
  if (!rows || rows.length === 0) {
    return undefined
  }

  const languages = rows
    .map((row) => ({
      language: row.Name ?? 'Unknown',
      files: row.Count ?? 0,
      lines: row.Lines ?? 0,
      code: row.Code ?? 0,
      complexity: row.Complexity ?? 0,
    }))
    .sort((left, right) => right.lines - left.lines || left.language.localeCompare(right.language))

  return {
    kind: 'stats-overview',
    totalFiles: languages.reduce((sum, language) => sum + language.files, 0),
    totalLines: rows.reduce((sum, row) => sum + (row.Lines ?? 0), 0),
    totalCode: rows.reduce((sum, row) => sum + (row.Code ?? 0), 0),
    totalComplexity: rows.reduce((sum, row) => sum + (row.Complexity ?? 0), 0),
    totalBlanks: rows.reduce((sum, row) => sum + (row.Blank ?? 0), 0),
    totalComments: rows.reduce((sum, row) => sum + (row.Comment ?? 0), 0),
    languages,
  }
}

function parseSccTopFiles(
  output: string,
  sortBy: 'complexity' | 'lines',
  top: number,
): StatsTopFileMetrics[] | undefined {
  const rows = parseSccJson(output)
  if (!rows) {
    return undefined
  }

  const files = rows
    .flatMap((row) => row.Files ?? [])
    .map(toTopFileMetrics)
    .filter((entry): entry is StatsTopFileMetrics => entry != null)

  if (files.length === 0) {
    return undefined
  }

  const sorted = [...files].sort((left, right) => {
    if (sortBy === 'complexity') {
      return (
        right.complexity - left.complexity ||
        right.lines - left.lines ||
        left.path.localeCompare(right.path)
      )
    }

    return (
      right.lines - left.lines ||
      right.complexity - left.complexity ||
      left.path.localeCompare(right.path)
    )
  })

  return sorted.slice(0, top)
}

export function parseSccComplexityMetrics(
  output: string,
  top: number,
): StatsComplexityMetrics | undefined {
  const topFiles = parseSccTopFiles(output, 'complexity', top)
  if (!topFiles) {
    return undefined
  }

  return {
    kind: 'stats-complexity',
    topFiles,
  }
}

export function parseSccLinesMetrics(
  output: string,
  top: number,
): StatsLinesMetrics | undefined {
  const topFiles = parseSccTopFiles(output, 'lines', top)
  if (!topFiles) {
    return undefined
  }

  return {
    kind: 'stats-lines',
    topFiles,
  }
}

async function extractMetrics(
  config: ResolvedConfig,
  mode: StatsMode,
): Promise<{ metrics: CheckResult['metrics']; artifacts: CheckResult['artifacts'] }> {
  if (mode === 'dry') {
    return { metrics: undefined, artifacts: undefined }
  }

  const metricResult = await exec('scc', buildArgs(config, mode, { forceJson: true }), {
    cwd: config.cwd,
  })

  if (metricResult.exitCode !== 0) {
    return { metrics: undefined, artifacts: undefined }
  }

  const artifacts: CheckResult['artifacts'] = [
    {
      id: `stats-${mode}`,
      format: 'json',
      data: parseSccJson(metricResult.stdout) ?? [],
    },
  ]

  switch (mode) {
    case 'overview':
      return {
        metrics: parseSccOverviewMetrics(metricResult.stdout),
        artifacts,
      }
    case 'complexity':
      return {
        metrics: parseSccComplexityMetrics(metricResult.stdout, config.stats.top),
        artifacts,
      }
    case 'lines':
      return {
        metrics: parseSccLinesMetrics(metricResult.stdout, config.stats.top),
        artifacts,
      }
    case 'dry':
      return { metrics: undefined, artifacts: undefined }
  }
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

      const { metrics, artifacts } = await extractMetrics(config, mode)

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
        metrics,
        artifacts,
      }
    },
  }
}

export const statsOverview = createStatsCheck('overview', 'Codebase Stats')
export const statsComplexity = createStatsCheck('complexity', 'Top Complexity')
export const statsLines = createStatsCheck('lines', 'Top File Size')
export const statsDry = createStatsCheck('dry', 'DRYness Score')
