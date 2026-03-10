# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is codeweather

A CLI tool that orchestrates best-in-class JS/TS code quality tools (scc, knip, jscpd, dependency-cruiser) into a single `codeweather` command. It produces terminal output, markdown reports, JSON for CI, snapshot history, and an HTML dashboard with trend charts.

## Commands

```bash
pnpm build          # Build with tsup (ESM, single entry: src/cli.ts → dist/)
pnpm dev            # Build in watch mode
pnpm test           # Run all tests with vitest
pnpm self           # Run the CLI against this repo (node bin/codeweather.js)
```

Run a single test file:
```bash
npx vitest run src/runner.test.ts
```

## Architecture

**Entry point:** `src/cli.ts` — defines CLI commands and flags using [citty](https://github.com/unjs/citty). Subcommands: `stats`, `unused`, `duplicates`, `cycles`, `graph`, `history`, `dashboard`. Running with no subcommand triggers `runAll()`.

**Runner:** `src/runner.ts` — `runAll()` sequentially runs the default checks array, collects `CheckResult[]`, prints output, saves markdown report, manages snapshot history, and prints trend deltas.

**Check interface:** `src/checks/types.ts` — every check implements `Check { name, isAvailable(), run(config) }` and returns `CheckResult` with status (`pass`/`warn`/`fail`/`skip`), summary, output, duration, and optional typed `CheckMetrics`.

**Checks** (each in `src/checks/`):
- `stats.ts` — wraps `scc` binary (4 variants: overview, complexity, lines, dry)
- `unused.ts` — wraps `knip`
- `duplicates.ts` — wraps `jscpd`
- `cycles.ts` — wraps `dependency-cruiser`
- `graph.ts` — wraps `dependency-cruiser` + graphviz for SVG generation

**Config:** `src/config.ts` — loads user config via lilconfig (`codeweather.config.js`, `.codeweatherrc.json`, etc.), merges with CLI flags, auto-detects `src` dir and `tsconfig.json`. Produces `ResolvedConfig` with fully-resolved defaults for every check.

**Output:** `src/output.ts` — terminal formatting (picocolors), markdown report generation, JSON serialization, and trend delta computation.

**History:** `src/history/` — snapshot storage (JSON files in `.codeweather/snapshots/`), git metadata extraction, history table rendering, trend summary.

**Dashboard:** `src/dashboard/` — generates self-contained HTML with inline Chart.js, snapshot tables, and range controls.

**Utils:** `src/utils/` — `detect.ts` (auto-detect src dir, tsconfig), `exec.ts` (execa wrapper), `args.ts` (CLI arg building), `open.ts` (open files in default app).

## Key patterns

- Checks shell out to external tools via execa; the `isAvailable()` method checks if the binary exists before running.
- Each check section in config has an `args: string[]` escape hatch for passing arbitrary flags to the underlying tool.
- TypeScript with strict mode, ESM throughout (`"type": "module"`), bundled with tsup to a single entry.
- Node >=18 required.
