import type { SnapshotSummary } from './types.js'
import {
  formatSnapshotTimestamp,
  getSnapshotStatusCounts,
  getSnapshotTrendMetrics,
} from './summary.js'

function pad(value: string, width: number): string {
  return value.padEnd(width)
}

function formatCommit(snapshot: SnapshotSummary): string {
  if (!snapshot.git) {
    return 'nogit'
  }

  return snapshot.git.dirty ? `${snapshot.git.commit}*` : snapshot.git.commit
}

function formatMetricValue(value: number | undefined, kind: 'plain' | 'percent'): string {
  if (value == null) {
    return '-'
  }

  if (kind === 'percent') {
    return `${value.toFixed(1)}%`
  }

  return value.toLocaleString('en-US')
}

export function renderHistoryTable(snapshots: SnapshotSummary[]): string {
  if (snapshots.length === 0) {
    return 'No snapshots found.'
  }

  const header = [
    pad('Timestamp', 24),
    pad('Commit', 10),
    pad('Status', 13),
    pad('Lines', 8),
    pad('Complexity', 11),
    pad('Unused', 8),
    pad('Dup', 8),
    'Cycles',
  ].join('  ')

  const divider = '-'.repeat(header.length)
  const rows = snapshots.map((snapshot) => {
    const status = getSnapshotStatusCounts(snapshot)
    const metrics = getSnapshotTrendMetrics(snapshot)
    const statusSummary = `${status.pass}p/${status.warn}w/${status.fail}f/${status.skip}s`

    return [
      pad(formatSnapshotTimestamp(snapshot.timestamp), 24),
      pad(formatCommit(snapshot), 10),
      pad(statusSummary, 13),
      pad(formatMetricValue(metrics?.lines, 'plain'), 8),
      pad(formatMetricValue(metrics?.complexity, 'plain'), 11),
      pad(formatMetricValue(metrics?.unused, 'plain'), 8),
      pad(formatMetricValue(metrics?.duplication, 'percent'), 8),
      formatMetricValue(metrics?.cycles, 'plain'),
    ].join('  ')
  })

  return [header, divider, ...rows].join('\n')
}
