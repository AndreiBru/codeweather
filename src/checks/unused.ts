import type { Check, CheckResult, UnusedMetrics } from './types.js'
import type { ResolvedConfig } from '../config.js'
import { exec, ownBin } from '../utils/exec.js'
import { stripFlagPairs } from '../utils/args.js'

interface KnipIssueEntry {
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

interface KnipJsonResult {
  files?: unknown
  issues?: KnipIssueEntry[]
}

interface KnipIssueRow extends KnipIssueEntry {
  file?: string
}

interface KnipJsonArtifact extends KnipJsonResult {
  issues?: KnipIssueRow[]
}

function buildArgs(
  config: ResolvedConfig,
  options: { forceJsonReporter?: boolean } = {},
): string[] {
  const { unused } = config
  const args = ['--no-exit-code']

  if (unused.configFile) args.push('--config', unused.configFile)
  if (unused.production) args.push('--production')
  if (unused.strict) args.push('--strict')
  if (!options.forceJsonReporter && unused.reporter) args.push('--reporter', unused.reporter)
  if (unused.workspace) args.push('--workspace', unused.workspace)
  if (unused.includeEntryExports) args.push('--include-entry-exports')
  if (unused.cache) args.push('--cache')
  if (unused.maxIssues != null) args.push('--max-issues', String(unused.maxIssues))
  for (const include of unused.include) args.push('--include', include)
  for (const exclude of unused.exclude) args.push('--exclude', exclude)
  for (const tag of unused.tags) args.push('--tags', tag)

  const extraArgs = options.forceJsonReporter
    ? stripFlagPairs(unused.args, new Set(['--reporter', '--reporter-options', '--preprocessor', '--preprocessor-options']))
    : unused.args

  args.push(...extraArgs)

  if (options.forceJsonReporter) {
    args.push('--reporter', 'json')
  }

  return args
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

export function parseKnipMetrics(output: string): UnusedMetrics | undefined {
  try {
    const parsed = JSON.parse(output) as KnipJsonResult
    const issues = Array.isArray(parsed.issues) ? parsed.issues : []

    const unusedFiles = countNestedEntries(parsed.files)
    const unusedExports = issues.reduce(
      (sum, issue) => (
        sum +
        countNestedEntries(issue.exports) +
        countNestedEntries(issue.nsExports) +
        countNestedEntries(issue.classMembers) +
        countNestedEntries(issue.enumMembers)
      ),
      0,
    )
    const unusedTypes = issues.reduce(
      (sum, issue) => sum + countNestedEntries(issue.types) + countNestedEntries(issue.nsTypes),
      0,
    )
    const unusedDependencies = issues.reduce(
      (sum, issue) => (
        sum +
        countNestedEntries(issue.dependencies) +
        countNestedEntries(issue.devDependencies) +
        countNestedEntries(issue.optionalPeerDependencies) +
        countNestedEntries(issue.unlisted) +
        countNestedEntries(issue.binaries) +
        countNestedEntries(issue.unresolved) +
        countNestedEntries(issue.catalog)
      ),
      0,
    )
    const totalIssues = unusedFiles + issues.reduce(
      (sum, issue) => (
        sum +
        countNestedEntries(issue.dependencies) +
        countNestedEntries(issue.devDependencies) +
        countNestedEntries(issue.optionalPeerDependencies) +
        countNestedEntries(issue.unlisted) +
        countNestedEntries(issue.binaries) +
        countNestedEntries(issue.unresolved) +
        countNestedEntries(issue.exports) +
        countNestedEntries(issue.nsExports) +
        countNestedEntries(issue.classMembers) +
        countNestedEntries(issue.types) +
        countNestedEntries(issue.nsTypes) +
        countNestedEntries(issue.enumMembers) +
        countNestedEntries(issue.duplicates) +
        countNestedEntries(issue.catalog)
      ),
      0,
    )

    return {
      kind: 'unused',
      unusedFiles,
      unusedExports,
      unusedTypes,
      unusedDependencies,
      totalIssues,
    }
  } catch {
    return undefined
  }
}

async function extractMetrics(
  config: ResolvedConfig,
): Promise<{ metrics?: UnusedMetrics; artifacts?: CheckResult['artifacts'] }> {
  const result = await exec(ownBin('knip'), buildArgs(config, { forceJsonReporter: true }), {
    cwd: config.cwd,
  })

  if (result.exitCode !== 0) {
    return { metrics: undefined, artifacts: undefined }
  }

  let artifact: KnipJsonArtifact | undefined
  try {
    artifact = JSON.parse(result.stdout) as KnipJsonArtifact
  } catch {
    artifact = undefined
  }

  return {
    metrics: parseKnipMetrics(result.stdout),
    artifacts: artifact
      ? [{ id: 'unused', format: 'json', data: artifact }]
      : undefined,
  }
}

export const unusedCheck: Check = {
  name: 'Unused Code',

  async isAvailable() {
    return true
  },

  async run(config: ResolvedConfig): Promise<CheckResult> {
    const start = Date.now()
    const result = await exec(ownBin('knip'), buildArgs(config), { cwd: config.cwd })
    const duration = Date.now() - start

    const output = result.stdout

    const { metrics, artifacts } = await extractMetrics(config)
    const hasIssues = metrics
      ? metrics.totalIssues > 0
      : (
        output.includes('Unused') ||
        output.includes('unused') ||
        output.includes('Unlisted')
      )

    const summary = hasIssues
      ? 'Unused exports or dependencies found'
      : 'No unused code detected'

    return {
      name: 'Unused Code',
      status: hasIssues ? 'warn' : 'pass',
      summary,
      output,
      duration,
      metrics,
      artifacts,
    }
  },
}
