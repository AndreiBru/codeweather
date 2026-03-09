import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { isOnPath } from './exec.js'

export function detectSrcDir(cwd: string): string {
  const srcDir = resolve(cwd, 'src')
  if (existsSync(srcDir)) return 'src'
  return '.'
}

export function detectTsConfig(cwd: string): string | undefined {
  const candidates = [
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.build.json',
  ]
  for (const name of candidates) {
    if (existsSync(resolve(cwd, name))) return name
  }
  return undefined
}

export async function detectBinaries(): Promise<{
  hasScc: boolean
  hasDot: boolean
}> {
  const [hasScc, hasDot] = await Promise.all([
    isOnPath('scc'),
    isOnPath('dot'),
  ])
  return { hasScc, hasDot }
}

export function sccInstallHint(): string {
  return (
    'scc is not installed. Install it:\n' +
    '  macOS:  brew install scc\n' +
    '  go:     go install github.com/boyter/scc/v3@latest\n' +
    '  other:  https://github.com/boyter/scc#install'
  )
}

export function graphvizInstallHint(): string {
  return (
    'graphviz (dot) is not installed. Install it:\n' +
    '  macOS:  brew install graphviz\n' +
    '  apt:    sudo apt install graphviz\n' +
    '  other:  https://graphviz.org/download/'
  )
}
