import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa, type Options } from 'execa'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG_BIN = resolve(__dirname, '..', 'node_modules', '.bin')

/** Resolve a bundled binary (knip, jscpd, depcruise) from codeaudit's own node_modules */
export function ownBin(name: string): string {
  return resolve(PKG_BIN, name)
}

export interface ExecResult {
  stdout: string
  stderr: string
  exitCode: number
}

export async function exec(
  command: string,
  args: string[],
  options?: Options,
): Promise<ExecResult> {
  try {
    const result = await execa(command, args, {
      reject: false,
      ...options,
    })
    return {
      stdout: result.stdout as string,
      stderr: result.stderr as string,
      exitCode: result.exitCode,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { stdout: '', stderr: message, exitCode: 1 }
  }
}

export async function isOnPath(binary: string): Promise<boolean> {
  const { exitCode } = await exec('which', [binary])
  return exitCode === 0
}
