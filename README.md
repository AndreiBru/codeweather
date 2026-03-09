# codeaudit

Zero-config code quality audits for JS/TS projects — stats, unused code, duplication, circular deps, and dependency graphs.

## Install

```bash
npm install -g codeaudit
# or
npx codeaudit
```

**System dependency (optional):** [scc](https://github.com/boyter/scc) for codebase stats.

```bash
brew install scc        # macOS
go install github.com/boyter/scc/v3@latest  # Go
```

**For `graph` command:** [Graphviz](https://graphviz.org/) is required.

```bash
brew install graphviz   # macOS
sudo apt install graphviz  # Ubuntu/Debian
```

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

```
--src <dir>       Source directory (default: auto-detect "src" or ".")
--config <path>   Config file path
--json            JSON output (for CI)
--top <n>         Number of files in ranked lists (default: 25)
-h, --help
-v, --version
```

## Configuration

Optional. Create `codeaudit.config.js`, `.codeauditrc.json`, or add a `"codeaudit"` key in `package.json`.

```js
// codeaudit.config.js
export default {
  src: 'src',
  extensions: ['ts', 'tsx', 'js', 'jsx'],
  stats: {
    top: 25,
    exclude: ['**/mock/', '**/*.test.*'],
  },
  duplicates: {
    formats: ['typescript', 'tsx', 'javascript', 'jsx'],
  },
  cycles: {
    tsConfig: 'tsconfig.json',
  },
  graph: {
    outputDir: 'reports',
    open: true,
  },
}
```

All fields are optional. Sensible defaults are provided for everything.

## What it checks

| Check | Tool | What it does |
|---|---|---|
| **stats** | [scc](https://github.com/boyter/scc) | Lines of code, complexity, language breakdown, DRYness |
| **unused** | [knip](https://knip.dev) | Unused files, exports, dependencies |
| **duplicates** | [jscpd](https://github.com/kucherenko/jscpd) | Copy-paste / code duplication detection |
| **cycles** | [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) | Circular dependency detection |
| **graph** | dependency-cruiser + graphviz | Visual dependency graphs (SVG) |

## CI usage

```bash
npx codeaudit --json > audit.json
```

Exit code is `0` for pass/warn/skip, `1` for any failure.

## License

MIT
