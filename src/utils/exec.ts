import { execa, type Options } from 'execa'

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
