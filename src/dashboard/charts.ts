import {
  formatSnapshotTimestamp,
  getSnapshotStatusCounts,
  getSnapshotTrendMetrics,
  getSnapshotExtendedMetrics,
  getSnapshotLanguages,
  getSnapshotTopComplexFiles,
  getSnapshotTopLargestFiles,
  getSnapshotCheckDetails,
} from '../history/summary.js'
import type {
  SnapshotExtendedMetrics,
  SnapshotLanguageEntry,
  SnapshotTopFile,
  SnapshotCheckDetail,
} from '../history/summary.js'
import type { Snapshot } from '../history/types.js'

export type DashboardMetricKey =
  | 'lines'
  | 'complexity'
  | 'unused'
  | 'duplication'
  | 'cycles'
  | 'commentRatio'
  | 'complexityPerFile'
  | 'totalFiles'
  | 'totalClones'

export type DashboardMetricGroup = 'core' | 'extended'

export interface DashboardMetricDefinition {
  key: DashboardMetricKey
  title: string
  color: string
  colorDark: string
  kind: 'number' | 'percent'
  group: DashboardMetricGroup
  /** true if lower values are better */
  lowerIsBetter: boolean
}

export interface DashboardSnapshotRow {
  timestamp: string
  label: string
  commit: string
  commitMessage?: string
  branch?: string
  dirty: boolean
  duration: number
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
  extended?: SnapshotExtendedMetrics
  languages?: SnapshotLanguageEntry[]
  topComplexFiles?: SnapshotTopFile[]
  topLargestFiles?: SnapshotTopFile[]
  checkDetails?: SnapshotCheckDetail[]
}

export const dashboardMetrics: DashboardMetricDefinition[] = [
  { key: 'lines', title: 'Total Lines', color: '#1a6b4e', colorDark: '#3dd9a0', kind: 'number', group: 'core', lowerIsBetter: false },
  { key: 'complexity', title: 'Complexity', color: '#c4650a', colorDark: '#f0943e', kind: 'number', group: 'core', lowerIsBetter: true },
  { key: 'unused', title: 'Unused Issues', color: '#c4650a', colorDark: '#f0943e', kind: 'number', group: 'core', lowerIsBetter: true },
  { key: 'duplication', title: 'Duplication %', color: '#2856cc', colorDark: '#6b9aff', kind: 'percent', group: 'core', lowerIsBetter: true },
  { key: 'cycles', title: 'Cycle Count', color: '#b82d4a', colorDark: '#f06080', kind: 'number', group: 'core', lowerIsBetter: true },
  { key: 'commentRatio', title: 'Comment Ratio %', color: '#7c5bbf', colorDark: '#b494f0', kind: 'percent', group: 'extended', lowerIsBetter: false },
  { key: 'complexityPerFile', title: 'Complexity / File', color: '#0e8a8a', colorDark: '#30d4d4', kind: 'number', group: 'extended', lowerIsBetter: true },
  { key: 'totalFiles', title: 'File Count', color: '#1a6b4e', colorDark: '#3dd9a0', kind: 'number', group: 'extended', lowerIsBetter: false },
  { key: 'totalClones', title: 'Clone Count', color: '#b82d4a', colorDark: '#f06080', kind: 'number', group: 'extended', lowerIsBetter: true },
]

export function buildDashboardRows(snapshots: Snapshot[]): DashboardSnapshotRow[] {
  return [...snapshots]
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
    .map((snapshot) => ({
      timestamp: snapshot.timestamp,
      label: formatSnapshotTimestamp(snapshot.timestamp),
      commit: snapshot.git?.commit ?? 'nogit',
      commitMessage: snapshot.git?.message,
      branch: snapshot.git?.branch,
      dirty: snapshot.git?.dirty ?? false,
      duration: snapshot.duration,
      status: getSnapshotStatusCounts(snapshot),
      metrics: getSnapshotTrendMetrics(snapshot),
      extended: getSnapshotExtendedMetrics(snapshot),
      languages: getSnapshotLanguages(snapshot),
      topComplexFiles: getSnapshotTopComplexFiles(snapshot),
      topLargestFiles: getSnapshotTopLargestFiles(snapshot),
      checkDetails: getSnapshotCheckDetails(snapshot),
    }))
}
