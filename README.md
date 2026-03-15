# codeweather

Zero-config code quality audits for JS/TS projects — stats, unused code, duplication, circular deps, and dependency graphs.

Wraps best-in-class tools into a single command with sensible defaults. No config needed to get started, but everything is configurable when you need it.

## Quick start

```bash
# 1. Install
npm install -g codeweather

# 2. Install scc (for codebase stats — optional but recommended)
brew install scc            # macOS
# go install github.com/boyter/scc/v3@latest  # or via Go

# 3. Run it
cd your-project
codeweather
```

That's it. codeweather auto-detects your `src` directory, file extensions, and tsconfig. All checks run out of the box.

### What you'll get on first run

| Check | What it tells you |
|---|---|
| **Codebase Stats** | Language breakdown, total lines, code vs comments |
| **Top Complexity** | Files ranked by cyclomatic complexity (branching logic) |
| **Top File Size** | Largest files by line count |
| **Unused Code** | Dead exports, unused files, unlisted dependencies |
| **Duplicates** | Copy-pasted code blocks across your codebase |
| **Circular Deps** | Import cycles plus file-level dependency instability insights from dependency-cruiser |

A markdown report is saved to `codeweather-report.md` after every run. It now includes a `Dependency Instability` section with ranked file-level `dependencies`, `dependents`, `instability`, and cycle participation.

Full runs also store structured snapshots in `.codeweather/snapshots/` so you can track trends over time. Each snapshot persists dependency-cruiser's raw JSON as `artifacts/cycles.json`, then derives Codeweather's report and dashboard views from that artifact.

### Recommended first config

Most projects will want to exclude test fixtures, mocks, and generated files from stats — you don't care if a mock file is 500 lines long, and generated code shouldn't count toward complexity.

Create `codeweather.config.js` in your project root:

```js
export default {
  stats: {
    // Exclude folders/files that are intentionally large or not "real" code
    exclude: [
      '**/mock/',
      '**/mocks/',
      '**/fixtures/',
      '**/__fixtures__/',
      '**/*.test.*',
      '**/*.spec.*',
      '**/*.stories.*',
      '**/generated/',
    ],
    // Or exclude entire directories from scc
    // excludeDir: ['generated', 'vendor'],
  },

  duplicates: {
    // Ignore paths where duplication is expected
    ignore: ['**/__mocks__/**', '**/fixtures/**'],
  },

  cycles: {
    // Ignore test helpers and mocks from dependency analysis
    // exclude: 'mocks|fixtures|__tests__',
  },
}
```

The defaults already exclude `**/mock/` and `**/*.test.*` from stats — the config above extends that with other common patterns.

## Usage

```bash
codeweather                          # Run all checks
codeweather stats                    # Codebase overview via scc
codeweather stats --sort complexity  # Top files by branching complexity
codeweather stats --sort lines       # Top files by line count
codeweather stats --dry              # DRYness score
codeweather unused                   # Unused code via knip
codeweather duplicates               # Copy-paste detection via jscpd
codeweather cycles                   # Circular dependency check
codeweather graph                    # File-level dependency graph (SVG)
codeweather graph --scope <dir>      # Scoped graph
codeweather graph --layers           # Folder-level architecture graph
codeweather graph --focus <file>     # Single file + direct deps
codeweather history                  # Snapshot history table
codeweather history --last 10        # Show only the latest 10 snapshots
codeweather backfill --count 10 --every 20
codeweather dashboard                # Generate HTML dashboard from snapshots
codeweather dashboard --last 25      # Build dashboard from the latest 25 snapshots
codeweather dashboard --output reports/quality.html
codeweather dashboard --no-open      # Generate dashboard without opening it
```

### Global flags

| Flag | Description | Default |
|---|---|---|
| `--src <dir>` | Source directory | Auto-detect `src` or `.` |
| `--config <path>` | Config file path | Auto-detect |
| `--json` | JSON output (for CI) | `false` |
| `--top <n>` | Number of files in ranked lists | `25` |
| `--no-history` | Skip saving a snapshot for this run | `false` |
| `-h, --help` | Show help | |
| `-v, --version` | Show version | |

### System dependencies

| Dependency | Required for | Install |
|---|---|---|
| [scc](https://github.com/boyter/scc) | `stats` command | `brew install scc` / `go install github.com/boyter/scc/v3@latest` |
| [Graphviz](https://graphviz.org/) | `graph` command | `brew install graphviz` / `sudo apt install graphviz` |

Both are optional — if missing, the relevant check is skipped with an install hint.

## Trending workflow

Once you have at least one full run, codeweather becomes a trend tracker:

- `codeweather history` prints a terminal-friendly table with timestamp, commit, status counts, and key trend metrics.
- `codeweather backfill --count <n> --every <n>` replays earlier first-parent commits in a temporary git worktree and saves the generated snapshots into your current directory's history.
- `codeweather dashboard` generates `.codeweather/dashboard.html`, a self-contained dashboard with Chart.js line charts, range controls, a dependency instability panel, a tree explorer, and a snapshot table.
- `codeweather dashboard --output <path>` writes the dashboard to a specific location for CI artifacts or docs publishing.
- The dashboard's instability panel shows a compact summary plus ranked `Highly Unstable Files` and `Stable Highly-Depended-On Files` lists from dependency-cruiser data.
- Selecting a file in the tree explorer shows its `dependencies`, `dependents`, `instability`, and whether it participates in a cycle.
- The terminal summary prints a one-line trend comparison against the previous snapshot when available.
- Use `--no-history` for one-off runs you do not want recorded.
- Add `.codeweather/` to your project's `.gitignore` so routine runs do not dirty your worktree.

Backfill is intentionally PNPM-only and runs `pnpm install` inside the temporary worktree before each historical analysis.

### Snapshot format

Snapshots currently use version `3`.

- Older snapshot history is not loaded.
- If you have pre-v3 snapshots, regenerate your history with fresh full runs.

## Configuration

Optional. Create any of the following:

- `codeweather.config.js` / `codeweather.config.cjs`
- `.codeweatherrc.json` / `.codeweatherrc.yml`
- `"codeweather"` key in `package.json`

Config is loaded via [lilconfig](https://github.com/antonk52/lilconfig).

### Common recipes

**Monorepo / non-standard source directory:**
```js
export default {
  src: 'packages/app/src',  // point to your source root
}
```

**Exclude generated code and fixtures from all relevant checks:**
```js
export default {
  stats: {
    exclude: ['**/mock/', '**/*.test.*', '**/generated/'],
    excludeDir: ['generated', 'vendor', '__snapshots__'],
  },
  duplicates: {
    ignore: ['**/generated/**', '**/fixtures/**'],
  },
  cycles: {
    exclude: 'generated|fixtures',
  },
  graph: {
    exclude: 'generated|fixtures',
  },
}
```

**Only care about unused exports (not unused files/deps):**
```js
export default {
  unused: {
    include: ['exports', 'types'],
  },
}
```

**Stricter duplicate detection:**
```js
export default {
  duplicates: {
    mode: 'strict',       // catch more clones (default: 'mild')
    minLines: 3,          // flag smaller blocks (default: 5)
    threshold: 5,         // fail CI if duplication exceeds 5%
  },
}
```

**Use your existing tool configs (knip, jscpd, dependency-cruiser):**
```js
export default {
  unused: { configFile: 'knip.json' },
  duplicates: { configFile: '.jscpd.json' },
  cycles: { configFile: '.dependency-cruiser.cjs' },
}
```

If you already have these tools configured, just point to their config files — codeweather will use them as-is.

### Full reference

All fields are optional. Shown below are the defaults:

```js
// codeweather.config.js
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
    metrics: false,                       // Include depcruise metrics in the main CLI output
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

  history: {
    enabled: true,                        // Save snapshots after full runs
    dir: '.codeweather',                  // Snapshot + dashboard directory
    maxSnapshots: undefined,              // Keep only the newest N snapshots
  },
}
```

### Project `.gitignore`

Add codeweather's generated artifacts to your project ignore file:

```gitignore
.codeweather/
codeweather-report.md
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
npx codeweather --json > audit.json
```

Exit code is `0` for pass/warn/skip, `1` for any failure.

## Powered by

codeweather is a thin orchestration layer over these excellent tools:

| Tool | Author | What it does | License |
|---|---|---|---|
| [scc](https://github.com/boyter/scc) | Ben Boyter | Fast code counter — lines, complexity, language stats, DRYness | MIT |
| [knip](https://knip.dev) | Lars Kappert | Find unused files, exports, and dependencies | ISC |
| [jscpd](https://github.com/kucherenko/jscpd) | Andrey Kucherenko | Copy-paste / code duplication detection | MIT |
| [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) | Sander Verweij | Dependency analysis, circular dep detection, instability metrics, graph generation | MIT |
| [Graphviz](https://graphviz.org/) | AT&T / open source | Graph visualization (DOT → SVG rendering) | EPL |

Also built with: [citty](https://github.com/unjs/citty) (CLI), [Chart.js](https://www.chartjs.org/) (dashboard charts), [execa](https://github.com/sindresorhus/execa) (process exec), [picocolors](https://github.com/alexeyraspopov/picocolors) (terminal colors), [lilconfig](https://github.com/antonk52/lilconfig) (config loading), [tsup](https://github.com/egoist/tsup) (bundling).

## License

MIT
