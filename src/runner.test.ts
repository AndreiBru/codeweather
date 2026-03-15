import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CheckResult, StatsOverviewMetrics } from './checks/types.js'
import type { ResolvedConfig } from './config.js'
import { createSnapshot } from './history/store.js'
import type { SnapshotSummary } from './history/types.js'

function makeResult(
  name: string,
  metrics?: CheckResult['metrics'],
): CheckResult {
  return {
    name,
    status: 'pass',
    summary: 'ok',
    output: `${name} output`,
    duration: 10,
    metrics,
  }
}

const overviewMetrics: StatsOverviewMetrics = {
  kind: 'stats-overview',
  totalFiles: 10,
  totalLines: 100,
  totalCode: 80,
  totalComplexity: 20,
  totalBlanks: 10,
  totalComments: 10,
  languages: [],
}

const previousSnapshot: SnapshotSummary = createSnapshot({
  src: 'src',
  timestamp: '2026-03-10T09:00:00.000Z',
  duration: 100,
  results: [
    makeResult('Codebase Stats', overviewMetrics),
    makeResult('Top Complexity', { kind: 'stats-complexity', topFiles: [] }),
    makeResult('Top File Size', { kind: 'stats-lines', topFiles: [] }),
    makeResult('Unused Code', {
      kind: 'unused',
      unusedFiles: 0,
      unusedExports: 1,
      unusedTypes: 0,
      unusedDependencies: 0,
      totalIssues: 1,
    }),
    makeResult('Code Duplication', {
      kind: 'duplicates',
      totalClones: 1,
      duplicatedLinesPercent: 1.1,
      duplicatedTokensPercent: 1.5,
      totalLines: 100,
    }),
    makeResult('Circular Dependencies', {
      kind: 'cycles',
      totalModules: 10,
      totalDependencies: 12,
      cycleCount: 0,
    }),
  ],
})

let tempDir: string

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'codeweather-runner-'))
  vi.resetModules()
  vi.restoreAllMocks()
})

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    cwd: tempDir,
    src: 'src',
    extensions: ['ts'],
    top: 5,
    json: false,
    stats: {
      top: 5,
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
      formats: ['typescript'],
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

async function loadRunnerWithMocks(options: {
  previous?: SnapshotSummary
  saveSnapshotImpl?: ReturnType<typeof vi.fn>
  printDeltaImpl?: ReturnType<typeof vi.fn>
}) {
  const saveSnapshotSpy = options.saveSnapshotImpl ?? vi.fn()
  const printDeltaSpy = options.printDeltaImpl ?? vi.fn()
  const printSummarySpy = vi.fn()
  const printResultSpy = vi.fn()

  vi.doMock('./checks/stats.js', () => ({
    statsOverview: { name: 'Codebase Stats', isAvailable: async () => true, run: async () => makeResult('Codebase Stats', overviewMetrics) },
    statsComplexity: { name: 'Top Complexity', isAvailable: async () => true, run: async () => makeResult('Top Complexity', { kind: 'stats-complexity', topFiles: [] }) },
    statsLines: { name: 'Top File Size', isAvailable: async () => true, run: async () => makeResult('Top File Size', { kind: 'stats-lines', topFiles: [] }) },
  }))
  vi.doMock('./checks/unused.js', () => ({
    unusedCheck: { name: 'Unused Code', isAvailable: async () => true, run: async () => makeResult('Unused Code', { kind: 'unused', unusedFiles: 0, unusedExports: 1, unusedTypes: 0, unusedDependencies: 0, totalIssues: 1 }) },
  }))
  vi.doMock('./checks/duplicates.js', () => ({
    duplicatesCheck: { name: 'Code Duplication', isAvailable: async () => true, run: async () => makeResult('Code Duplication', { kind: 'duplicates', totalClones: 1, duplicatedLinesPercent: 1.2, duplicatedTokensPercent: 1.4, totalLines: 100 }) },
  }))
  vi.doMock('./checks/cycles.js', () => ({
    cyclesCheck: { name: 'Circular Dependencies', isAvailable: async () => true, run: async () => makeResult('Circular Dependencies', { kind: 'cycles', totalModules: 10, totalDependencies: 12, cycleCount: 0 }) },
  }))
  vi.doMock('./output.js', () => ({
    printResult: printResultSpy,
    printSummary: printSummarySpy,
    printDelta: printDeltaSpy,
    getTrendLine: vi.fn(() => 'Trend line'),
    toJson: vi.fn(() => '[]'),
    toMarkdown: vi.fn(() => '# report'),
  }))
  vi.doMock('./history/store.js', () => ({
    loadLatestSnapshot: vi.fn(() => options.previous),
    saveSnapshot: saveSnapshotSpy,
  }))
  vi.doMock('./history/git.js', () => ({
    getGitMeta: vi.fn(async () => undefined),
  }))

  const runner = await import('./runner.js')
  return { runner, saveSnapshotSpy, printDeltaSpy, printSummarySpy, printResultSpy }
}

describe('runAll', () => {
  it('saves a snapshot and prints delta on full terminal runs', async () => {
    const { runner, saveSnapshotSpy, printDeltaSpy, printSummarySpy, printResultSpy } =
      await loadRunnerWithMocks({ previous: previousSnapshot })

    const exitCode = await runner.runAll(makeConfig())

    expect(exitCode).toBe(0)
    expect(saveSnapshotSpy).toHaveBeenCalledOnce()
    expect(printDeltaSpy).toHaveBeenCalledOnce()
    expect(printSummarySpy).toHaveBeenCalledOnce()
    expect(printResultSpy).toHaveBeenCalledTimes(6)
    expect(readFileSync(resolve(tempDir, 'codeweather-report.md'), 'utf8')).toBe('# report')
  })

  it('saves a snapshot but skips delta output for json runs', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { runner, saveSnapshotSpy, printDeltaSpy, printSummarySpy, printResultSpy } =
      await loadRunnerWithMocks({ previous: previousSnapshot })

    const exitCode = await runner.runAll(makeConfig({ json: true }))

    expect(exitCode).toBe(0)
    expect(saveSnapshotSpy).toHaveBeenCalledOnce()
    expect(printDeltaSpy).not.toHaveBeenCalled()
    expect(printSummarySpy).not.toHaveBeenCalled()
    expect(printResultSpy).not.toHaveBeenCalled()
    expect(consoleSpy).toHaveBeenCalledWith('[]')
  })

  it('skips snapshot persistence when history is disabled', async () => {
    const { runner, saveSnapshotSpy, printDeltaSpy } =
      await loadRunnerWithMocks({ previous: previousSnapshot })

    const exitCode = await runner.runAll(makeConfig({
      history: {
        enabled: false,
        dir: '.codeweather',
        maxSnapshots: undefined,
      },
    }))

    expect(exitCode).toBe(0)
    expect(saveSnapshotSpy).not.toHaveBeenCalled()
    expect(printDeltaSpy).not.toHaveBeenCalled()
  })

  it('does not create snapshots when an individual check runs directly', async () => {
    vi.resetModules()
    vi.unmock('./checks/stats.js')
    const { statsOverview } = await import('./checks/stats.js')
    const cwd = mkdtempSync(join(tmpdir(), 'codeweather-single-'))
    tempDir = cwd
    const config = makeConfig({ cwd })

    await statsOverview.run(config)

    expect(existsSync(resolve(cwd, '.codeweather/snapshots'))).toBe(false)
  })
})
