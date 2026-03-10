import type { CheckMetrics, CheckResult } from '../checks/types.js'

export interface SnapshotGitMeta {
  commit: string
  branch: string
  dirty: boolean
  message?: string
}

export interface SnapshotCheck {
  name: CheckResult['name']
  status: CheckResult['status']
  summary: CheckResult['summary']
  duration: CheckResult['duration']
  metrics?: CheckMetrics
}

export interface Snapshot {
  version: 1
  timestamp: string
  git?: SnapshotGitMeta
  duration: number
  checks: SnapshotCheck[]
}
