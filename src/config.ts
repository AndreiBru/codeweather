import { lilconfig } from 'lilconfig'
import { detectSrcDir, detectTsConfig } from './utils/detect.js'

export interface UserConfig {
  src?: string
  extensions?: string[]
  stats?: {
    top?: number
    exclude?: string[]
  }
  duplicates?: {
    formats?: string[]
  }
  cycles?: {
    tsConfig?: string
  }
  graph?: {
    outputDir?: string
    open?: boolean
  }
}

export interface ResolvedConfig {
  cwd: string
  src: string
  extensions: string[]
  top: number
  json: boolean
  stats: {
    top: number
    exclude: string[]
  }
  duplicates: {
    formats: string[]
  }
  cycles: {
    tsConfig: string | undefined
  }
  graph: {
    outputDir: string
    open: boolean
  }
}

export interface CLIFlags {
  src?: string
  config?: string
  json?: boolean
  top?: number
}

const DEFAULTS: Omit<ResolvedConfig, 'cwd'> = {
  src: 'src',
  extensions: ['ts', 'tsx', 'js', 'jsx'],
  top: 25,
  json: false,
  stats: {
    top: 25,
    exclude: ['**/mock/', '**/*.test.*'],
  },
  duplicates: {
    formats: ['typescript', 'tsx', 'javascript', 'jsx'],
  },
  cycles: {
    tsConfig: undefined,
  },
  graph: {
    outputDir: 'reports',
    open: true,
  },
}

export async function loadConfig(
  cwd: string,
  flags: CLIFlags,
): Promise<ResolvedConfig> {
  let userConfig: UserConfig = {}

  try {
    const explorer = lilconfig('codeaudit')
    const result = flags.config
      ? await explorer.load(flags.config)
      : await explorer.search(cwd)
    if (result?.config) {
      userConfig = result.config
    }
  } catch {
    // No config found — use defaults
  }

  const src = flags.src ?? userConfig.src ?? detectSrcDir(cwd)
  const top = flags.top ?? userConfig.stats?.top ?? DEFAULTS.top
  const tsConfig =
    userConfig.cycles?.tsConfig ?? detectTsConfig(cwd)

  return {
    cwd,
    src,
    extensions: userConfig.extensions ?? DEFAULTS.extensions,
    top,
    json: flags.json ?? DEFAULTS.json,
    stats: {
      top,
      exclude: userConfig.stats?.exclude ?? DEFAULTS.stats.exclude,
    },
    duplicates: {
      formats: userConfig.duplicates?.formats ?? DEFAULTS.duplicates.formats,
    },
    cycles: {
      tsConfig,
    },
    graph: {
      outputDir: userConfig.graph?.outputDir ?? DEFAULTS.graph.outputDir,
      open: userConfig.graph?.open ?? DEFAULTS.graph.open,
    },
  }
}
