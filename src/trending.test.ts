import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseSccComplexityMetrics, parseSccLinesMetrics, parseSccOverviewMetrics } from './checks/stats.js'
import { parseKnipMetrics } from './checks/unused.js'
import { parseJscpdMetrics } from './checks/duplicates.js'
import { deriveDependencyInstability, parseDepCruiseMetrics } from './checks/depcruise.js'
import type { CheckResult } from './checks/types.js'
import { getTrendLine, toJson, toMarkdown } from './output.js'
import { getGitMeta } from './history/git.js'
import {
  createSnapshot,
  createSnapshotFilename,
  loadSnapshotBundle,
  loadSnapshots,
  pruneSnapshots,
  saveSnapshot,
} from './history/store.js'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'codeweather-test-'))
  tempDirs.push(dir)
  return dir
}

describe('stats metrics', () => {
  it('parses overview totals and languages from scc json', () => {
    const metrics = parseSccOverviewMetrics(JSON.stringify([
      {
        Name: 'TypeScript',
        Count: 3,
        Lines: 150,
        Code: 120,
        Blank: 20,
        Comment: 10,
        Complexity: 15,
      },
      {
        Name: 'JavaScript',
        Count: 2,
        Lines: 50,
        Code: 30,
        Blank: 10,
        Comment: 10,
        Complexity: 5,
      },
    ]))

    expect(metrics).toEqual({
      kind: 'stats-overview',
      totalFiles: 5,
      totalLines: 200,
      totalCode: 150,
      totalComplexity: 20,
      totalBlanks: 30,
      totalComments: 20,
      languages: [
        { language: 'TypeScript', files: 3, lines: 150, code: 120, complexity: 15 },
        { language: 'JavaScript', files: 2, lines: 50, code: 30, complexity: 5 },
      ],
    })
  })

  it('sorts top complexity files from unsorted scc json', () => {
    const metrics = parseSccComplexityMetrics(JSON.stringify([
      {
        Name: 'TypeScript',
        Files: [
          { Location: 'src/b.ts', Lines: 100, Code: 80, Complexity: 12 },
          { Location: 'src/a.ts', Lines: 90, Code: 70, Complexity: 20 },
          { Location: 'src/c.ts', Lines: 110, Code: 90, Complexity: 20 },
        ],
      },
    ]), 2)

    expect(metrics).toEqual({
      kind: 'stats-complexity',
      topFiles: [
        { path: 'src/c.ts', lines: 110, code: 90, complexity: 20 },
        { path: 'src/a.ts', lines: 90, code: 70, complexity: 20 },
      ],
    })
  })

  it('sorts top line-count files from unsorted scc json', () => {
    const metrics = parseSccLinesMetrics(JSON.stringify([
      {
        Name: 'TypeScript',
        Files: [
          { Location: 'src/a.ts', Lines: 120, Code: 70, Complexity: 5 },
          { Location: 'src/b.ts', Lines: 200, Code: 80, Complexity: 1 },
          { Location: 'src/c.ts', Lines: 200, Code: 90, Complexity: 10 },
        ],
      },
    ]), 2)

    expect(metrics).toEqual({
      kind: 'stats-lines',
      topFiles: [
        { path: 'src/c.ts', lines: 200, code: 90, complexity: 10 },
        { path: 'src/b.ts', lines: 200, code: 80, complexity: 1 },
      ],
    })
  })
})

describe('tool metric parsers', () => {
  it('parses knip json into issue counts', () => {
    const metrics = parseKnipMetrics(JSON.stringify({
      files: ['src/unused-file.ts'],
      issues: [
        {
          dependencies: [{ name: 'left-pad' }],
          exports: [{ name: 'foo' }],
          nsExports: [{ name: 'bar' }],
          classMembers: [{ name: 'baz' }],
          types: [{ name: 'TypeA' }],
          nsTypes: [{ name: 'TypeB' }],
          enumMembers: { Status: [{ name: 'Idle' }] },
          unresolved: [{ name: 'missing' }],
          duplicates: [{ name: 'dup' }],
        },
      ],
    }))

    expect(metrics).toEqual({
      kind: 'unused',
      unusedFiles: 1,
      unusedExports: 4,
      unusedTypes: 2,
      unusedDependencies: 2,
      totalIssues: 10,
    })
  })

  it('parses jscpd totals', () => {
    const metrics = parseJscpdMetrics(JSON.stringify({
      statistics: {
        total: {
          clones: 4,
          percentage: 2.5,
          percentageTokens: 3.1,
          lines: 800,
        },
      },
    }))

    expect(metrics).toEqual({
      kind: 'duplicates',
      totalClones: 4,
      duplicatedLinesPercent: 2.5,
      duplicatedTokensPercent: 3.1,
      totalLines: 800,
    })
  })

  it('parses depcruise json into cycle metrics', () => {
    const metrics = parseDepCruiseMetrics(JSON.stringify({
      modules: [
        {
          source: 'src/a.ts',
          dependencies: [
            { resolved: 'src/b.ts', circular: true },
            { resolved: 'src/c.ts', circular: false },
          ],
        },
      ],
      summary: {
        totalCruised: 10,
        totalDependenciesCruised: 24,
        violations: [{ name: 'no-circular' }, { name: 'no-circular' }],
      },
    }))

    expect(metrics).toEqual({
      kind: 'cycles',
      totalModules: 10,
      totalDependencies: 24,
      cycleCount: 2,
    })
  })

  it('derives file-level instability insights from depcruise json', () => {
    const view = deriveDependencyInstability({
      modules: [
        {
          source: 'src/app.ts',
          dependencies: [
            { resolved: 'src/lib.ts', circular: false },
            { resolved: 'src/ui.ts', circular: true },
          ],
          dependents: [],
          instability: 1,
        },
        {
          source: 'src/lib.ts',
          dependencies: [],
          dependents: ['src/app.ts', 'src/ui.ts'],
          instability: 0,
        },
        {
          source: 'src/ui.ts',
          dependencies: [{ resolved: 'src/lib.ts', circular: true }],
          dependents: ['src/app.ts'],
          instability: 0.5,
        },
      ],
    }, 2)

    expect(view).toEqual({
      summary: {
        totalFiles: 3,
        filesInCycles: 2,
        averageInstability: 0.5,
        highestDependencies: 2,
        highestDependents: 2,
      },
      byFile: [
        {
          path: 'src/app.ts',
          dependencies: 2,
          dependents: 0,
          instability: 1,
          inCycle: true,
        },
        {
          path: 'src/lib.ts',
          dependencies: 0,
          dependents: 2,
          instability: 0,
          inCycle: false,
        },
        {
          path: 'src/ui.ts',
          dependencies: 1,
          dependents: 1,
          instability: 0.5,
          inCycle: true,
        },
      ],
      highlyUnstableFiles: [
        {
          path: 'src/app.ts',
          dependencies: 2,
          dependents: 0,
          instability: 1,
          inCycle: true,
        },
        {
          path: 'src/ui.ts',
          dependencies: 1,
          dependents: 1,
          instability: 0.5,
          inCycle: true,
        },
      ],
      stableHighlyDependedOnFiles: [
        {
          path: 'src/lib.ts',
          dependencies: 0,
          dependents: 2,
          instability: 0,
          inCycle: false,
        },
        {
          path: 'src/ui.ts',
          dependencies: 1,
          dependents: 1,
          instability: 0.5,
          inCycle: true,
        },
      ],
    })
  })
})

describe('history store', () => {
  it('creates snapshot filenames with sanitized timestamps', () => {
    const snapshot = createSnapshot({
      src: 'src',
      results: [],
      duration: 100,
      git: { commit: 'abc1234', branch: 'main', dirty: false },
      timestamp: '2026-03-10T17:15:30.123Z',
    })

    expect(createSnapshotFilename(snapshot)).toBe('2026-03-10T17-15-30.123Z_abc1234')
  })

  it('loads snapshots newest first', () => {
    const cwd = makeTempDir()

    saveSnapshot({
      cwd,
      src: 'src',
      historyDir: '.codeweather',
      results: [],
      duration: 100,
      timestamp: '2026-03-10T10:00:00.000Z',
      git: { commit: 'aaa1111', branch: 'main', dirty: false },
    })
    saveSnapshot({
      cwd,
      src: 'src',
      historyDir: '.codeweather',
      results: [],
      duration: 200,
      timestamp: '2026-03-10T11:00:00.000Z',
      git: { commit: 'bbb2222', branch: 'main', dirty: true },
    })

    const snapshots = loadSnapshots(cwd, '.codeweather')

    expect(snapshots).toHaveLength(2)
    expect(snapshots[0]?.git?.commit).toBe('bbb2222')
    expect(snapshots[1]?.git?.commit).toBe('aaa1111')
  })

  it('returns no git metadata outside a repo', async () => {
    const cwd = makeTempDir()
    await expect(getGitMeta(cwd)).resolves.toBeUndefined()
  })

  it('prunes old snapshots when maxSnapshots is exceeded', () => {
    const cwd = makeTempDir()

    saveSnapshot({
      cwd,
      src: 'src',
      historyDir: '.codeweather',
      results: [],
      duration: 100,
      timestamp: '2026-03-10T10:00:00.000Z',
      git: { commit: 'aaa1111', branch: 'main', dirty: false },
    })
    saveSnapshot({
      cwd,
      src: 'src',
      historyDir: '.codeweather',
      results: [],
      duration: 100,
      timestamp: '2026-03-10T11:00:00.000Z',
      git: { commit: 'bbb2222', branch: 'main', dirty: false },
    })
    saveSnapshot({
      cwd,
      src: 'src',
      historyDir: '.codeweather',
      results: [],
      duration: 100,
      timestamp: '2026-03-10T12:00:00.000Z',
      git: { commit: 'ccc3333', branch: 'main', dirty: false },
    })

    expect(pruneSnapshots(cwd, '.codeweather', 2)).toBe(1)
    expect(loadSnapshots(cwd, '.codeweather').map((snapshot) => snapshot.git?.commit)).toEqual([
      'ccc3333',
      'bbb2222',
    ])
  })

  it('writes snapshot bundles with summary, report, tree, and artifacts', () => {
    const cwd = makeTempDir()

    const saved = saveSnapshot({
      cwd,
      src: 'src',
      historyDir: '.codeweather',
      duration: 125,
      report: '# bundle report',
      timestamp: '2026-03-10T13:00:00.000Z',
      results: [
        {
          name: 'Codebase Stats',
          status: 'pass',
          summary: 'ok',
          duration: 5,
          output: '',
          metrics: {
            kind: 'stats-overview',
            totalFiles: 2,
            totalLines: 30,
            totalCode: 20,
            totalComplexity: 7,
            totalBlanks: 5,
            totalComments: 5,
            languages: [],
          },
          artifacts: [
            {
              id: 'stats-overview',
              format: 'json',
              data: [{ Name: 'TypeScript', Count: 2, Lines: 30, Code: 20, Blank: 5, Comment: 5, Complexity: 7 }],
            },
            {
              id: 'stats-complexity',
              format: 'json',
              data: [
                {
                  Name: 'TypeScript',
                  Files: [
                    { Location: 'src/a.ts', Lines: 10, Code: 7, Complexity: 3 },
                    { Location: 'src/nested/b.ts', Lines: 20, Code: 13, Complexity: 4 },
                  ],
                },
              ],
            },
          ],
        },
        {
          name: 'Unused Code',
          status: 'warn',
          summary: 'ok',
          duration: 4,
          output: '',
          metrics: {
            kind: 'unused',
            unusedFiles: 1,
            unusedExports: 1,
            unusedTypes: 0,
            unusedDependencies: 0,
            totalIssues: 2,
          },
          artifacts: [
            {
              id: 'unused',
              format: 'json',
              data: {
                files: ['src/unused.ts'],
                issues: [{ file: 'src/a.ts', exports: [{ name: 'foo' }] }],
              },
            },
          ],
        },
        {
          name: 'Code Duplication',
          status: 'warn',
          summary: 'ok',
          duration: 4,
          output: '',
          metrics: {
            kind: 'duplicates',
            totalClones: 1,
            duplicatedLinesPercent: 2.4,
            duplicatedTokensPercent: 3.1,
            totalLines: 30,
          },
          artifacts: [
            {
              id: 'duplicates',
              format: 'json',
              data: {
                duplicates: [
                  {
                    firstFile: { name: 'src/a.ts' },
                    secondFile: { name: 'src/nested/b.ts' },
                  },
                ],
                statistics: { total: { clones: 1, percentage: 2.4, percentageTokens: 3.1, lines: 30 } },
              },
            },
          ],
        },
        {
          name: 'Circular Dependencies',
          status: 'warn',
          summary: 'ok',
          duration: 4,
          output: '',
          metrics: {
            kind: 'cycles',
            totalModules: 2,
            totalDependencies: 2,
            cycleCount: 1,
          },
          artifacts: [
            {
              id: 'cycles',
              format: 'json',
              data: {
                modules: [
                  {
                    source: 'src/a.ts',
                    dependencies: [{ resolved: 'src/nested/b.ts', circular: true }],
                    dependents: ['src/nested/b.ts'],
                    instability: 0.5,
                  },
                  {
                    source: 'src/nested/b.ts',
                    dependencies: [{ resolved: 'src/a.ts', circular: true }],
                    dependents: ['src/a.ts'],
                    instability: 0.5,
                  },
                ],
                summary: {
                  totalCruised: 2,
                  totalDependenciesCruised: 2,
                  violations: [{ name: 'no-circular' }],
                },
              },
            },
          ],
        },
      ],
    })

    expect(existsSync(resolve(saved.path, 'summary.json'))).toBe(true)
    expect(existsSync(resolve(saved.path, 'report.md'))).toBe(true)
    expect(existsSync(resolve(saved.path, 'tree.json'))).toBe(true)
    expect(existsSync(resolve(saved.path, 'artifacts/stats-overview.json'))).toBe(true)
    expect(existsSync(resolve(saved.path, 'artifacts/stats-complexity.json'))).toBe(true)
    expect(existsSync(resolve(saved.path, 'artifacts/unused.json'))).toBe(true)
    expect(existsSync(resolve(saved.path, 'artifacts/duplicates.json'))).toBe(true)
    expect(existsSync(resolve(saved.path, 'artifacts/cycles.json'))).toBe(true)

    expect(readFileSync(resolve(saved.path, 'report.md'), 'utf8')).toBe('# bundle report')

    const bundle = loadSnapshotBundle(cwd, '.codeweather', saved.summary.id)
    expect(bundle?.summary.version).toBe(3)
    expect(bundle?.summary.tree.rootId).toBe('src')
    expect(bundle?.summary.artifacts.map((artifact) => artifact.id)).toEqual([
      'stats-overview',
      'stats-complexity',
      'unused',
      'duplicates',
      'cycles',
    ])

    expect(bundle?.tree.nodes['src'].stats).toEqual({
      files: 2,
      lines: 30,
      code: 20,
      complexity: 7,
    })
    expect(bundle?.tree.nodes['src'].issues).toEqual({
      total: 6,
      unused: 2,
      duplication: 2,
      cycles: 2,
    })
    expect(bundle?.tree.nodes['src/a.ts']?.issues).toEqual({
      total: 3,
      unused: 1,
      duplication: 1,
      cycles: 1,
    })
    expect(bundle?.tree.nodes['src/a.ts']?.dependency).toEqual({
      dependencies: 1,
      dependents: 1,
      instability: 0.5,
      inCycle: true,
    })
    expect(bundle?.tree.nodes['src/nested']?.issues).toEqual({
      total: 2,
      unused: 0,
      duplication: 1,
      cycles: 1,
    })
    expect(bundle?.summary.instability).toEqual({
      summary: {
        totalFiles: 2,
        filesInCycles: 2,
        averageInstability: 0.5,
        highestDependencies: 1,
        highestDependents: 1,
      },
      highlyUnstableFiles: [
        {
          path: 'src/a.ts',
          dependencies: 1,
          dependents: 1,
          instability: 0.5,
          inCycle: true,
        },
        {
          path: 'src/nested/b.ts',
          dependencies: 1,
          dependents: 1,
          instability: 0.5,
          inCycle: true,
        },
      ],
      stableHighlyDependedOnFiles: [
        {
          path: 'src/a.ts',
          dependencies: 1,
          dependents: 1,
          instability: 0.5,
          inCycle: true,
        },
        {
          path: 'src/nested/b.ts',
          dependencies: 1,
          dependents: 1,
          instability: 0.5,
          inCycle: true,
        },
      ],
    })
  })
})

describe('output helpers', () => {
  it('keeps json output as an array while adding metrics', () => {
    const result: CheckResult = {
      name: 'Codebase Stats',
      status: 'pass',
      summary: 'Codebase overview generated',
      duration: 123,
      output: 'ok',
      metrics: {
        kind: 'stats-overview',
        totalFiles: 2,
        totalLines: 10,
        totalCode: 8,
        totalComplexity: 3,
        totalBlanks: 1,
        totalComments: 1,
        languages: [],
      },
    }

    const parsed = JSON.parse(toJson([result]))

    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed[0]?.metrics?.kind).toBe('stats-overview')
    expect(parsed[0]?.name).toBe('Codebase Stats')
  })

  it('formats positive, zero, and negative trend deltas', () => {
    const currentResults: CheckResult[] = [
      {
        name: 'Codebase Stats',
        status: 'pass',
        summary: 'ok',
        duration: 1,
        output: '',
        metrics: {
          kind: 'stats-overview',
          totalFiles: 10,
          totalLines: 12450,
          totalCode: 9000,
          totalComplexity: 890,
          totalBlanks: 1000,
          totalComments: 500,
          languages: [],
        },
      },
      {
        name: 'Unused Code',
        status: 'warn',
        summary: 'ok',
        duration: 1,
        output: '',
        metrics: {
          kind: 'unused',
          unusedFiles: 0,
          unusedExports: 1,
          unusedTypes: 0,
          unusedDependencies: 0,
          totalIssues: 3,
        },
      },
      {
        name: 'Code Duplication',
        status: 'warn',
        summary: 'ok',
        duration: 1,
        output: '',
        metrics: {
          kind: 'duplicates',
          totalClones: 1,
          duplicatedLinesPercent: 2.1,
          duplicatedTokensPercent: 2.4,
          totalLines: 1000,
        },
      },
      {
        name: 'Circular Dependencies',
        status: 'pass',
        summary: 'ok',
        duration: 1,
        output: '',
        metrics: {
          kind: 'cycles',
          totalModules: 20,
          totalDependencies: 30,
          cycleCount: 1,
        },
      },
    ]

    const previousSnapshot = createSnapshot({
      src: 'src',
      results: [
        {
          name: 'Codebase Stats',
          status: 'pass',
          summary: 'ok',
          duration: 1,
          output: '',
          metrics: {
            kind: 'stats-overview',
            totalFiles: 10,
            totalLines: 12330,
            totalCode: 8900,
            totalComplexity: 895,
            totalBlanks: 1000,
            totalComments: 500,
            languages: [],
          },
        },
        {
          name: 'Unused Code',
          status: 'warn',
          summary: 'ok',
          duration: 1,
          output: '',
          metrics: {
            kind: 'unused',
            unusedFiles: 0,
            unusedExports: 1,
            unusedTypes: 0,
            unusedDependencies: 0,
            totalIssues: 3,
          },
        },
        {
          name: 'Code Duplication',
          status: 'warn',
          summary: 'ok',
          duration: 1,
          output: '',
          metrics: {
            kind: 'duplicates',
            totalClones: 1,
            duplicatedLinesPercent: 1.8,
            duplicatedTokensPercent: 2.1,
            totalLines: 950,
          },
        },
        {
          name: 'Circular Dependencies',
          status: 'pass',
          summary: 'ok',
          duration: 1,
          output: '',
          metrics: {
            kind: 'cycles',
            totalModules: 20,
            totalDependencies: 30,
            cycleCount: 2,
          },
        },
      ],
      duration: 10,
      timestamp: '2026-03-10T10:00:00.000Z',
    })

    expect(getTrendLine(currentResults, previousSnapshot)).toBe(
      'Lines 12,450 (+120) · Complexity 890 (-5) · Unused 3 (=) · Duplication 2.1% (+0.3%) · Cycles 1 (-1)',
    )
  })

  it('includes trend text in markdown when provided', () => {
    const markdown = toMarkdown([], {
      trendLine: 'Lines 100 (+5) · Complexity 10 (=)',
    })

    expect(markdown).toContain('> Trend: Lines 100 (+5) · Complexity 10 (=)')
  })

  it('renders dependency instability rankings in markdown from depcruise artifacts', () => {
    const markdown = toMarkdown([
      {
        name: 'Circular Dependencies',
        status: 'warn',
        summary: 'ok',
        duration: 1,
        output: '',
        artifacts: [
          {
            id: 'cycles',
            format: 'json',
            data: {
              modules: [
                {
                  source: 'src/app.ts',
                  dependencies: [{ resolved: 'src/lib.ts', circular: true }],
                  dependents: [],
                  instability: 1,
                },
                {
                  source: 'src/lib.ts',
                  dependencies: [],
                  dependents: ['src/app.ts'],
                  instability: 0,
                },
              ],
            },
          },
        ],
      },
    ], { top: 5 })

    expect(markdown).toContain('## Dependency Instability')
    expect(markdown).toContain('Highly Unstable Files')
    expect(markdown).toContain('Stable Highly-Depended-On Files')
    expect(markdown).toContain('`src/app.ts`')
    expect(markdown).toContain('100.0%')
  })
})
