import type { Check, CheckResult } from './types.js'
import type { ResolvedConfig } from '../config.js'
import { exec, ownBin } from '../utils/exec.js'

export const unusedCheck: Check = {
  name: 'Unused Code',

  async isAvailable() {
    return true // knip is a bundled dependency
  },

  async run(config: ResolvedConfig): Promise<CheckResult> {
    const start = Date.now()
    const result = await exec(ownBin('knip'), ['--no-exit-code'], {
      cwd: config.cwd,
    })
    const duration = Date.now() - start

    const output = result.stdout

    // Check if knip found any issues
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
