import type { CheckMetrics, CheckResult } from '../checks/types.js'

export interface SnapshotGitMeta {
  commit: string
  branch: string
  dirty: boolean
  message?: string
}

export interface SnapshotCheckSummary {
  name: CheckResult['name']
  status: CheckResult['status']
  summary: CheckResult['summary']
  duration: CheckResult['duration']
  metrics?: CheckMetrics
}

export interface SnapshotArtifactMeta {
  id: string
  checkName: CheckResult['name']
  format: 'json'
  path: string
}

export interface SnapshotTreeNodeStats {
  files: number
  lines: number
  code: number
  complexity: number
}

export interface SnapshotTreeNodeIssues {
  total: number
  unused: number
  duplication: number
  cycles: number
}

export interface SnapshotTreeNodeDependency {
  dependencies: number
  dependents: number
  instability: number
  inCycle: boolean
}

export interface SnapshotTreeNode {
  path: string
  name: string
  kind: 'dir' | 'file'
  childIds: string[]
  stats: SnapshotTreeNodeStats
  issues: SnapshotTreeNodeIssues
  dependency?: SnapshotTreeNodeDependency
}

export interface SnapshotTreeIndex {
  rootId: string
  nodes: Record<string, SnapshotTreeNode>
}

export interface SnapshotTreeMeta {
  path: string
  rootId: string
  nodeCount: number
}

export interface SnapshotInstabilityFile {
  path: string
  dependencies: number
  dependents: number
  instability: number
  inCycle: boolean
}

export interface SnapshotInstabilitySummary {
  totalFiles: number
  filesInCycles: number
  averageInstability: number
  highestDependencies: number
  highestDependents: number
}

export interface SnapshotInstability {
  summary: SnapshotInstabilitySummary
  highlyUnstableFiles: SnapshotInstabilityFile[]
  stableHighlyDependedOnFiles: SnapshotInstabilityFile[]
}

export interface SnapshotSummary {
  version: 3
  id: string
  timestamp: string
  git?: SnapshotGitMeta
  duration: number
  checks: SnapshotCheckSummary[]
  artifacts: SnapshotArtifactMeta[]
  tree: SnapshotTreeMeta
  instability?: SnapshotInstability
}

export interface SnapshotBundle {
  summary: SnapshotSummary
  report: string
  tree: SnapshotTreeIndex
  artifacts: Record<string, unknown>
}
