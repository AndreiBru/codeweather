import type { Check, CheckResult } from './types.js'
import type { ResolvedConfig } from '../config.js'
import { exec, ownBin } from '../utils/exec.js'

export const unusedCheck: Check = {
  name: 'Unused Code',

  async isAvailable() {
    return true
  },

  async run(config: ResolvedConfig): Promise<CheckResult> {
    const { unused } = config
    const start = Date.now()

    const args = ['--no-exit-code']
    if (unused.configFile) args.push('--config', unused.configFile)
    if (unused.production) args.push('--production')
    if (unused.strict) args.push('--strict')
    if (unused.reporter) args.push('--reporter', unused.reporter)
    if (unused.workspace) args.push('--workspace', unused.workspace)
    if (unused.includeEntryExports) args.push('--include-entry-exports')
    if (unused.cache) args.push('--cache')
    if (unused.maxIssues != null) args.push('--max-issues', String(unused.maxIssues))
    for (const i of unused.include) args.push('--include', i)
    for (const e of unused.exclude) args.push('--exclude', e)
    for (const t of unused.tags) args.push('--tags', t)
    args.push(...unused.args)

    const result = await exec(ownBin('knip'), args, { cwd: config.cwd })
    const duration = Date.now() - start

    const output = result.stdout

    const hasIssues =
      output.includes('Unused') ||
      output.includes('unused') ||
      output.includes('Unlisted')

    return {
      name: 'Unused Code',
      status: hasIssues ? 'warn' : 'pass',
      summary: hasIssues ? 'Unused exports or dependencies found' : 'No unused code detected',
      output,
      duration,
    }
  },
}
