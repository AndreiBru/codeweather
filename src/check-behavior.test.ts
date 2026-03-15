import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ResolvedConfig } from './config.js'

afterEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
  vi.unmock('./utils/exec.js')
})

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    cwd: process.cwd(),
    src: 'src',
    extensions: ['ts', 'tsx', 'js', 'jsx'],
    top: 25,
    json: false,
    stats: {
      top: 25,
      exclude: [],
      excludeDir: [],
      excludeExt: [],
      notMatch: undefined,
      wide: false,
      noMinGen: true,
      noCocomo: true,
      noDuplicates: false,
      largeLineCount: undefined,
      largeByteCount: undefined,
      format: undefined,
      args: [],
    },
    unused: {
      configFile: undefined,
      include: [],
      exclude: [],
      production: false,
      strict: false,
      reporter: undefined,
      workspace: undefined,
      tags: [],
      maxIssues: undefined,
      includeEntryExports: false,
      cache: false,
      args: [],
    },
    duplicates: {
      formats: ['typescript', 'tsx', 'javascript', 'jsx'],
      minLines: undefined,
      minTokens: undefined,
      maxLines: undefined,
      maxSize: undefined,
      threshold: undefined,
      ignore: [],
      ignorePattern: undefined,
      reporters: [],
      mode: 'mild',
      gitignore: true,
      skipLocal: false,
      configFile: undefined,
      args: [],
    },
    cycles: {
      tsConfig: undefined,
      configFile: undefined,
      includeOnly: undefined,
      exclude: undefined,
      doNotFollow: undefined,
      severity: 'error',
      metrics: false,
      cache: false,
      args: [],
    },
    graph: {
      outputDir: 'reports',
      open: false,
      exclude: undefined,
      metrics: false,
      collapse: undefined,
      args: [],
    },
    history: {
      enabled: true,
      dir: '.codeweather',
      maxSnapshots: undefined,
    },
    ...overrides,
  }
}

describe('check behavior', () => {
  it('passes stats.exclude patterns through to scc as not-match regexes', async () => {
    const execMock = vi.fn()
      .mockResolvedValueOnce({ stdout: 'tabular output', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({
        stdout: JSON.stringify([{ Name: 'TypeScript', Count: 1, Lines: 10, Code: 8, Blank: 1, Comment: 1, Complexity: 2 }]),
        stderr: '',
        exitCode: 0,
      })

    vi.doMock('./utils/exec.js', () => ({
      exec: execMock,
      isOnPath: vi.fn(async () => true),
    }))

    const { statsOverview } = await import('./checks/stats.js')
    await statsOverview.run(makeConfig({
      stats: {
        ...makeConfig().stats,
        exclude: ['**/generated/', '**/*.test.*'],
        notMatch: 'stories',
      },
    }))

    const firstArgs = execMock.mock.calls[0]?.[1] as string[]
    expect(firstArgs).toContain('(^|.*/)generated(/.*)?$')
    expect(firstArgs).toContain('(^|.*/)[^/]*\\.test\\.[^/]*$')
    expect(firstArgs).toContain('stories')
  })

  it('captures complexity metrics from scc json without forcing wide text output', async () => {
    const execMock = vi.fn()
      .mockResolvedValueOnce({ stdout: 'tabular complexity output', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({
        stdout: JSON.stringify([
          {
            Name: 'TypeScript',
            Files: [
              { Location: 'src/a.ts', Lines: 10, Code: 8, Complexity: 7 },
              { Location: 'src/b.ts', Lines: 12, Code: 9, Complexity: 3 },
            ],
          },
        ]),
        stderr: '',
        exitCode: 0,
      })

    vi.doMock('./utils/exec.js', () => ({
      exec: execMock,
      isOnPath: vi.fn(async () => true),
    }))

    const { statsComplexity } = await import('./checks/stats.js')
    const result = await statsComplexity.run(makeConfig())

    expect(result.metrics).toEqual({
      kind: 'stats-complexity',
      topFiles: [
        { path: 'src/a.ts', lines: 10, code: 8, complexity: 7 },
        { path: 'src/b.ts', lines: 12, code: 9, complexity: 3 },
      ],
    })
    expect(result.artifacts?.[0]).toEqual({
      id: 'stats-complexity',
      format: 'json',
      data: [
        {
          Name: 'TypeScript',
          Files: [
            { Location: 'src/a.ts', Lines: 10, Code: 8, Complexity: 7 },
            { Location: 'src/b.ts', Lines: 12, Code: 9, Complexity: 3 },
          ],
        },
      ],
    })

    const jsonArgs = execMock.mock.calls[1]?.[1] as string[]
    expect(jsonArgs).toContain('-f')
    expect(jsonArgs).toContain('json')
    expect(jsonArgs).not.toContain('-w')
  })

  it('marks knip results as warn from metrics even when stdout is json', async () => {
    const execMock = vi.fn()
      .mockResolvedValueOnce({ stdout: '{"issues":[{"exports":[{"name":"foo"}]}]}', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '{"issues":[{"exports":[{"name":"foo"}]}]}', stderr: '', exitCode: 0 })

    vi.doMock('./utils/exec.js', () => ({
      exec: execMock,
      ownBin: vi.fn((name: string) => name),
    }))

    const { unusedCheck } = await import('./checks/unused.js')
    const result = await unusedCheck.run(makeConfig({
      unused: {
        ...makeConfig().unused,
        reporter: 'json',
      },
    }))

    expect(result.status).toBe('warn')
    expect(result.metrics?.kind).toBe('unused')
  })

  it('marks jscpd results as warn from metrics even when stdout is non-console output', async () => {
    const execMock = vi.fn(async (_command: string, args: string[]) => {
      const outputIndex = args.indexOf('-o')
      if (outputIndex >= 0) {
        const outputDir = args[outputIndex + 1]
        writeFileSync(
          join(outputDir, 'jscpd-report.json'),
          JSON.stringify({
            statistics: {
              total: {
                clones: 2,
                percentage: 1.2,
                percentageTokens: 1.5,
                lines: 200,
              },
            },
          }),
        )
      }

      return { stdout: '{}', stderr: '', exitCode: 0 }
    })

    vi.doMock('./utils/exec.js', () => ({
      exec: execMock,
      ownBin: vi.fn((name: string) => name),
    }))

    const { duplicatesCheck } = await import('./checks/duplicates.js')
    const result = await duplicatesCheck.run(makeConfig({
      duplicates: {
        ...makeConfig().duplicates,
        reporters: ['json'],
      },
    }))

    expect(result.status).toBe('warn')
    expect(result.metrics?.kind).toBe('duplicates')
  })

  it('marks depcruise results as warn from metrics even when stdout is json', async () => {
    const execMock = vi.fn()
      .mockResolvedValueOnce({ stdout: '{}', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          modules: [{ dependencies: [{ circular: true }] }],
          summary: {
            totalCruised: 4,
            totalDependenciesCruised: 6,
            violations: [{ name: 'no-circular' }],
          },
        }),
        stderr: '',
        exitCode: 0,
      })

    vi.doMock('./utils/exec.js', () => ({
      exec: execMock,
      ownBin: vi.fn((name: string) => name),
    }))

    const { cyclesCheck } = await import('./checks/cycles.js')
    const result = await cyclesCheck.run(makeConfig({
      cycles: {
        ...makeConfig().cycles,
        args: ['--output-type', 'json'],
      },
    }))

    expect(result.status).toBe('warn')
    expect(result.metrics?.kind).toBe('cycles')
  })
})
