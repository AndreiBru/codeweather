import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Check, CheckResult, DuplicatesMetrics } from './types.js'
import type { ResolvedConfig } from '../config.js'
import { exec, ownBin } from '../utils/exec.js'
import { stripFlagPairs } from '../utils/args.js'

interface JscpdReport {
  duplicates?: unknown[]
  statistic?: {
    total?: {
      clones?: number
      percentage?: number
      percentageTokens?: number
      lines?: number
    }
  }
  statistics?: {
    total?: {
      clones?: number
      percentage?: number
      percentageTokens?: number
      lines?: number
    }
  }
}

function buildArgs(
  config: ResolvedConfig,
  options: { jsonOutputDir?: string } = {},
): string[] {
  const { duplicates: duplicatesConfig } = config
  const formats = duplicatesConfig.formats.join(',')

  const args = [`${config.src}/`, '-f', formats, '--exitCode', '0']
  if (duplicatesConfig.gitignore) args.push('-g')
  if (duplicatesConfig.configFile) args.push('-c', duplicatesConfig.configFile)
  if (duplicatesConfig.minLines != null) args.push('-l', String(duplicatesConfig.minLines))
  if (duplicatesConfig.minTokens != null) args.push('-k', String(duplicatesConfig.minTokens))
  if (duplicatesConfig.maxLines != null) args.push('-x', String(duplicatesConfig.maxLines))
  if (duplicatesConfig.maxSize) args.push('-z', duplicatesConfig.maxSize)
  if (duplicatesConfig.threshold != null) args.push('-t', String(duplicatesConfig.threshold))
  if (duplicatesConfig.mode !== 'mild') args.push('-m', duplicatesConfig.mode)
  if (duplicatesConfig.skipLocal) args.push('--skipLocal')
  if (duplicatesConfig.ignorePattern) args.push('--ignore-pattern', duplicatesConfig.ignorePattern)
  for (const ignore of duplicatesConfig.ignore) args.push('-i', ignore)

  const extraArgs = options.jsonOutputDir
    ? stripFlagPairs(duplicatesConfig.args, new Set(['-r', '--reporters', '-o', '--output']))
    : duplicatesConfig.args

  if (!options.jsonOutputDir && duplicatesConfig.reporters.length) {
    args.push('-r', duplicatesConfig.reporters.join(','))
  }

  args.push(...extraArgs)

  if (options.jsonOutputDir) {
    args.push('-r', 'json', '-o', options.jsonOutputDir)
  }

  return args
}

export function parseJscpdMetrics(output: string): DuplicatesMetrics | undefined {
  try {
    const parsed = JSON.parse(output) as JscpdReport
    const totals = parsed.statistics?.total ?? parsed.statistic?.total
    if (!totals) {
      return undefined
    }

    return {
      kind: 'duplicates',
      totalClones: totals.clones ?? 0,
      duplicatedLinesPercent: totals.percentage ?? 0,
      duplicatedTokensPercent: totals.percentageTokens ?? 0,
      totalLines: totals.lines ?? 0,
    }
  } catch {
    return undefined
  }
}

async function extractMetrics(
  config: ResolvedConfig,
): Promise<{ metrics?: DuplicatesMetrics; artifacts?: CheckResult['artifacts'] }> {
  const outputDir = mkdtempSync(join(tmpdir(), 'codeweather-jscpd-'))
  const reportPath = resolve(outputDir, 'jscpd-report.json')

  try {
    const result = await exec(ownBin('jscpd'), buildArgs(config, { jsonOutputDir: outputDir }), {
      cwd: config.cwd,
    })

    if (result.exitCode !== 0 || !existsSync(reportPath)) {
      return { metrics: undefined, artifacts: undefined }
    }

    const report = readFileSync(reportPath, 'utf8')
    let artifact: JscpdReport | undefined
    try {
      artifact = JSON.parse(report) as JscpdReport
    } catch {
      artifact = undefined
    }

    return {
      metrics: parseJscpdMetrics(report),
      artifacts: artifact
        ? [{ id: 'duplicates', format: 'json', data: artifact }]
        : undefined,
    }
  } finally {
    rmSync(outputDir, { recursive: true, force: true })
  }
}

export const duplicatesCheck: Check = {
  name: 'Code Duplication',

  async isAvailable() {
    return true
  },

  async run(config: ResolvedConfig): Promise<CheckResult> {
    const start = Date.now()
    const result = await exec(ownBin('jscpd'), buildArgs(config), { cwd: config.cwd })
    const duration = Date.now() - start

    const output = result.stdout + (result.stderr ? '\n' + result.stderr : '')
    const { metrics, artifacts } = await extractMetrics(config)

    const hasDuplicates = metrics
      ? metrics.totalClones > 0
      : (
        output.includes('Clone found') || output.match(/Found \d+ clones/)
      )

    return {
      name: 'Code Duplication',
      status: hasDuplicates ? 'warn' : 'pass',
      summary: hasDuplicates
        ? 'Duplicate code blocks found'
        : 'No significant duplication detected',
      output: result.stdout,
      duration,
      metrics,
      artifacts,
    }
  },
}
