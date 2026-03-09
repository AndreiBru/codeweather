import { mkdirSync, existsSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import type { Check, CheckResult } from './types.js'
import type { ResolvedConfig } from '../config.js'
import { exec, isOnPath, ownBin } from '../utils/exec.js'
import { graphvizInstallHint } from '../utils/detect.js'

interface GraphOptions {
  scope?: string
  layers?: boolean
  focus?: string
}

async function generateGraph(
  config: ResolvedConfig,
  options: GraphOptions,
): Promise<CheckResult> {
  const { graph: g } = config
  const start = Date.now()

  const hasDot = await isOnPath('dot')
  if (!hasDot) {
    return {
      name: 'Dependency Graph',
      status: 'skip',
      summary: 'graphviz not installed',
      output: graphvizInstallHint(),
      duration: 0,
    }
  }

  const outputDir = resolve(config.cwd, g.outputDir)
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  const src = options.scope ?? config.src
  const includeOnly = `^${src}`

  let depcruiseArgs: string[]
  let outputFile: string

  if (options.focus) {
    const name = basename(options.focus).replace(/\.[^.]*$/, '')
    outputFile = resolve(outputDir, `focus-${name}.svg`)
    depcruiseArgs = [
      config.src,
      '--no-config',
      '--include-only',
      `^${config.src}`,
      '--focus',
      options.focus,
      '--focus-depth',
      '1',
      '-T',
      'dot',
    ]
  } else if (options.layers) {
    outputFile = resolve(outputDir, 'layers.svg')
    depcruiseArgs = [
      src,
      '--no-config',
      '--include-only',
      includeOnly,
      '--collapse',
      g.collapse ?? `^${src}/[^/]+/`,
      '-T',
      'dot',
    ]
  } else {
    const scopeName = options.scope ? basename(options.scope) : 'full'
    outputFile = resolve(outputDir, `graph-${scopeName}.svg`)
    depcruiseArgs = [
      src,
      '--no-config',
      '--include-only',
      includeOnly,
      '-T',
      'ddot',
    ]
  }

  if (g.exclude) depcruiseArgs.push('--exclude', g.exclude)
  if (g.metrics) depcruiseArgs.push('--metrics')
  depcruiseArgs.push(...g.args)

  const depResult = await exec(ownBin('depcruise'), depcruiseArgs, {
    cwd: config.cwd,
  })
  if (depResult.exitCode !== 0 && !depResult.stdout) {
    return {
      name: 'Dependency Graph',
      status: 'fail',
      summary: 'dependency-cruiser failed',
      output: depResult.stderr,
      duration: Date.now() - start,
    }
  }

  const dotResult = await exec('dot', ['-Tsvg', '-o', outputFile], {
    cwd: config.cwd,
    input: depResult.stdout,
  })

  const duration = Date.now() - start

  if (dotResult.exitCode !== 0) {
    return {
      name: 'Dependency Graph',
      status: 'fail',
      summary: 'graphviz dot failed',
      output: dotResult.stderr,
      duration,
    }
  }

  if (g.open) {
    await exec('open', [outputFile], { cwd: config.cwd })
  }

  return {
    name: 'Dependency Graph',
    status: 'pass',
    summary: `Graph saved to ${outputFile}`,
    output: `Created: ${outputFile}`,
    duration,
  }
}

export function createGraphCheck(options: GraphOptions = {}): Check {
  return {
    name: 'Dependency Graph',
    async isAvailable() {
      return isOnPath('dot')
    },
    async run(config: ResolvedConfig) {
      return generateGraph(config, options)
    },
  }
}
