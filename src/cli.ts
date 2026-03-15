import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { defineCommand, runMain } from 'citty'
import { loadConfig, type ResolvedConfig } from './config.js'
import { runAll } from './runner.js'
import { printResult, toJson } from './output.js'
import type { Check, CheckResult } from './checks/types.js'
import {
  statsOverview,
  statsComplexity,
  statsLines,
  statsDry,
} from './checks/stats.js'
import { unusedCheck } from './checks/unused.js'
import { duplicatesCheck } from './checks/duplicates.js'
import { cyclesCheck } from './checks/cycles.js'
import { createGraphCheck } from './checks/graph.js'
import { renderDashboardHtml } from './dashboard/render.js'
import { renderHistoryTable } from './history/render.js'
import { getHistoryDir, loadSnapshotBundle, loadSnapshots } from './history/store.js'
import { openPath } from './utils/open.js'

const globalArgs = {
  src: {
    type: 'string' as const,
    description: 'Source directory (default: auto-detect "src" or ".")',
  },
  config: {
    type: 'string' as const,
    description: 'Config file path',
  },
  json: {
    type: 'boolean' as const,
    description: 'JSON output (for CI)',
    default: false,
  },
  top: {
    type: 'string' as const,
    description: 'Number of files in ranked lists (default: 25)',
  },
  noHistory: {
    type: 'boolean' as const,
    description: 'Skip saving snapshot history for this run',
    default: false,
  },
}

async function resolveConfig(args: Record<string, unknown>) {
  const cwd = process.cwd()
  return loadConfig(cwd, {
    src: args.src as string | undefined,
    config: args.config as string | undefined,
    json: args.json as boolean | undefined,
    top: args.top ? Number(args.top) : undefined,
    noHistory: args.noHistory as boolean | undefined,
  })
}

function parseLimit(value: unknown): number | undefined {
  if (value == null) {
    return undefined
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

async function runSingle(config: ResolvedConfig, check: Check): Promise<never> {
  const result = await check.run(config)
  if (config.json) {
    console.log(toJson([result]))
  } else {
    printResult(result)
  }
  process.exit(result.status === 'fail' ? 1 : 0)
}

const statsCommand = defineCommand({
  meta: { name: 'stats', description: 'Codebase overview via scc' },
  args: {
    ...globalArgs,
    sort: {
      type: 'string' as const,
      description: 'Sort by: complexity, lines',
    },
    dry: {
      type: 'boolean' as const,
      description: 'DRYness score',
      default: false,
    },
  },
  async run({ args }) {
    const config = await resolveConfig(args)
    let check: Check = statsOverview
    if (args.sort === 'complexity') check = statsComplexity
    else if (args.sort === 'lines') check = statsLines
    else if (args.dry) check = statsDry
    await runSingle(config, check)
  },
})

const unusedCommand = defineCommand({
  meta: { name: 'unused', description: 'Unused code via knip' },
  args: globalArgs,
  async run({ args }) {
    await runSingle(await resolveConfig(args), unusedCheck)
  },
})

const duplicatesCommand = defineCommand({
  meta: { name: 'duplicates', description: 'Copy-paste detection via jscpd' },
  args: globalArgs,
  async run({ args }) {
    await runSingle(await resolveConfig(args), duplicatesCheck)
  },
})

const cyclesCommand = defineCommand({
  meta: {
    name: 'cycles',
    description: 'Circular dependency check via dependency-cruiser',
  },
  args: globalArgs,
  async run({ args }) {
    await runSingle(await resolveConfig(args), cyclesCheck)
  },
})

const graphCommand = defineCommand({
  meta: {
    name: 'graph',
    description: 'File-level dependency graph (SVG, requires graphviz)',
  },
  args: {
    ...globalArgs,
    scope: {
      type: 'string' as const,
      description: 'Scope to a specific directory',
    },
    layers: {
      type: 'boolean' as const,
      description: 'Folder-level architecture graph',
      default: false,
    },
    focus: {
      type: 'string' as const,
      description: 'Single file + direct deps',
    },
  },
  async run({ args }) {
    const config = await resolveConfig(args)
    const check = createGraphCheck({
      scope: args.scope as string | undefined,
      layers: args.layers as boolean,
      focus: args.focus as string | undefined,
    })
    await runSingle(config, check)
  },
})

const historyCommand = defineCommand({
  meta: {
    name: 'history',
    description: 'List stored snapshots and trend summaries',
  },
  args: {
    ...globalArgs,
    last: {
      type: 'string' as const,
      description: 'Show only the most recent N snapshots',
    },
  },
  async run({ args }) {
    const config = await resolveConfig(args)
    const snapshots = loadSnapshots(config.cwd, config.history.dir, parseLimit(args.last))

    if (config.json) {
      console.log(JSON.stringify(snapshots, null, 2))
    } else {
      console.log(renderHistoryTable(snapshots))
    }

    process.exit(0)
  },
})

const dashboardCommand = defineCommand({
  meta: {
    name: 'dashboard',
    description: 'Generate an HTML dashboard from snapshot history',
  },
  args: {
    ...globalArgs,
    last: {
      type: 'string' as const,
      description: 'Use only the most recent N snapshots',
    },
    output: {
      type: 'string' as const,
      description: 'Write dashboard HTML to a specific path',
    },
    noOpen: {
      type: 'boolean' as const,
      description: 'Generate the dashboard without opening it',
      default: false,
    },
  },
  async run({ args }) {
    const config = await resolveConfig(args)
    const snapshots = loadSnapshots(config.cwd, config.history.dir, parseLimit(args.last))

    if (snapshots.length === 0) {
      console.error('No snapshots found. Run `codeweather` first to generate history.')
      process.exit(1)
    }

    const historyDir = getHistoryDir(config.cwd, config.history.dir)
    mkdirSync(historyDir, { recursive: true })

    const outputPath = args.output
      ? resolve(config.cwd, args.output as string)
      : resolve(historyDir, 'dashboard.html')
    mkdirSync(dirname(outputPath), { recursive: true })
    const trees = Object.fromEntries(
      snapshots.flatMap((snapshot) => {
        const bundle = loadSnapshotBundle(config.cwd, config.history.dir, snapshot.id)
        return bundle ? [[snapshot.id, bundle.tree] as const] : []
      }),
    )
    const html = renderDashboardHtml(config.cwd, snapshots, trees)
    writeFileSync(outputPath, html)

    if (config.json) {
      console.log(JSON.stringify({ outputPath, snapshots: snapshots.length }, null, 2))
    } else {
      console.log(`Dashboard saved to ${outputPath}`)
    }

    if (!args.noOpen && !config.json) {
      await openPath(outputPath, config.cwd)
    }

    process.exit(0)
  },
})

const main = defineCommand({
  meta: {
    name: 'codeweather',
    version: '0.3.0',
    description:
      'Zero-config code quality audits for JS/TS projects with trend history and a dashboard',
  },
  args: globalArgs,
  subCommands: {
    stats: statsCommand,
    unused: unusedCommand,
    duplicates: duplicatesCommand,
    cycles: cyclesCommand,
    graph: graphCommand,
    history: historyCommand,
    dashboard: dashboardCommand,
  },
  async run({ args }) {
    const config = await resolveConfig(args)
    const exitCode = await runAll(config)
    process.exit(exitCode)
  },
})

runMain(main)
