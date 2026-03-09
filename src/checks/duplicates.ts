import type { Check, CheckResult } from './types.js'
import type { ResolvedConfig } from '../config.js'
import { exec, ownBin } from '../utils/exec.js'

export const duplicatesCheck: Check = {
  name: 'Code Duplication',

  async isAvailable() {
    return true
  },

  async run(config: ResolvedConfig): Promise<CheckResult> {
    const { duplicates: d } = config
    const start = Date.now()
    const formats = d.formats.join(',')

    const args = [`${config.src}/`, '-f', formats, '--exitCode', '0']
    if (d.gitignore) args.push('-g')
    if (d.configFile) args.push('-c', d.configFile)
    if (d.minLines != null) args.push('-l', String(d.minLines))
    if (d.minTokens != null) args.push('-k', String(d.minTokens))
    if (d.maxLines != null) args.push('-x', String(d.maxLines))
    if (d.maxSize) args.push('-z', d.maxSize)
    if (d.threshold != null) args.push('-t', String(d.threshold))
    if (d.mode !== 'mild') args.push('-m', d.mode)
    if (d.skipLocal) args.push('--skipLocal')
    if (d.ignorePattern) args.push('--ignore-pattern', d.ignorePattern)
    for (const i of d.ignore) args.push('-i', i)
    if (d.reporters.length) args.push('-r', d.reporters.join(','))
    args.push(...d.args)

    const result = await exec(ownBin('jscpd'), args, { cwd: config.cwd })
    const duration = Date.now() - start

    const output = result.stdout + (result.stderr ? '\n' + result.stderr : '')

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
