import { basename, relative } from 'node:path'
import type { SnapshotArtifactMeta, SnapshotTreeIndex, SnapshotTreeNode } from './types.js'

interface SccFileEntry {
  Location?: string
  Lines?: number
  Code?: number
  Complexity?: number
}

interface SccLanguageEntry {
  Files?: SccFileEntry[]
}

interface KnipIssueRow {
  file?: string
  dependencies?: unknown
  devDependencies?: unknown
  optionalPeerDependencies?: unknown
  unlisted?: unknown
  binaries?: unknown
  unresolved?: unknown
  exports?: unknown
  nsExports?: unknown
  classMembers?: unknown
  types?: unknown
  nsTypes?: unknown
  enumMembers?: unknown
  duplicates?: unknown
  catalog?: unknown
}

interface KnipJsonReport {
  files?: unknown
  issues?: unknown
}

interface JscpdFileRef {
  name?: string
}

interface JscpdDuplicateEntry {
  firstFile?: JscpdFileRef
  secondFile?: JscpdFileRef
}

interface DepCruiseDependency {
  resolved?: string
  circular?: boolean
}

interface DepCruiseModule {
  source?: string
  dependencies?: DepCruiseDependency[]
}

interface TreeAccumulatorNode extends SnapshotTreeNode {}

function normalizePath(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\/+/, '').replace(/\/+$/, '')
}

function normalizeRepoPath(cwd: string, filePath: string): string {
  if (!filePath) {
    return ''
  }

  const normalized = normalizePath(filePath)
  if (normalized.startsWith('/')) {
    return normalizePath(relative(cwd, normalized))
  }

  return normalized
}

function isWithinRoot(path: string, rootId: string): boolean {
  if (rootId === '.') {
    return path.length > 0
  }

  return path === rootId || path.startsWith(`${rootId}/`)
}

function getParentId(nodeId: string, rootId: string): string | undefined {
  if (nodeId === rootId) {
    return undefined
  }

  if (rootId === '.') {
    const parts = nodeId.split('/')
    if (parts.length <= 1) {
      return '.'
    }

    return parts.slice(0, -1).join('/')
  }

  const parts = nodeId.split('/')
  return parts.length <= 1 ? rootId : parts.slice(0, -1).join('/')
}

function createNode(id: string, kind: 'dir' | 'file'): TreeAccumulatorNode {
  return {
    path: id,
    name: id === '.' ? '.' : basename(id),
    kind,
    childIds: [],
    stats: {
      files: 0,
      lines: 0,
      code: 0,
      complexity: 0,
    },
    issues: {
      total: 0,
      unused: 0,
      duplication: 0,
      cycles: 0,
    },
  }
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

function extractSccFileStats(artifact: unknown): Array<{ path: string; lines: number; code: number; complexity: number }> {
  if (!Array.isArray(artifact)) {
    return []
  }

  return (artifact as SccLanguageEntry[])
    .flatMap((row) => row.Files ?? [])
    .map((entry) => ({
      path: entry.Location ?? '',
      lines: entry.Lines ?? 0,
      code: entry.Code ?? 0,
      complexity: entry.Complexity ?? 0,
    }))
    .filter((entry) => entry.path.length > 0)
}

function extractUnusedFileCounts(artifact: unknown): Map<string, number> {
  const counts = new Map<string, number>()
  if (!artifact || typeof artifact !== 'object') {
    return counts
  }

  const report = artifact as KnipJsonReport
  if (Array.isArray(report.files)) {
    for (const filePath of report.files) {
      if (typeof filePath !== 'string') {
        continue
      }

      counts.set(filePath, (counts.get(filePath) ?? 0) + 1)
    }
  }

  if (Array.isArray(report.issues)) {
    for (const entry of report.issues) {
      if (!entry || typeof entry !== 'object') {
        continue
      }

      const row = entry as KnipIssueRow
      if (!row.file) {
        continue
      }

      const issueCount =
        countNestedEntries(row.dependencies) +
        countNestedEntries(row.devDependencies) +
        countNestedEntries(row.optionalPeerDependencies) +
        countNestedEntries(row.unlisted) +
        countNestedEntries(row.binaries) +
        countNestedEntries(row.unresolved) +
        countNestedEntries(row.exports) +
        countNestedEntries(row.nsExports) +
        countNestedEntries(row.classMembers) +
        countNestedEntries(row.types) +
        countNestedEntries(row.nsTypes) +
        countNestedEntries(row.enumMembers) +
        countNestedEntries(row.duplicates) +
        countNestedEntries(row.catalog)

      if (issueCount > 0) {
        counts.set(row.file, (counts.get(row.file) ?? 0) + issueCount)
      }
    }
  }

  return counts
}

function extractDuplicateFileCounts(artifact: unknown): Map<string, number> {
  const counts = new Map<string, number>()
  if (!artifact || typeof artifact !== 'object') {
    return counts
  }

  const duplicates = (artifact as { duplicates?: unknown }).duplicates
  if (!Array.isArray(duplicates)) {
    return counts
  }

  for (const entry of duplicates as JscpdDuplicateEntry[]) {
    const first = entry.firstFile?.name
    const second = entry.secondFile?.name
    if (typeof first === 'string') {
      counts.set(first, (counts.get(first) ?? 0) + 1)
    }
    if (typeof second === 'string') {
      counts.set(second, (counts.get(second) ?? 0) + 1)
    }
  }

  return counts
}

function extractCycleFileCounts(artifact: unknown): Map<string, number> {
  const counts = new Map<string, number>()
  if (!artifact || typeof artifact !== 'object') {
    return counts
  }

  const modules = (artifact as { modules?: unknown }).modules
  if (!Array.isArray(modules)) {
    return counts
  }

  const seenPairs = new Set<string>()

  for (const moduleEntry of modules as DepCruiseModule[]) {
    if (!moduleEntry.source || !Array.isArray(moduleEntry.dependencies)) {
      continue
    }

    for (const dependency of moduleEntry.dependencies) {
      if (!dependency.circular || !dependency.resolved) {
        continue
      }

      const pairKey = [moduleEntry.source, dependency.resolved].sort().join('<->')
      if (seenPairs.has(pairKey)) {
        continue
      }

      seenPairs.add(pairKey)
      counts.set(moduleEntry.source, (counts.get(moduleEntry.source) ?? 0) + 1)
      counts.set(dependency.resolved, (counts.get(dependency.resolved) ?? 0) + 1)
    }
  }

  return counts
}

function sortChildIds(nodes: Record<string, TreeAccumulatorNode>): void {
  for (const node of Object.values(nodes)) {
    node.childIds.sort((left, right) => {
      const leftNode = nodes[left]
      const rightNode = nodes[right]

      if (leftNode.kind !== rightNode.kind) {
        return leftNode.kind === 'dir' ? -1 : 1
      }

      return left.localeCompare(right)
    })
  }
}

export function buildSnapshotTreeIndex(options: {
  cwd: string
  src: string
  artifacts: Record<string, unknown>
}): SnapshotTreeIndex {
  const rootCandidate = normalizePath(options.src)
  const rootId = rootCandidate.length > 0 ? rootCandidate : '.'
  const nodes: Record<string, TreeAccumulatorNode> = {
    [rootId]: createNode(rootId, 'dir'),
  }

  function ensureNode(nodeId: string, kind: 'dir' | 'file'): TreeAccumulatorNode {
    const existing = nodes[nodeId]
    if (existing) {
      if (kind === 'file') {
        existing.kind = 'file'
      }
      return existing
    }

    const node = createNode(nodeId, kind)
    nodes[nodeId] = node
    const parentId = getParentId(nodeId, rootId)
    if (parentId) {
      const parent = ensureNode(parentId, 'dir')
      if (!parent.childIds.includes(nodeId)) {
        parent.childIds.push(nodeId)
      }
    }

    return node
  }

  function getAncestorIds(fileId: string): string[] {
    const ids = [fileId]
    let current = getParentId(fileId, rootId)
    while (current) {
      ids.push(current)
      current = getParentId(current, rootId)
    }
    return ids
  }

  function applyStats(filePath: string, stats: { lines: number; code: number; complexity: number }): void {
    const repoPath = normalizeRepoPath(options.cwd, filePath)
    if (!repoPath || !isWithinRoot(repoPath, rootId)) {
      return
    }

    ensureNode(repoPath, 'file')
    for (const nodeId of getAncestorIds(repoPath)) {
      const node = ensureNode(nodeId, nodeId === repoPath ? 'file' : 'dir')
      node.stats.lines += stats.lines
      node.stats.code += stats.code
      node.stats.complexity += stats.complexity
      if (nodeId === repoPath) {
        node.stats.files = 1
      } else {
        node.stats.files += 1
      }
    }
  }

  function applyIssueCount(filePath: string, key: 'unused' | 'duplication' | 'cycles', count: number): void {
    if (count <= 0) {
      return
    }

    const repoPath = normalizeRepoPath(options.cwd, filePath)
    if (!repoPath || !isWithinRoot(repoPath, rootId)) {
      return
    }

    ensureNode(repoPath, 'file')
    for (const nodeId of getAncestorIds(repoPath)) {
      const node = ensureNode(nodeId, nodeId === repoPath ? 'file' : 'dir')
      node.issues[key] += count
      node.issues.total += count
    }
  }

  for (const fileStats of extractSccFileStats(options.artifacts['stats-complexity'] ?? options.artifacts['stats-lines'])) {
    applyStats(fileStats.path, fileStats)
  }

  for (const [filePath, count] of extractUnusedFileCounts(options.artifacts.unused)) {
    applyIssueCount(filePath, 'unused', count)
  }

  for (const [filePath, count] of extractDuplicateFileCounts(options.artifacts.duplicates)) {
    applyIssueCount(filePath, 'duplication', count)
  }

  for (const [filePath, count] of extractCycleFileCounts(options.artifacts.cycles)) {
    applyIssueCount(filePath, 'cycles', count)
  }

  sortChildIds(nodes)

  return {
    rootId,
    nodes,
  }
}

export function buildSnapshotArtifactMap(
  artifactMeta: SnapshotArtifactMeta[],
  artifacts: Record<string, unknown>,
): Record<string, unknown> {
  const selected: Record<string, unknown> = {}

  for (const artifact of artifactMeta) {
    if (artifact.id in artifacts) {
      selected[artifact.id] = artifacts[artifact.id]
    }
  }

  return selected
}
