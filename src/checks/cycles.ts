import { existsSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Check, CheckResult, CyclesMetrics } from './types.js'
import type { ResolvedConfig } from '../config.js'
import { exec, ownBin } from '../utils/exec.js'
import { stripFlagPairs } from '../utils/args.js'

interface DepCruiseDependency {
  module?: string
  resolved?: string
  circular?: boolean
}

interface DepCruiseModule {
  source?: string
  dependencies?: DepCruiseDependency[]
}

interface DepCruiseSummary {
  totalCruised?: number
  totalDependenciesCruised?: number
  violations?: unknown
}

interface DepCruiseJsonResult {
  modules?: DepCruiseModule[]
  summary?: DepCruiseSummary
}

function generateDepCruiserConfig(
  tsConfig: string | undefined,
  severity: 'error' | 'warn' | 'info',
): string {
  const tsConfigOption = tsConfig
    ? `tsConfig: { fileName: "./${tsConfig}" },`
    : ''

  return `/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "${severity}",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    ${tsConfigOption}
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
      mainFields: ["module", "main", "types", "typings"],
    },
  },
};
`
}

function buildArgs(
  config: ResolvedConfig,
  configPath: string,
  options: { forceJsonMetrics?: boolean } = {},
): string[] {
  const { cycles } = config
  const includeOnly = cycles.includeOnly ?? `^${config.src}`
  const args = [
    config.src,
    '--config',
    configPath,
    '--include-only',
    includeOnly,
  ]

  if (cycles.exclude) args.push('--exclude', cycles.exclude)
  if (cycles.doNotFollow) args.push('--do-not-follow', cycles.doNotFollow)
  if (cycles.metrics || options.forceJsonMetrics) args.push('--metrics')

  const extraArgs = options.forceJsonMetrics
    ? stripFlagPairs(cycles.args, new Set(['-T', '--output-type', '-f', '--output-to', '-m', '--metrics']))
    : cycles.args

  if (!options.forceJsonMetrics && cycles.cache) args.push('--cache')
  if (options.forceJsonMetrics) {
    args.push('--output-type', 'json')
  }

  args.push(...extraArgs)
  return args
}

function countNestedEntries(value: unknown): number {
  if (Array.isArray(value)) {
    return value.length
  }

  if (value && typeof value === 'object') {
    return Object.values(value).reduce((sum, entry) => sum + countNestedEntries(entry), 0)
  }

  return 0
}

export function parseDepCruiseMetrics(output: string): CyclesMetrics | undefined {
  try {
    const parsed = JSON.parse(output) as DepCruiseJsonResult
    const summary = parsed.summary
    if (!summary) {
      return undefined
    }

    const violationCount = countNestedEntries(summary.violations)
    const circularEdges = (parsed.modules ?? []).reduce((sum, moduleEntry) => (
      sum + (moduleEntry.dependencies ?? []).filter((dependency) => dependency.circular).length
    ), 0)

    return {
      kind: 'cycles',
      totalModules: summary.totalCruised ?? 0,
      totalDependencies: summary.totalDependenciesCruised ?? 0,
      cycleCount: violationCount || circularEdges,
    }
  } catch {
    return undefined
  }
}

async function extractMetrics(
  config: ResolvedConfig,
  configPath: string,
): Promise<CyclesMetrics | undefined> {
  const result = await exec(ownBin('depcruise'), buildArgs(config, configPath, {
    forceJsonMetrics: true,
  }), {
    cwd: config.cwd,
  })

  if (result.exitCode !== 0) {
    return undefined
  }

  return parseDepCruiseMetrics(result.stdout)
}

export const cyclesCheck: Check = {
  name: 'Circular Dependencies',

  async isAvailable() {
    return true
  },

  async run(config: ResolvedConfig): Promise<CheckResult> {
    const { cycles } = config
    const start = Date.now()

    const useOwnConfig = cycles.configFile && existsSync(resolve(config.cwd, cycles.configFile))
    const tmpConfig = resolve(config.cwd, '.codeweather-depcruise.cjs')

    try {
      const configPath = useOwnConfig ? cycles.configFile! : tmpConfig

      if (!useOwnConfig) {
        writeFileSync(
          tmpConfig,
          generateDepCruiserConfig(cycles.tsConfig, cycles.severity),
        )
      }

      const result = await exec(ownBin('depcruise'), buildArgs(config, configPath), {
        cwd: config.cwd,
      })
      const duration = Date.now() - start

      const output = result.stdout

      const metrics = await extractMetrics(config, configPath)
      const hasCycles = metrics
        ? metrics.cycleCount > 0
        : (result.exitCode !== 0 || output.includes('error no-circular'))

      return {
        name: 'Circular Dependencies',
        status: hasCycles ? 'warn' : 'pass',
        summary: hasCycles
          ? 'Circular dependencies detected'
          : 'No circular dependencies found',
        output,
        duration,
        metrics,
      }
    } finally {
      if (!useOwnConfig) {
        try {
          unlinkSync(tmpConfig)
        } catch {
          // Ignore temp cleanup failures.
        }
      }
    }
  },
}
