import type { Check, CheckResult } from './types.js'
import type { ResolvedConfig } from '../config.js'
import { exec } from '../utils/exec.js'

export const duplicatesCheck: Check = {
  name: 'Code Duplication',

  async isAvailable() {
    return true // jscpd is a bundled dependency
  },

  async run(config: ResolvedConfig): Promise<CheckResult> {
    const start = Date.now()
    const formats = config.duplicates.formats.join(',')
    const result = await exec(
      'npx',
      ['jscpd', `${config.src}/`, '-f', formats, '-g', '--exitCode', '0'],
      { cwd: config.cwd },
    )
    const duration = Date.now() - start

    const output = result.stdout + (result.stderr ? '\n' + result.stderr : '')

    // Check if clones were found
    const hasDuplicates =
      output.includes('Clone found') || output.match(/Found \d+ clones/)

    return {
      name: 'Code Duplication',
      status: hasDuplicates ? 'warn' : 'pass',
      summary: hasDuplicates
        ? 'Duplicate code blocks found'
        : 'No significant duplication detected',
      output: result.stdout,
      duration,
    }
  },
}
