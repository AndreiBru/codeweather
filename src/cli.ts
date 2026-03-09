import { defineCommand, runMain } from 'citty'
import { loadConfig } from './config.js'
import { runAll } from './runner.js'
import { printResult, toJson } from './output.js'
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
}

async function resolveConfig(args: Record<string, unknown>) {
  const cwd = process.cwd()
  return loadConfig(cwd, {
    src: args.src as string | undefined,
    config: args.config as string | undefined,
    json: args.json as boolean | undefined,
    top: args.top ? Number(args.top) : undefined,
  })
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
    let check = statsOverview
    if (args.sort === 'complexity') check = statsComplexity
    else if (args.sort === 'lines') check = statsLines
    else if (args.dry) check = statsDry

    const result = await check.run(config)
    if (config.json) {
      console.log(toJson([result]))
    } else {
      printResult(result)
    }
    process.exit(result.status === 'fail' ? 1 : 0)
  },
})

const unusedCommand = defineCommand({
  meta: { name: 'unused', description: 'Unused code via knip' },
  args: globalArgs,
  async run({ args }) {
    const config = await resolveConfig(args)
    const result = await unusedCheck.run(config)
    if (config.json) {
      console.log(toJson([result]))
    } else {
      printResult(result)
    }
    process.exit(result.status === 'fail' ? 1 : 0)
  },
})

const duplicatesCommand = defineCommand({
  meta: { name: 'duplicates', description: 'Copy-paste detection via jscpd' },
  args: globalArgs,
  async run({ args }) {
    const config = await resolveConfig(args)
    const result = await duplicatesCheck.run(config)
    if (config.json) {
      console.log(toJson([result]))
    } else {
      printResult(result)
    }
    process.exit(result.status === 'fail' ? 1 : 0)
  },
})

const cyclesCommand = defineCommand({
  meta: {
    name: 'cycles',
    description: 'Circular dependency check via dependency-cruiser',
  },
  args: globalArgs,
  async run({ args }) {
    const config = await resolveConfig(args)
    const result = await cyclesCheck.run(config)
    if (config.json) {
      console.log(toJson([result]))
    } else {
      printResult(result)
    }
    process.exit(result.status === 'fail' ? 1 : 0)
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
    const result = await check.run(config)
    if (config.json) {
      console.log(toJson([result]))
    } else {
      printResult(result)
    }
    process.exit(result.status === 'fail' ? 1 : 0)
  },
})

const main = defineCommand({
  meta: {
    name: 'codeaudit',
    version: '0.1.0',
    description:
      'Zero-config code quality audits for JS/TS projects',
  },
  args: globalArgs,
  subCommands: {
    stats: statsCommand,
    unused: unusedCommand,
    duplicates: duplicatesCommand,
    cycles: cyclesCommand,
    graph: graphCommand,
  },
  async run({ args }) {
    const config = await resolveConfig(args)
    const exitCode = await runAll(config)
    process.exit(exitCode)
  },
})

runMain(main)
