import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { resolve } from 'node:path'
import type { CheckResult } from '../checks/types.js'
import {
  deriveDependencyInstability,
  type DependencyInstabilityView,
} from '../checks/depcruise.js'
import { buildSnapshotArtifactMap, buildSnapshotTreeIndex } from './tree.js'
import type {
  SnapshotArtifactMeta,
  SnapshotBundle,
  SnapshotGitMeta,
  SnapshotSummary,
} from './types.js'

export interface SaveSnapshotBundleOptions {
  cwd: string
  src?: string
  historyDir: string
  results: CheckResult[]
  top?: number
  duration: number
  report?: string
  git?: SnapshotGitMeta
  timestamp?: string
}

export function getHistoryDir(cwd: string, historyDir: string): string {
  return resolve(cwd, historyDir)
}

export function getSnapshotDir(cwd: string, historyDir: string): string {
  return resolve(getHistoryDir(cwd, historyDir), 'snapshots')
}

function createSnapshotId(timestamp: string, git?: SnapshotGitMeta): string {
  const stamp = timestamp.replace(/:/g, '-')
  const commit = git?.commit ?? 'nogit'
  return `${stamp}_${commit}`
}

function createSnapshotArtifactMeta(results: CheckResult[]): SnapshotArtifactMeta[] {
  return results.flatMap((result) => (result.artifacts ?? []).map((artifact) => ({
    id: artifact.id,
    checkName: result.name,
    format: artifact.format,
    path: `artifacts/${artifact.id}.json`,
  })))
}

function collectArtifactData(results: CheckResult[]): Record<string, unknown> {
  return Object.fromEntries(
    results.flatMap((result) => (result.artifacts ?? []).map((artifact) => [artifact.id, artifact.data])),
  )
}

function deriveSnapshotInstability(
  artifactData: Record<string, unknown>,
  top: number | undefined,
): DependencyInstabilityView | undefined {
  return deriveDependencyInstability(artifactData.cycles, top ?? 25)
}

export function createSnapshotSummary({
  results,
  top,
  duration,
  git,
  timestamp,
  src,
}: Omit<SaveSnapshotBundleOptions, 'cwd' | 'historyDir' | 'report'>): SnapshotSummary {
  const sourceRoot = src ?? '.'
  const createdAt = timestamp ?? new Date().toISOString()
  const id = createSnapshotId(createdAt, git)
  const artifacts = createSnapshotArtifactMeta(results)
  const artifactData = collectArtifactData(results)
  const instability = deriveSnapshotInstability(artifactData, top)
  const tree = buildSnapshotTreeIndex({
    cwd: '.',
    src: sourceRoot,
    artifacts: buildSnapshotArtifactMap(artifacts, artifactData),
    dependencyInstability: instability,
  })

  return {
    version: 3,
    id,
    timestamp: createdAt,
    git,
    duration,
    checks: results.map((result) => ({
      name: result.name,
      status: result.status,
      summary: result.summary,
      duration: result.duration,
      metrics: result.metrics,
    })),
    artifacts,
    tree: {
      path: tree.rootId,
      rootId: tree.rootId,
      nodeCount: Object.keys(tree.nodes).length,
    },
    instability: instability && {
      summary: instability.summary,
      highlyUnstableFiles: instability.highlyUnstableFiles,
      stableHighlyDependedOnFiles: instability.stableHighlyDependedOnFiles,
    },
  }
}

export function createSnapshotBundleId(summary: SnapshotSummary): string {
  return summary.id
}

export function saveSnapshotBundle(options: SaveSnapshotBundleOptions): { summary: SnapshotSummary; path: string } {
  const sourceRoot = options.src ?? '.'
  const snapshotRootDir = getSnapshotDir(options.cwd, options.historyDir)
  mkdirSync(snapshotRootDir, { recursive: true })

  const artifacts = createSnapshotArtifactMeta(options.results)
  const artifactData = collectArtifactData(options.results)
  const instability = deriveSnapshotInstability(artifactData, options.top)
  const tree = buildSnapshotTreeIndex({
    cwd: options.cwd,
    src: sourceRoot,
    artifacts: buildSnapshotArtifactMap(artifacts, artifactData),
    dependencyInstability: instability,
  })

  const createdAt = options.timestamp ?? new Date().toISOString()
  const id = createSnapshotId(createdAt, options.git)
  const summary: SnapshotSummary = {
    version: 3,
    id,
    timestamp: createdAt,
    git: options.git,
    duration: options.duration,
    checks: options.results.map((result) => ({
      name: result.name,
      status: result.status,
      summary: result.summary,
      duration: result.duration,
      metrics: result.metrics,
    })),
    artifacts,
    tree: {
      path: tree.rootId,
      rootId: tree.rootId,
      nodeCount: Object.keys(tree.nodes).length,
    },
    instability: instability && {
      summary: instability.summary,
      highlyUnstableFiles: instability.highlyUnstableFiles,
      stableHighlyDependedOnFiles: instability.stableHighlyDependedOnFiles,
    },
  }

  const bundleDir = resolve(snapshotRootDir, id)
  const artifactDir = resolve(bundleDir, 'artifacts')
  mkdirSync(artifactDir, { recursive: true })

  writeFileSync(resolve(bundleDir, 'summary.json'), JSON.stringify(summary, null, 2))
  writeFileSync(resolve(bundleDir, 'report.md'), options.report ?? '')
  writeFileSync(resolve(bundleDir, 'tree.json'), JSON.stringify(tree, null, 2))

  for (const artifact of artifacts) {
    writeFileSync(resolve(bundleDir, artifact.path), JSON.stringify(artifactData[artifact.id], null, 2))
  }

  return { summary, path: bundleDir }
}

export function loadSnapshotSummaries(
  cwd: string,
  historyDir: string,
  limit?: number,
): SnapshotSummary[] {
  const snapshotDir = getSnapshotDir(cwd, historyDir)
  if (!existsSync(snapshotDir)) {
    return []
  }

  const selected = listSnapshotBundleDirs(snapshotDir, limit)
  const snapshots: SnapshotSummary[] = []

  for (const name of selected) {
    try {
      const raw = readFileSync(resolve(snapshotDir, name, 'summary.json'), 'utf8')
      const summary = JSON.parse(raw) as SnapshotSummary
      if (summary.version !== 3) {
        continue
      }
      snapshots.push(summary)
    } catch {
      // Ignore malformed snapshots instead of breaking the run.
    }
  }

  return snapshots
}

export function loadLatestSnapshotSummary(
  cwd: string,
  historyDir: string,
): SnapshotSummary | undefined {
  return loadSnapshotSummaries(cwd, historyDir, 1)[0]
}

export function loadSnapshotBundle(
  cwd: string,
  historyDir: string,
  id: string,
): SnapshotBundle | undefined {
  const bundleDir = resolve(getSnapshotDir(cwd, historyDir), id)
  if (!existsSync(bundleDir)) {
    return undefined
  }

  try {
    const summary = JSON.parse(readFileSync(resolve(bundleDir, 'summary.json'), 'utf8')) as SnapshotSummary
    if (summary.version !== 3) {
      return undefined
    }
    const report = readFileSync(resolve(bundleDir, 'report.md'), 'utf8')
    const tree = JSON.parse(readFileSync(resolve(bundleDir, 'tree.json'), 'utf8')) as SnapshotBundle['tree']
    const artifacts = Object.fromEntries(summary.artifacts.map((artifact) => ([
      artifact.id,
      JSON.parse(readFileSync(resolve(bundleDir, artifact.path), 'utf8')) as unknown,
    ])))

    return {
      summary,
      report,
      tree,
      artifacts,
    }
  } catch {
    return undefined
  }
}

export function pruneSnapshots(
  cwd: string,
  historyDir: string,
  maxSnapshots: number,
): number {
  if (maxSnapshots < 1) {
    return 0
  }

  const snapshotDir = getSnapshotDir(cwd, historyDir)
  if (!existsSync(snapshotDir)) {
    return 0
  }

  const names = listSnapshotBundleDirs(snapshotDir)
  const extra = names.slice(maxSnapshots)

  for (const name of extra) {
    rmSync(resolve(snapshotDir, name), { recursive: true, force: true })
  }

  return extra.length
}

function listSnapshotBundleDirs(snapshotDir: string, limit?: number): string[] {
  const names = readdirSync(snapshotDir)
    .filter((name) => existsSync(resolve(snapshotDir, name, 'summary.json')))
    .sort((a, b) => b.localeCompare(a))

  return limit == null ? names : names.slice(0, limit)
}

export {
  createSnapshotSummary as createSnapshot,
  createSnapshotBundleId as createSnapshotFilename,
  loadLatestSnapshotSummary as loadLatestSnapshot,
  loadSnapshotSummaries as loadSnapshots,
  saveSnapshotBundle as saveSnapshot,
}
