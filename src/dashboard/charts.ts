import {
  formatSnapshotTimestamp,
  getSnapshotStatusCounts,
  getSnapshotTrendMetrics,
} from '../history/summary.js'
import type { Snapshot } from '../history/types.js'

export type DashboardMetricKey =
  | 'lines'
  | 'complexity'
  | 'unused'
  | 'duplication'
  | 'cycles'

export interface DashboardMetricDefinition {
  key: DashboardMetricKey
  title: string
  color: string
  kind: 'number' | 'percent'
}

export interface DashboardSnapshotRow {
  timestamp: string
  label: string
  commit: string
  branch?: string
  dirty: boolean
  status: {
    pass: number
    warn: number
    fail: number
    skip: number
  }
  metrics?: {
    lines: number
    complexity: number
    unused: number
    duplication: number
    cycles: number
  }
}

export const dashboardMetrics: DashboardMetricDefinition[] = [
  { key: 'lines', title: 'Total Lines', color: '#126e52', kind: 'number' },
  { key: 'complexity', title: 'Complexity', color: '#b14a18', kind: 'number' },
  { key: 'unused', title: 'Unused Issues', color: '#85570f', kind: 'number' },
  { key: 'duplication', title: 'Duplication %', color: '#204ecf', kind: 'percent' },
  { key: 'cycles', title: 'Cycle Count', color: '#8c2644', kind: 'number' },
]

export function buildDashboardRows(snapshots: Snapshot[]): DashboardSnapshotRow[] {
  return [...snapshots]
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
    .map((snapshot) => ({
      timestamp: snapshot.timestamp,
      label: formatSnapshotTimestamp(snapshot.timestamp),
      commit: snapshot.git?.commit ?? 'nogit',
      branch: snapshot.git?.branch,
      dirty: snapshot.git?.dirty ?? false,
      status: getSnapshotStatusCounts(snapshot),
      metrics: getSnapshotTrendMetrics(snapshot),
    }))
}
