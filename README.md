# codeaudit

Zero-config code quality audits for JS/TS projects — stats, unused code, duplication, circular deps, and dependency graphs.

Wraps best-in-class tools into a single command with sensible defaults. No config needed to get started, but everything is configurable when you need it.

## Install

```bash
npm install -g codeaudit
# or run directly
npx codeaudit
```

### System dependencies

| Dependency | Required for | Install |
|---|---|---|
| [scc](https://github.com/boyter/scc) | `stats` command | `brew install scc` / `go install github.com/boyter/scc/v3@latest` |
| [Graphviz](https://graphviz.org/) | `graph` command | `brew install graphviz` / `sudo apt install graphviz` |

Both are optional — if missing, the relevant check is skipped with an install hint.

## Usage

```bash
codeaudit                          # Run all checks
codeaudit stats                    # Codebase overview via scc
codeaudit stats --sort complexity  # Top files by branching complexity
codeaudit stats --sort lines       # Top files by line count
codeaudit stats --dry              # DRYness score
codeaudit unused                   # Unused code via knip
codeaudit duplicates               # Copy-paste detection via jscpd
codeaudit cycles                   # Circular dependency check
codeaudit graph                    # File-level dependency graph (SVG)
codeaudit graph --scope <dir>      # Scoped graph
codeaudit graph --layers           # Folder-level architecture graph
codeaudit graph --focus <file>     # Single file + direct deps
```

### Global flags

| Flag | Description | Default |
|---|---|---|
| `--src <dir>` | Source directory | Auto-detect `src` or `.` |
| `--config <path>` | Config file path | Auto-detect |
| `--json` | JSON output (for CI) | `false` |
| `--top <n>` | Number of files in ranked lists | `25` |
| `-h, --help` | Show help | |
| `-v, --version` | Show version | |

## Configuration

Optional. Create any of the following:

- `codeaudit.config.js` / `codeaudit.config.cjs`
- `.codeauditrc.json` / `.codeauditrc.yml`
- `"codeaudit"` key in `package.json`

Config is loaded via [lilconfig](https://github.com/antonk52/lilconfig).

All fields are optional. Shown below are the defaults:

```js
// codeaudit.config.js
export default {
  // Shared
  src: 'src',                             // Source directory
  extensions: ['ts', 'tsx', 'js', 'jsx'], // File extensions to analyze

  // scc — codebase statistics
  stats: {
    top: 25,                              // Files shown in ranked lists
    exclude: ['**/mock/', '**/*.test.*'], // Patterns excluded from stats
    excludeDir: [],                       // Directories to exclude (scc --exclude-dir)
    excludeExt: [],                       // Extensions to exclude (scc -x)
    notMatch: undefined,                  // Regex to exclude files (scc -M)
    wide: false,                          // Wide output with extra columns (scc -w)
    noMinGen: true,                       // Exclude minified/generated files (scc -z)
    noCocomo: true,                       // Hide COCOMO estimate
    noDuplicates: false,                  // Remove duplicate files (scc -d)
    largeLineCount: undefined,            // Max lines per file before exclusion
    largeByteCount: undefined,            // Max bytes per file before exclusion
    format: undefined,                    // Output format: tabular, json, csv, html, ...
    args: [],                             // Extra CLI args passed directly to scc
  },

  // knip — unused code detection
  unused: {
    configFile: undefined,                // Path to knip config (knip.json, knip.ts, ...)
    include: [],                          // Issue types to report: files, exports, dependencies, ...
    exclude: [],                          // Issue types to exclude
    production: false,                    // Analyze only production code (no tests/devDeps)
    strict: false,                        // Only direct workspace dependencies
    reporter: undefined,                  // Output format: symbols, compact, json, markdown, ...
    workspace: undefined,                 // Filter by workspace name/directory
    tags: [],                             // Include/exclude tagged exports (e.g. ['-lintignore'])
    maxIssues: undefined,                 // Max total issues before non-zero exit
    includeEntryExports: false,           // Include entry files in unused exports report
    cache: false,                         // Enable caching
    args: [],                             // Extra CLI args passed directly to knip
  },

  // jscpd — copy-paste detection
  duplicates: {
    formats: ['typescript', 'tsx', 'javascript', 'jsx'],
    minLines: undefined,                  // Min clone size in lines (default: 5)
    minTokens: undefined,                 // Min clone size in tokens (default: 50)
    maxLines: undefined,                  // Max source size in lines (default: 1000)
    maxSize: undefined,                   // Max source size: '100kb', '1mb', ...
    threshold: undefined,                 // Duplication % threshold — fail if exceeded
    ignore: [],                           // Glob patterns to exclude
    ignorePattern: undefined,             // Regex to ignore matching code blocks
    reporters: [],                        // Reporters: console, json, xml, html, markdown, ...
    mode: 'mild',                         // Detection quality: strict, mild, weak
    gitignore: true,                      // Respect .gitignore
    skipLocal: false,                     // Only detect cross-folder duplications
    configFile: undefined,                // Path to .jscpd.json for full native config
    args: [],                             // Extra CLI args passed directly to jscpd
  },

  // dependency-cruiser — circular dependency detection
  cycles: {
    tsConfig: undefined,                  // tsconfig path (auto-detected if not set)
    configFile: undefined,                // Path to .dependency-cruiser.js for full native config
    includeOnly: undefined,               // Regex: only include matching modules
    exclude: undefined,                   // Regex: exclude matching modules
    doNotFollow: undefined,               // Regex: include but don't traverse
    severity: 'error',                    // Severity for circular deps: error, warn, info
    metrics: false,                       // Calculate stability metrics
    cache: false,                         // Enable caching
    args: [],                             // Extra CLI args passed directly to depcruise
  },

  // dependency-cruiser + graphviz — dependency graph generation
  graph: {
    outputDir: 'reports',                 // Directory for generated SVGs
    open: true,                           // Auto-open SVG after generation
    exclude: undefined,                   // Regex: exclude matching modules
    metrics: false,                       // Include stability metrics
    collapse: undefined,                  // Custom collapse pattern for --layers
    args: [],                             // Extra CLI args passed directly to depcruise
  },
}
```

### Using native config files

For full control, point to the tool's own config file. codeaudit will use it as-is:

```js
export default {
  unused: { configFile: 'knip.json' },
  duplicates: { configFile: '.jscpd.json' },
  cycles: { configFile: '.dependency-cruiser.cjs' },
}
```

### The `args` escape hatch

Every check has an `args` array for passing arbitrary CLI flags directly to the underlying tool. This covers any option not explicitly mapped:

```js
export default {
  stats: { args: ['--uloc', '--percent'] },
  unused: { args: ['--reporter', 'codeclimate'] },
  duplicates: { args: ['--blame'] },
  cycles: { args: ['--progress', 'cli-feedback'] },
}
```

## CI usage

```bash
npx codeaudit --json > audit.json
```

Exit code is `0` for pass/warn/skip, `1` for any failure.

## Powered by

codeaudit is a thin orchestration layer over these excellent tools:

| Tool | Author | What it does | License |
|---|---|---|---|
| [scc](https://github.com/boyter/scc) | Ben Boyter | Fast code counter — lines, complexity, language stats, DRYness | MIT |
| [knip](https://knip.dev) | Lars Kappert | Find unused files, exports, and dependencies | ISC |
| [jscpd](https://github.com/kucherenko/jscpd) | Andrey Kucherenko | Copy-paste / code duplication detection | MIT |
| [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) | Sander Verweij | Dependency analysis, circular dep detection, graph generation | MIT |
| [Graphviz](https://graphviz.org/) | AT&T / open source | Graph visualization (DOT → SVG rendering) | EPL |

Also built with: [citty](https://github.com/unjs/citty) (CLI), [execa](https://github.com/sindresorhus/execa) (process exec), [picocolors](https://github.com/alexeyraspopov/picocolors) (terminal colors), [lilconfig](https://github.com/antonk52/lilconfig) (config loading), [tsup](https://github.com/egoist/tsup) (bundling).

## License

MIT
