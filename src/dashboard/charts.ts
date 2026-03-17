import {
  formatSnapshotTimestamp,
  getSnapshotStatusCounts,
  getSnapshotTrendMetrics,
} from '../history/summary.js'
import { findMetric } from '../checks/metrics.js'
import type {
  CyclesMetrics,
  DuplicatesMetrics,
  StatsOverviewMetrics,
  UnusedMetrics,
} from '../checks/types.js'
import type {
  SnapshotInstability,
  SnapshotSummary,
  SnapshotTreeIndex,
} from '../history/types.js'

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

export interface HealthSubScore {
  key: string
  label: string
  score: number
  weight: number
  color: string
}

export interface HealthScore {
  overall: number
  trend: number
  subScores: HealthSubScore[]
}

export interface HotspotSignals {
  complexity: number
  size: number
  issues: number
  instability: number
}

export interface Hotspot {
  path: string
  name: string
  kind: 'file' | 'dir'
  score: number
  signals: HotspotSignals
  stats: { lines: number; code: number; complexity: number }
  issues: { total: number; unused: number; duplication: number; cycles: number }
}

export interface FileStatRank {
  path: string
  name: string
  kind: 'file'
  primaryMetric: 'code' | 'complexity'
  primaryValue: number
  stats: { lines: number; code: number; complexity: number }
  issues: { total: number; unused: number; duplication: number; cycles: number }
}

export interface DashboardSnapshotRow {
  id: string
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
  tree: {
    rootId: string
    nodeCount: number
  }
  instability?: SnapshotInstability
  healthScore?: HealthScore
}

export const dashboardMetrics: DashboardMetricDefinition[] = [
  { key: 'lines', title: 'Total Lines', color: '#126e52', kind: 'number' },
  { key: 'complexity', title: 'Complexity', color: '#b14a18', kind: 'number' },
  { key: 'unused', title: 'Unused Issues', color: '#85570f', kind: 'number' },
  { key: 'duplication', title: 'Duplication %', color: '#204ecf', kind: 'percent' },
  { key: 'cycles', title: 'Cycle Count', color: '#8c2644', kind: 'number' },
]

export function computeHealthScore(
  snapshot: SnapshotSummary,
  previousSnapshot?: SnapshotSummary,
): HealthScore {
  const stats = findMetric(snapshot.checks, 'stats-overview') as StatsOverviewMetrics | undefined
  const unused = findMetric(snapshot.checks, 'unused') as UnusedMetrics | undefined
  const duplicates = findMetric(snapshot.checks, 'duplicates') as DuplicatesMetrics | undefined
  const cycles = findMetric(snapshot.checks, 'cycles') as CyclesMetrics | undefined

  const cyclesScore = !cycles
    ? 50
    : cycles.cycleCount === 0
      ? 100
      : Math.max(0, 100 - (cycles.cycleCount / Math.max(cycles.totalModules, 1)) * 500)

  const duplicationScore = !duplicates
    ? 50
    : Math.max(0, 100 - duplicates.duplicatedLinesPercent * 5)

  const unusedScore = !unused || !stats
    ? 50
    : Math.max(0, 100 - (unused.totalIssues / Math.max(stats.totalFiles, 1)) * 50)

  const complexityScore = !stats
    ? 50
    : Math.max(0, 100 - (stats.totalComplexity / Math.max(stats.totalCode, 1)) * 1000)

  const subScores: HealthSubScore[] = [
    { key: 'cycles', label: 'Cycles', score: Math.round(cyclesScore), weight: 0.35, color: '#a12844' },
    { key: 'duplication', label: 'Duplication', score: Math.round(duplicationScore), weight: 0.25, color: '#1a56b8' },
    { key: 'unused', label: 'Unused Code', score: Math.round(unusedScore), weight: 0.25, color: '#c2570a' },
    { key: 'complexity', label: 'Complexity', score: Math.round(complexityScore), weight: 0.15, color: '#7c5e2a' },
  ]

  const overall = Math.round(subScores.reduce((sum, s) => sum + s.score * s.weight, 0))

  let trend = 0
  if (previousSnapshot) {
    const prev = computeHealthScore(previousSnapshot)
    trend = overall - prev.overall
  }

  return { overall, trend, subScores }
}

export function computeHotspots(tree: SnapshotTreeIndex, limit = 10): Hotspot[] {
  const nodes = Object.values(tree.nodes)
  const files = nodes.filter((n) => n.kind === 'file')

  if (files.length === 0) return []

  const maxComplexity = Math.max(...files.map((f) => f.stats.complexity), 1)
  const maxLines = Math.max(...files.map((f) => f.stats.lines), 1)
  const maxIssues = Math.max(...files.map((f) => f.issues.total), 1)

  const hotspots: Hotspot[] = files.map((node) => {
    const complexitySignal = node.stats.complexity / maxComplexity
    const sizeSignal = node.stats.lines / maxLines
    const issuesSignal = node.issues.total / maxIssues
    const instabilitySignal = node.dependency?.instability ?? 0

    const score = Math.round(
      (complexitySignal * 0.35 + sizeSignal * 0.25 + issuesSignal * 0.40) * 100,
    )

    return {
      path: node.path,
      name: node.name,
      kind: 'file' as const,
      score,
      signals: {
        complexity: Math.round(complexitySignal * 100) / 100,
        size: Math.round(sizeSignal * 100) / 100,
        issues: Math.round(issuesSignal * 100) / 100,
        instability: Math.round(instabilitySignal * 100) / 100,
      },
      stats: { lines: node.stats.lines, code: node.stats.code, complexity: node.stats.complexity },
      issues: node.issues,
    }
  })

  return hotspots
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export function computeDirectoryHotspots(tree: SnapshotTreeIndex, limit = 5): Hotspot[] {
  const nodes = Object.values(tree.nodes)
  const dirs = nodes.filter((n) => n.kind === 'dir' && n.path !== tree.rootId)

  if (dirs.length === 0) return []

  const maxIssues = Math.max(...dirs.map((d) => d.issues.total), 1)
  const maxComplexity = Math.max(...dirs.map((d) => d.stats.complexity), 1)
  const maxLines = Math.max(...dirs.map((d) => d.stats.lines), 1)

  const hotspots: Hotspot[] = dirs.map((node) => {
    const issuesSignal = node.issues.total / maxIssues
    const complexitySignal = node.stats.complexity / maxComplexity
    const sizeSignal = node.stats.lines / maxLines

    const score = Math.round(
      (issuesSignal * 0.45 + complexitySignal * 0.35 + sizeSignal * 0.2) * 100,
    )

    return {
      path: node.path,
      name: node.name,
      kind: 'dir' as const,
      score,
      signals: {
        complexity: Math.round(complexitySignal * 100) / 100,
        size: Math.round(sizeSignal * 100) / 100,
        issues: Math.round(issuesSignal * 100) / 100,
        instability: 0,
      },
      stats: { lines: node.stats.lines, code: node.stats.code, complexity: node.stats.complexity },
      issues: node.issues,
    }
  })

  return hotspots
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export function computeTopFilesByCode(tree: SnapshotTreeIndex, limit = 10): FileStatRank[] {
  return Object.values(tree.nodes)
    .filter((node) => node.kind === 'file')
    .sort((left, right) => (
      right.stats.code - left.stats.code ||
      right.stats.lines - left.stats.lines ||
      right.stats.complexity - left.stats.complexity
    ))
    .slice(0, limit)
    .map((node) => ({
      path: node.path,
      name: node.name,
      kind: 'file' as const,
      primaryMetric: 'code' as const,
      primaryValue: node.stats.code,
      stats: { lines: node.stats.lines, code: node.stats.code, complexity: node.stats.complexity },
      issues: node.issues,
    }))
}

export function computeTopFilesByComplexity(tree: SnapshotTreeIndex, limit = 10): FileStatRank[] {
  return Object.values(tree.nodes)
    .filter((node) => node.kind === 'file')
    .sort((left, right) => (
      right.stats.complexity - left.stats.complexity ||
      right.stats.code - left.stats.code ||
      right.stats.lines - left.stats.lines
    ))
    .slice(0, limit)
    .map((node) => ({
      path: node.path,
      name: node.name,
      kind: 'file' as const,
      primaryMetric: 'complexity' as const,
      primaryValue: node.stats.complexity,
      stats: { lines: node.stats.lines, code: node.stats.code, complexity: node.stats.complexity },
      issues: node.issues,
    }))
}

export function buildDashboardRows(snapshots: SnapshotSummary[]): DashboardSnapshotRow[] {
  const sorted = [...snapshots].sort((left, right) => left.timestamp.localeCompare(right.timestamp))

  return sorted.map((snapshot, index) => ({
    id: snapshot.id,
    timestamp: snapshot.timestamp,
    label: formatSnapshotTimestamp(snapshot.timestamp),
    commit: snapshot.git?.commit ?? 'nogit',
    branch: snapshot.git?.branch,
    dirty: snapshot.git?.dirty ?? false,
    status: getSnapshotStatusCounts(snapshot),
    metrics: getSnapshotTrendMetrics(snapshot),
    tree: {
      rootId: snapshot.tree.rootId,
      nodeCount: snapshot.tree.nodeCount,
    },
    instability: snapshot.instability,
    healthScore: computeHealthScore(snapshot, index > 0 ? sorted[index - 1] : undefined),
  }))
}
