import { lilconfig } from 'lilconfig'
import { detectSrcDir, detectTsConfig } from './utils/detect.js'

export interface UserConfig {
  src?: string
  extensions?: string[]
  stats?: {
    top?: number
    exclude?: string[]
    excludeDir?: string[]
    excludeExt?: string[]
    notMatch?: string
    wide?: boolean
    noMinGen?: boolean
    noCocomo?: boolean
    noDuplicates?: boolean
    largeLineCount?: number
    largeByteCount?: number
    format?: string
    args?: string[]
  }
  unused?: {
    configFile?: string
    include?: string[]
    exclude?: string[]
    production?: boolean
    strict?: boolean
    reporter?: string
    workspace?: string
    tags?: string[]
    maxIssues?: number
    includeEntryExports?: boolean
    cache?: boolean
    args?: string[]
  }
  duplicates?: {
    formats?: string[]
    minLines?: number
    minTokens?: number
    maxLines?: number
    maxSize?: string
    threshold?: number
    ignore?: string[]
    ignorePattern?: string
    reporters?: string[]
    mode?: 'strict' | 'mild' | 'weak'
    gitignore?: boolean
    skipLocal?: boolean
    configFile?: string
    args?: string[]
  }
  cycles?: {
    tsConfig?: string
    configFile?: string
    includeOnly?: string
    exclude?: string
    doNotFollow?: string
    severity?: 'error' | 'warn' | 'info'
    metrics?: boolean
    cache?: boolean
    args?: string[]
  }
  graph?: {
    outputDir?: string
    open?: boolean
    exclude?: string
    metrics?: boolean
    collapse?: string
    args?: string[]
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
    excludeDir: string[]
    excludeExt: string[]
    notMatch: string | undefined
    wide: boolean
    noMinGen: boolean
    noCocomo: boolean
    noDuplicates: boolean
    largeLineCount: number | undefined
    largeByteCount: number | undefined
    format: string | undefined
    args: string[]
  }
  unused: {
    configFile: string | undefined
    include: string[]
    exclude: string[]
    production: boolean
    strict: boolean
    reporter: string | undefined
    workspace: string | undefined
    tags: string[]
    maxIssues: number | undefined
    includeEntryExports: boolean
    cache: boolean
    args: string[]
  }
  duplicates: {
    formats: string[]
    minLines: number | undefined
    minTokens: number | undefined
    maxLines: number | undefined
    maxSize: string | undefined
    threshold: number | undefined
    ignore: string[]
    ignorePattern: string | undefined
    reporters: string[]
    mode: 'strict' | 'mild' | 'weak'
    gitignore: boolean
    skipLocal: boolean
    configFile: string | undefined
    args: string[]
  }
  cycles: {
    tsConfig: string | undefined
    configFile: string | undefined
    includeOnly: string | undefined
    exclude: string | undefined
    doNotFollow: string | undefined
    severity: 'error' | 'warn' | 'info'
    metrics: boolean
    cache: boolean
    args: string[]
  }
  graph: {
    outputDir: string
    open: boolean
    exclude: string | undefined
    metrics: boolean
    collapse: string | undefined
    args: string[]
  }
}

export interface CLIFlags {
  src?: string
  config?: string
  json?: boolean
  top?: number
}

export async function loadConfig(
  cwd: string,
  flags: CLIFlags,
): Promise<ResolvedConfig> {
  let u: UserConfig = {}

  try {
    const explorer = lilconfig('codeweather')
    const result = flags.config
      ? await explorer.load(flags.config)
      : await explorer.search(cwd)
    if (result?.config) {
      u = result.config
    }
  } catch {
    // No config found — use defaults
  }

  const src = flags.src ?? u.src ?? detectSrcDir(cwd)
  const top = flags.top ?? u.stats?.top ?? 25
  const tsConfig = u.cycles?.tsConfig ?? detectTsConfig(cwd)

  return {
    cwd,
    src,
    extensions: u.extensions ?? ['ts', 'tsx', 'js', 'jsx'],
    top,
    json: flags.json ?? false,
    stats: {
      top,
      exclude: u.stats?.exclude ?? ['**/mock/', '**/*.test.*'],
      excludeDir: u.stats?.excludeDir ?? [],
      excludeExt: u.stats?.excludeExt ?? [],
      notMatch: u.stats?.notMatch,
      wide: u.stats?.wide ?? false,
      noMinGen: u.stats?.noMinGen ?? true,
      noCocomo: u.stats?.noCocomo ?? true,
      noDuplicates: u.stats?.noDuplicates ?? false,
      largeLineCount: u.stats?.largeLineCount,
      largeByteCount: u.stats?.largeByteCount,
      format: u.stats?.format,
      args: u.stats?.args ?? [],
    },
    unused: {
      configFile: u.unused?.configFile,
      include: u.unused?.include ?? [],
      exclude: u.unused?.exclude ?? [],
      production: u.unused?.production ?? false,
      strict: u.unused?.strict ?? false,
      reporter: u.unused?.reporter,
      workspace: u.unused?.workspace,
      tags: u.unused?.tags ?? [],
      maxIssues: u.unused?.maxIssues,
      includeEntryExports: u.unused?.includeEntryExports ?? false,
      cache: u.unused?.cache ?? false,
      args: u.unused?.args ?? [],
    },
    duplicates: {
      formats: u.duplicates?.formats ?? ['typescript', 'tsx', 'javascript', 'jsx'],
      minLines: u.duplicates?.minLines,
      minTokens: u.duplicates?.minTokens,
      maxLines: u.duplicates?.maxLines,
      maxSize: u.duplicates?.maxSize,
      threshold: u.duplicates?.threshold,
      ignore: u.duplicates?.ignore ?? [],
      ignorePattern: u.duplicates?.ignorePattern,
      reporters: u.duplicates?.reporters ?? [],
      mode: u.duplicates?.mode ?? 'mild',
      gitignore: u.duplicates?.gitignore ?? true,
      skipLocal: u.duplicates?.skipLocal ?? false,
      configFile: u.duplicates?.configFile,
      args: u.duplicates?.args ?? [],
    },
    cycles: {
      tsConfig,
      configFile: u.cycles?.configFile,
      includeOnly: u.cycles?.includeOnly,
      exclude: u.cycles?.exclude,
      doNotFollow: u.cycles?.doNotFollow,
      severity: u.cycles?.severity ?? 'error',
      metrics: u.cycles?.metrics ?? false,
      cache: u.cycles?.cache ?? false,
      args: u.cycles?.args ?? [],
    },
    graph: {
      outputDir: u.graph?.outputDir ?? 'reports',
      open: u.graph?.open ?? true,
      exclude: u.graph?.exclude,
      metrics: u.graph?.metrics ?? false,
      collapse: u.graph?.collapse,
      args: u.graph?.args ?? [],
    },
  }
}
