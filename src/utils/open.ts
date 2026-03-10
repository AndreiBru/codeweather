import { exec, isOnPath } from './exec.js'

export async function openPath(target: string, cwd: string): Promise<boolean> {
  if (process.platform === 'darwin') {
    const result = await exec('open', [target], { cwd })
    return result.exitCode === 0
  }

  if (process.platform === 'win32') {
    const result = await exec('cmd', ['/c', 'start', '', target], { cwd })
    return result.exitCode === 0
  }

  const hasXdgOpen = await isOnPath('xdg-open')
  if (!hasXdgOpen) {
    return false
  }

  const result = await exec('xdg-open', [target], { cwd })
  return result.exitCode === 0
}
