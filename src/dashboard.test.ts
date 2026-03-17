import { describe, expect, it } from 'vitest'
import { renderDashboardHtml } from './dashboard/render.js'
import { renderHistoryTable } from './history/render.js'
import { createSnapshot } from './history/store.js'

const snapshots = [
  createSnapshot({
    src: 'src',
    timestamp: '2026-03-10T10:00:00.000Z',
    duration: 100,
    git: { commit: 'aaa1111', branch: 'main', dirty: false },
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
          totalLines: 100,
          totalCode: 80,
          totalComplexity: 20,
          totalBlanks: 10,
          totalComments: 10,
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
          totalIssues: 1,
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
          duplicatedLinesPercent: 1.2,
          duplicatedTokensPercent: 1.4,
          totalLines: 100,
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
          totalModules: 10,
          totalDependencies: 12,
          cycleCount: 0,
        },
        artifacts: [
          {
            id: 'cycles',
            format: 'json',
            data: {
              modules: [
                {
                  source: 'src/app.ts',
                  dependencies: [{ resolved: 'src/lib.ts', circular: false }],
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
    ],
  }),
  createSnapshot({
    src: 'src',
    timestamp: '2026-03-10T11:00:00.000Z',
    duration: 120,
    git: { commit: 'bbb2222', branch: 'main', dirty: true },
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
          totalLines: 120,
          totalCode: 90,
          totalComplexity: 24,
          totalBlanks: 12,
          totalComments: 18,
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
          totalIssues: 2,
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
          totalClones: 2,
          duplicatedLinesPercent: 1.5,
          duplicatedTokensPercent: 2.1,
          totalLines: 120,
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
          totalModules: 11,
          totalDependencies: 14,
          cycleCount: 1,
        },
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
    ],
  }),
]

describe('history rendering', () => {
  it('renders a readable history table', () => {
    const table = renderHistoryTable(snapshots)

    expect(table).toContain('Timestamp')
    expect(table).toContain('bbb2222*')
    expect(table).toContain('1.5%')
  })
})

describe('dashboard rendering', () => {
  it('renders self-contained html with Chart.js charts, controls, and tree prototype', () => {
    const html = renderDashboardHtml('/tmp/project-name', snapshots, {
      [snapshots[1].id]: {
        rootId: 'src',
        nodes: {
          src: {
            path: 'src',
            name: 'src',
            kind: 'dir',
            childIds: ['src/app.ts'],
            stats: { files: 1, lines: 120, code: 90, complexity: 24 },
            issues: { total: 3, unused: 2, duplication: 1, cycles: 0 },
          },
          'src/app.ts': {
            path: 'src/app.ts',
            name: 'app.ts',
            kind: 'file',
            childIds: [],
            stats: { files: 1, lines: 120, code: 90, complexity: 24 },
            issues: { total: 3, unused: 2, duplication: 1, cycles: 0 },
            dependency: { dependencies: 1, dependents: 0, instability: 1, inCycle: true },
          },
        },
      },
    }, {
      duplicates: {
        duplicates: [
          {
            lines: 3,
            fragment: 'const shared = true',
            firstFile: {
              name: 'src/app.ts',
              startLoc: { line: 10 },
              endLoc: { line: 12 },
            },
            secondFile: {
              name: 'src/lib.ts',
              startLoc: { line: 20 },
              endLoc: { line: 22 },
            },
          },
        ],
      },
      unused: {
        files: [],
        issues: [
          {
            file: 'src/app.ts',
            exports: [{ name: 'unusedThing', line: 9 }],
            dependencies: [],
            devDependencies: [],
            optionalPeerDependencies: [],
            unlisted: [],
            binaries: [],
            unresolved: [],
            nsExports: [],
            classMembers: [],
            types: [],
            nsTypes: [],
            enumMembers: {},
            duplicates: [],
            catalog: [],
          },
        ],
      },
    })

    expect(html).toContain('<!doctype html>')
    expect(html).toContain('project-name')
    expect(html).toContain('new Chart')
    expect(html).toContain('range-controls')
    expect(html).toContain('Hide Table')
    expect(html).toContain('Codeweather')
    expect(html).toContain('Stats')
    expect(html).toContain('Large Files')
    expect(html).toContain('Complex Files')
    expect(html).toContain('Hot Files')
    expect(html).toContain('Hot Directories')
    expect(html).toContain('Health')
    expect(html).toContain('weighted score from 0-100')
    expect(html).toContain('Hot Files score = round')
    expect(html).toContain('Codebase Tree')
    expect(html).toContain('app.ts')
    expect(html).toContain('Trends')
    expect(html).toContain('Show fragment')
    expect(html).toContain('const shared = true')
    expect(html).toContain('Unused export')
  })
})
