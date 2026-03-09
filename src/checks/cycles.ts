import { existsSync, writeFileSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Check, CheckResult } from './types.js'
import type { ResolvedConfig } from '../config.js'
import { exec, ownBin } from '../utils/exec.js'

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

export const cyclesCheck: Check = {
  name: 'Circular Dependencies',

  async isAvailable() {
    return true
  },

  async run(config: ResolvedConfig): Promise<CheckResult> {
    const { cycles } = config
    const start = Date.now()

    // If user provides their own dep-cruiser config, use it directly
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
      if (cycles.metrics) args.push('--metrics')
      if (cycles.cache) args.push('--cache')
      args.push(...cycles.args)

      const result = await exec(ownBin('depcruise'), args, { cwd: config.cwd })
      const duration = Date.now() - start

      const output = result.stdout

      const hasCycles = result.exitCode !== 0 || output.includes('error no-circular')

      return {
        name: 'Circular Dependencies',
        status: hasCycles ? 'warn' : 'pass',
        summary: hasCycles
          ? 'Circular dependencies detected'
          : 'No circular dependencies found',
        output,
        duration,
      }
    } finally {
      if (!useOwnConfig) {
        try { unlinkSync(tmpConfig) } catch { /* ignore */ }
      }
    }
  },
}
