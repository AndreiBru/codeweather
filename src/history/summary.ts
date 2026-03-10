import type {
  CyclesMetrics,
  DuplicatesMetrics,
  StatsComplexityMetrics,
  StatsLinesMetrics,
  StatsOverviewMetrics,
  UnusedMetrics,
} from '../checks/types.js'
import { findMetric } from '../checks/metrics.js'
import type { Snapshot } from './types.js'

export interface SnapshotStatusCounts {
  pass: number
  warn: number
  fail: number
  skip: number
}

export interface SnapshotTrendMetrics {
  lines: number
  complexity: number
  unused: number
  duplication: number
  cycles: number
}

export interface SnapshotExtendedMetrics {
  totalFiles: number
  totalCode: number
  totalComments: number
  totalBlanks: number
  commentRatio: number
  complexityPerFile: number
  unusedFiles: number
  unusedExports: number
  unusedTypes: number
  unusedDependencies: number
  totalClones: number
  totalModules: number
  totalDependencies: number
  dependencyRatio: number
}

export interface SnapshotLanguageEntry {
  language: string
  code: number
  files: number
}

export interface SnapshotTopFile {
  path: string
  lines: number
  code: number
  complexity: number
}

export interface SnapshotCheckDetail {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  summary: string
  duration: number
}

export function getSnapshotStatusCounts(snapshot: Snapshot): SnapshotStatusCounts {
  return snapshot.checks.reduce<SnapshotStatusCounts>((counts, check) => {
    counts[check.status] += 1
    return counts
  }, {
    pass: 0,
    warn: 0,
    fail: 0,
    skip: 0,
  })
}

export function getSnapshotTrendMetrics(snapshot: Snapshot): SnapshotTrendMetrics | undefined {
  const stats = findMetric(snapshot.checks, 'stats-overview') as StatsOverviewMetrics | undefined
  const unused = findMetric(snapshot.checks, 'unused') as UnusedMetrics | undefined
  const duplicates = findMetric(snapshot.checks, 'duplicates') as DuplicatesMetrics | undefined
  const cycles = findMetric(snapshot.checks, 'cycles') as CyclesMetrics | undefined

  if (!stats || !unused || !duplicates || !cycles) {
    return undefined
  }

  return {
    lines: stats.totalLines,
    complexity: stats.totalComplexity,
    unused: unused.totalIssues,
    duplication: duplicates.duplicatedLinesPercent,
    cycles: cycles.cycleCount,
  }
}

export function getSnapshotExtendedMetrics(snapshot: Snapshot): SnapshotExtendedMetrics | undefined {
  const stats = findMetric(snapshot.checks, 'stats-overview') as StatsOverviewMetrics | undefined
  const unused = findMetric(snapshot.checks, 'unused') as UnusedMetrics | undefined
  const duplicates = findMetric(snapshot.checks, 'duplicates') as DuplicatesMetrics | undefined
  const cycles = findMetric(snapshot.checks, 'cycles') as CyclesMetrics | undefined

  if (!stats) return undefined

  const commentRatio = stats.totalCode > 0
    ? Number(((stats.totalComments / stats.totalCode) * 100).toFixed(1))
    : 0
  const complexityPerFile = stats.totalFiles > 0
    ? Number((stats.totalComplexity / stats.totalFiles).toFixed(1))
    : 0
  const dependencyRatio = (cycles?.totalModules ?? 0) > 0
    ? Number(((cycles!.totalDependencies / cycles!.totalModules).toFixed(1)))
    : 0

  return {
    totalFiles: stats.totalFiles,
    totalCode: stats.totalCode,
    totalComments: stats.totalComments,
    totalBlanks: stats.totalBlanks,
    commentRatio,
    complexityPerFile,
    unusedFiles: unused?.unusedFiles ?? 0,
    unusedExports: unused?.unusedExports ?? 0,
    unusedTypes: unused?.unusedTypes ?? 0,
    unusedDependencies: unused?.unusedDependencies ?? 0,
    totalClones: duplicates?.totalClones ?? 0,
    totalModules: cycles?.totalModules ?? 0,
    totalDependencies: cycles?.totalDependencies ?? 0,
    dependencyRatio,
  }
}

export function getSnapshotLanguages(snapshot: Snapshot): SnapshotLanguageEntry[] {
  const stats = findMetric(snapshot.checks, 'stats-overview') as StatsOverviewMetrics | undefined
  if (!stats?.languages) return []

  const totalCode = stats.languages.reduce((sum, lang) => sum + lang.code, 0)
  if (totalCode === 0) return []

  return stats.languages
    .filter((lang) => (lang.code / totalCode) * 100 > 1)
    .sort((a, b) => b.code - a.code)
    .map((lang) => ({ language: lang.language, code: lang.code, files: lang.files }))
}

export function getSnapshotTopComplexFiles(snapshot: Snapshot): SnapshotTopFile[] {
  const metrics = findMetric(snapshot.checks, 'stats-complexity') as StatsComplexityMetrics | undefined
  if (!metrics?.topFiles) return []
  return metrics.topFiles.slice(0, 10).map((f) => ({
    path: f.path,
    lines: f.lines,
    code: f.code,
    complexity: f.complexity,
  }))
}

export function getSnapshotTopLargestFiles(snapshot: Snapshot): SnapshotTopFile[] {
  const metrics = findMetric(snapshot.checks, 'stats-lines') as StatsLinesMetrics | undefined
  if (!metrics?.topFiles) return []
  return metrics.topFiles.slice(0, 10).map((f) => ({
    path: f.path,
    lines: f.lines,
    code: f.code,
    complexity: f.complexity,
  }))
}

export function getSnapshotCheckDetails(snapshot: Snapshot): SnapshotCheckDetail[] {
  return snapshot.checks.map((check) => ({
    name: check.name,
    status: check.status,
    summary: check.summary,
    duration: check.duration,
  }))
}

export function formatSnapshotTimestamp(timestamp: string): string {
  return timestamp.replace('T', ' ').replace(/\.\d+Z$/, ' UTC')
}

export function getSnapshotRange(snapshots: Snapshot[]): { start: string; end: string } | undefined {
  if (snapshots.length === 0) {
    return undefined
  }

  const ordered = [...snapshots].sort((left, right) => left.timestamp.localeCompare(right.timestamp))
  return {
    start: ordered[0].timestamp,
    end: ordered[ordered.length - 1].timestamp,
  }
}
