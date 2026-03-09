import type { ResolvedConfig } from '../config.js'

export interface CheckResult {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  summary: string
  output: string
  duration: number
}

export interface Check {
  name: string
  isAvailable(): Promise<boolean>
  run(config: ResolvedConfig): Promise<CheckResult>
}
