import type {
  CyclesMetrics,
  DuplicatesMetrics,
  StatsOverviewMetrics,
  UnusedMetrics,
} from '../checks/types.js'
import { findMetric } from '../checks/metrics.js'
import type { SnapshotSummary } from './types.js'

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

export function getSnapshotStatusCounts(snapshot: SnapshotSummary): SnapshotStatusCounts {
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

export function getSnapshotTrendMetrics(snapshot: SnapshotSummary): SnapshotTrendMetrics | undefined {
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

function formatOrdinalDay(day: number): string {
  const mod100 = day % 100
  if (mod100 >= 11 && mod100 <= 13) {
    return `${day}th`
  }

  switch (day % 10) {
    case 1:
      return `${day}st`
    case 2:
      return `${day}nd`
    case 3:
      return `${day}rd`
    default:
      return `${day}th`
  }
}

export function formatSnapshotTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  const weekday = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'UTC',
  }).format(date)
  const month = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    timeZone: 'UTC',
  }).format(date)
  const year = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)

  return `${weekday}, ${month} ${formatOrdinalDay(date.getUTCDate())} ${year}`
}

export function getSnapshotRange(snapshots: SnapshotSummary[]): { start: string; end: string } | undefined {
  if (snapshots.length === 0) {
    return undefined
  }

  const ordered = [...snapshots].sort((left, right) => left.timestamp.localeCompare(right.timestamp))
  return {
    start: ordered[0].timestamp,
    end: ordered[ordered.length - 1].timestamp,
  }
}
