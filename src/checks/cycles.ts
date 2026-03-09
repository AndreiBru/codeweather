import { writeFileSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Check, CheckResult } from './types.js'
import type { ResolvedConfig } from '../config.js'
import { exec } from '../utils/exec.js'

function generateDepCruiserConfig(tsConfig: string | undefined): string {
  const tsConfigOption = tsConfig
    ? `tsConfig: { fileName: "./${tsConfig}" },`
    : ''

  return `/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
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
    return true // dependency-cruiser is a bundled dependency
  },

  async run(config: ResolvedConfig): Promise<CheckResult> {
    const start = Date.now()
    const tmpConfig = resolve(config.cwd, '.codeaudit-depcruise.cjs')

    try {
      // Write temporary config
      writeFileSync(
        tmpConfig,
        generateDepCruiserConfig(config.cycles.tsConfig),
      )

      const result = await exec(
        'npx',
        [
          'depcruise',
          config.src,
          '--config',
          tmpConfig,
          '--include-only',
          `^${config.src}`,
        ],
        { cwd: config.cwd },
      )
      const duration = Date.now() - start

      const output = result.stdout

      // dependency-cruiser exits 1 when violations are found
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
      try {
        unlinkSync(tmpConfig)
      } catch {
        // ignore cleanup errors
      }
    }
  },
}
