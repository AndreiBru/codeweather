import type { CyclesMetrics } from './types.js'

export interface DepCruiseDependency {
  module?: string
  resolved?: string
  circular?: boolean
  instability?: number
  valid?: boolean
}

export interface DepCruiseModule {
  source?: string
  dependencies?: DepCruiseDependency[]
  dependents?: string[]
  instability?: number
  valid?: boolean
}

export interface DepCruiseSummary {
  totalCruised?: number
  totalDependenciesCruised?: number
  violations?: unknown
}

export interface DepCruiseJsonResult {
  modules?: DepCruiseModule[]
  summary?: DepCruiseSummary
}

export interface DependencyInstabilityFile {
  path: string
  dependencies: number
  dependents: number
  instability: number
  inCycle: boolean
}

export interface DependencyInstabilitySummary {
  totalFiles: number
  filesInCycles: number
  averageInstability: number
  highestDependencies: number
  highestDependents: number
}

export interface DependencyInstabilityView {
  summary: DependencyInstabilitySummary
  byFile: DependencyInstabilityFile[]
  highlyUnstableFiles: DependencyInstabilityFile[]
  stableHighlyDependedOnFiles: DependencyInstabilityFile[]
}

function countNestedEntries(value: unknown): number {
  if (Array.isArray(value)) {
    return value.length
  }

  if (value && typeof value === 'object') {
    return Object.values(value).reduce((sum, entry) => sum + countNestedEntries(entry), 0)
  }

  return 0
}

export function parseDepCruiseMetrics(output: string): CyclesMetrics | undefined {
  try {
    const parsed = JSON.parse(output) as DepCruiseJsonResult
    const summary = parsed.summary
    if (!summary) {
      return undefined
    }

    const violationCount = countNestedEntries(summary.violations)
    const circularEdges = (parsed.modules ?? []).reduce((sum, moduleEntry) => (
      sum + (moduleEntry.dependencies ?? []).filter((dependency) => dependency.circular).length
    ), 0)

    return {
      kind: 'cycles',
      totalModules: summary.totalCruised ?? 0,
      totalDependencies: summary.totalDependenciesCruised ?? 0,
      cycleCount: violationCount || circularEdges,
    }
  } catch {
    return undefined
  }
}

function isDepCruiseJsonResult(value: unknown): value is DepCruiseJsonResult {
  return Boolean(value) && typeof value === 'object'
}

function toDependencyInstabilityFile(moduleEntry: DepCruiseModule): DependencyInstabilityFile | undefined {
  if (!moduleEntry.source) {
    return undefined
  }

  const dependencies = moduleEntry.dependencies ?? []
  const dependents = moduleEntry.dependents ?? []

  return {
    path: moduleEntry.source,
    dependencies: dependencies.length,
    dependents: dependents.length,
    instability: moduleEntry.instability ?? 0,
    inCycle: dependencies.some((dependency) => dependency.circular),
  }
}

function sortHighlyUnstable(
  left: DependencyInstabilityFile,
  right: DependencyInstabilityFile,
): number {
  return (
    right.instability - left.instability ||
    right.dependencies - left.dependencies ||
    right.dependents - left.dependents ||
    left.path.localeCompare(right.path)
  )
}

function sortStableHighlyDependedOn(
  left: DependencyInstabilityFile,
  right: DependencyInstabilityFile,
): number {
  return (
    right.dependents - left.dependents ||
    left.instability - right.instability ||
    left.dependencies - right.dependencies ||
    left.path.localeCompare(right.path)
  )
}

export function deriveDependencyInstability(
  artifact: unknown,
  limit: number,
): DependencyInstabilityView | undefined {
  if (!isDepCruiseJsonResult(artifact)) {
    return undefined
  }

  const files = (artifact.modules ?? [])
    .map(toDependencyInstabilityFile)
    .filter((entry): entry is DependencyInstabilityFile => entry != null)

  if (files.length === 0) {
    return undefined
  }

  const summary: DependencyInstabilitySummary = {
    totalFiles: files.length,
    filesInCycles: files.filter((entry) => entry.inCycle).length,
    averageInstability: files.reduce((sum, entry) => sum + entry.instability, 0) / files.length,
    highestDependencies: files.reduce((max, entry) => Math.max(max, entry.dependencies), 0),
    highestDependents: files.reduce((max, entry) => Math.max(max, entry.dependents), 0),
  }

  return {
    summary,
    byFile: [...files].sort((left, right) => left.path.localeCompare(right.path)),
    highlyUnstableFiles: [...files]
      .sort(sortHighlyUnstable)
      .slice(0, limit),
    stableHighlyDependedOnFiles: files
      .filter((entry) => entry.dependents > 0)
      .sort(sortStableHighlyDependedOn)
      .slice(0, limit),
  }
}
