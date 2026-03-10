import type { ResolvedConfig } from '../config.js'

export interface StatsLanguageMetrics {
  language: string
  files: number
  lines: number
  code: number
  complexity: number
}

export interface StatsTopFileMetrics {
  path: string
  lines: number
  code: number
  complexity: number
}

export interface StatsOverviewMetrics {
  kind: 'stats-overview'
  totalFiles: number
  totalLines: number
  totalCode: number
  totalComplexity: number
  totalBlanks: number
  totalComments: number
  languages: StatsLanguageMetrics[]
}

export interface StatsComplexityMetrics {
  kind: 'stats-complexity'
  topFiles: StatsTopFileMetrics[]
}

export interface StatsLinesMetrics {
  kind: 'stats-lines'
  topFiles: StatsTopFileMetrics[]
}

export interface UnusedMetrics {
  kind: 'unused'
  unusedFiles: number
  unusedExports: number
  unusedTypes: number
  unusedDependencies: number
  totalIssues: number
}

export interface DuplicatesMetrics {
  kind: 'duplicates'
  totalClones: number
  duplicatedLinesPercent: number
  duplicatedTokensPercent: number
  totalLines: number
}

export interface CyclesMetrics {
  kind: 'cycles'
  totalModules: number
  totalDependencies: number
  cycleCount: number
}

export type CheckMetrics =
  | StatsOverviewMetrics
  | StatsComplexityMetrics
  | StatsLinesMetrics
  | UnusedMetrics
  | DuplicatesMetrics
  | CyclesMetrics

export interface CheckResult {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  summary: string
  output: string
  duration: number
  metrics?: CheckMetrics
}

export interface Check {
  name: string
  isAvailable(): Promise<boolean>
  run(config: ResolvedConfig): Promise<CheckResult>
}
