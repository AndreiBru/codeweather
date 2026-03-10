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
import type { Snapshot, SnapshotGitMeta } from './types.js'

export interface SaveSnapshotOptions {
  cwd: string
  historyDir: string
  results: CheckResult[]
  duration: number
  git?: SnapshotGitMeta
  timestamp?: string
}

export function getHistoryDir(cwd: string, historyDir: string): string {
  return resolve(cwd, historyDir)
}

export function getSnapshotDir(cwd: string, historyDir: string): string {
  return resolve(getHistoryDir(cwd, historyDir), 'snapshots')
}

export function createSnapshot({
  results,
  duration,
  git,
  timestamp,
}: Omit<SaveSnapshotOptions, 'cwd' | 'historyDir'>): Snapshot {
  return {
    version: 1,
    timestamp: timestamp ?? new Date().toISOString(),
    git,
    duration,
    checks: results.map((result) => ({
      name: result.name,
      status: result.status,
      summary: result.summary,
      duration: result.duration,
      metrics: result.metrics,
    })),
  }
}

export function createSnapshotFilename(snapshot: Snapshot): string {
  const stamp = snapshot.timestamp.replace(/:/g, '-')
  const commit = snapshot.git?.commit ?? 'nogit'
  return `${stamp}_${commit}.json`
}

export function saveSnapshot(options: SaveSnapshotOptions): { snapshot: Snapshot; path: string } {
  const snapshotDir = getSnapshotDir(options.cwd, options.historyDir)
  mkdirSync(snapshotDir, { recursive: true })

  const snapshot = createSnapshot(options)
  const path = resolve(snapshotDir, createSnapshotFilename(snapshot))

  writeFileSync(path, JSON.stringify(snapshot, null, 2))

  return { snapshot, path }
}

export function loadSnapshots(
  cwd: string,
  historyDir: string,
  limit?: number,
): Snapshot[] {
  const snapshotDir = getSnapshotDir(cwd, historyDir)
  if (!existsSync(snapshotDir)) {
    return []
  }

  const selected = listSnapshotFiles(snapshotDir, limit)
  const snapshots: Snapshot[] = []

  for (const name of selected) {
    try {
      const raw = readFileSync(resolve(snapshotDir, name), 'utf8')
      snapshots.push(JSON.parse(raw) as Snapshot)
    } catch {
      // Ignore malformed snapshots instead of breaking the run.
    }
  }

  return snapshots
}

export function loadLatestSnapshot(
  cwd: string,
  historyDir: string,
): Snapshot | undefined {
  return loadSnapshots(cwd, historyDir, 1)[0]
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

  const names = listSnapshotFiles(snapshotDir)
  const extra = names.slice(maxSnapshots)

  for (const name of extra) {
    rmSync(resolve(snapshotDir, name), { force: true })
  }

  return extra.length
}

export function getExistingCommitHashes(cwd: string, historyDir: string): Set<string> {
  const snapshotDir = getSnapshotDir(cwd, historyDir)
  if (!existsSync(snapshotDir)) {
    return new Set()
  }

  const hashes = new Set<string>()
  for (const name of readdirSync(snapshotDir)) {
    if (!name.endsWith('.json')) continue
    // Filename format: {timestamp}_{commit}.json
    const match = name.match(/_([^_]+)\.json$/)
    if (match && match[1] !== 'nogit') {
      hashes.add(match[1])
    }
  }
  return hashes
}

function listSnapshotFiles(snapshotDir: string, limit?: number): string[] {
  const names = readdirSync(snapshotDir)
    .filter((name) => name.endsWith('.json'))
    .sort((a, b) => b.localeCompare(a))

  return limit == null ? names : names.slice(0, limit)
}
