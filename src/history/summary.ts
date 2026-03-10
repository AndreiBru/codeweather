import type {
  CyclesMetrics,
  DuplicatesMetrics,
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
