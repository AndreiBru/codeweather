# Plan: Codeweather Trending — Structured Metrics, History & Dashboard

## Context

Codeweather currently produces snapshot reports (terminal + markdown) but discards data after each run. Every `CheckResult.output` is raw terminal text — usable for humans but not for tracking trends. The goal is to make codeweather accumulate structured metrics over time so users can see how complexity, file sizes, unused code, and duplication trend across runs. Eventually surfaced through a visual dashboard.

## Phased Approach

### Phase 1: Structured Metric Extraction

**Goal:** Each check produces a typed `metrics` object alongside its existing text output.

**Types** — extend `src/checks/types.ts`:

```ts
interface CheckResult {
  // ... existing fields
  metrics?: CheckMetrics  // NEW — optional, backwards compatible
}

type CheckMetrics = StatsMetrics | UnusedMetrics | DuplicatesMetrics | CyclesMetrics

interface StatsMetrics {
  kind: 'stats'
  totalFiles: number
  totalLines: number
  totalCode: number
  totalComplexity: number
  totalBlanks: number
  totalComments: number
  languages: Array<{ language: string; files: number; lines: number; code: number; complexity: number }>
  topFiles: Array<{ path: string; lines: number; code: number; complexity: number }>
}

interface UnusedMetrics {
  kind: 'unused'
  unusedFiles: number
  unusedExports: number
  unusedTypes: number
  unusedDependencies: number
  totalIssues: number
}

interface DuplicatesMetrics {
  kind: 'duplicates'
  totalClones: number
  duplicatedLinesPercent: number
  duplicatedTokensPercent: number
  totalLines: number
}

interface CyclesMetrics {
  kind: 'cycles'
  totalModules: number
  totalDependencies: number
  cycleCount: number
}
```

**How each check extracts metrics:**

| Check | Strategy | Notes |
|-------|----------|-------|
| **stats** (`scc`) | Run `scc -f json` as a second call | scc JSON gives per-file + per-language arrays. Fast (<20ms) so double-call is fine |
| **unused** (`knip`) | Run `knip --reporter json` as a second call | JSON output has arrays per issue type — count lengths |
| **duplicates** (`jscpd`) | Add `-r json -o <tmpdir>` to the existing call | jscpd writes `jscpd-report.json` alongside console output — just read it after |
| **cycles** (`depcruise`) | Parse the existing text output | Output already says "X modules, Y dependencies cruised" and lists violations. Simple regex. Avoids a second call |

Each check gets a private `extractMetrics()` function. If it fails, `metrics` stays `undefined` — never breaks the existing flow.

**Files to modify:**
- `src/checks/types.ts` — add metric interfaces
- `src/checks/stats.ts` — add JSON extraction for overview, complexity, and lines modes
- `src/checks/unused.ts` — add JSON reporter call
- `src/checks/duplicates.ts` — add JSON reporter, read temp file
- `src/checks/cycles.ts` — parse text output with regex
- `src/output.ts` — include `metrics` in `toJson()` and `toMarkdown()`

---

### Phase 2: Snapshot Storage

**Goal:** Every full run automatically saves a snapshot to `.codeweather/snapshots/`.

**Snapshot schema** — new file `src/history/types.ts`:

```ts
interface Snapshot {
  version: 1                    // schema version for future-proofing
  timestamp: string             // ISO 8601
  git?: {
    commit: string              // short SHA
    branch: string
    dirty: boolean
    message?: string            // first line of commit message
  }
  duration: number              // total run time ms
  checks: Array<{
    name: string
    status: 'pass' | 'warn' | 'fail' | 'skip'
    summary: string
    duration: number
    metrics?: CheckMetrics
  }>
}
```

**Storage layout:**
```
.codeweather/
  snapshots/
    2026-03-09T14-30-00_abc1234.json
    2026-03-10T09-15-00_def5678.json
```

Filename: `{ISO-timestamp}_{git-short-sha}.json` — sortable by name, no index file needed.

**New files:**
- `src/history/types.ts` — Snapshot interface
- `src/history/store.ts` — `saveSnapshot()`, `loadSnapshots(limit?)`, `getSnapshotDir()`
- `src/history/git.ts` — `getGitMeta()` helper (rev-parse, branch, status --porcelain)

**Changes:**
- `src/runner.ts` — after markdown report, call `saveSnapshot()` automatically
- `src/config.ts` — add `history: { enabled?: boolean, dir?: string }` (defaults: enabled=true, dir='.codeweather')
- `.gitignore` reminder in README

---

### Phase 3: Terminal Delta Display

**Goal:** Each full run prints a one-line comparison vs. the previous snapshot.

Example output after the summary:
```
  Trend: Lines 12,450 (+120) · Complexity 890 (-5) · Unused 3 (=) · Duplication 2.1% (+0.3%)
```

**Changes:**
- `src/output.ts` — add `printDelta(current, previous)` function
- `src/runner.ts` — after saving snapshot, load previous, print delta

This gives immediate value without opening anything.

---

### Phase 4: Dashboard (HTML)

**Goal:** `codeweather dashboard` generates a self-contained HTML file with trend charts and opens it in the browser.

**Approach:** Inline SVG charts generated from TypeScript — no external charting libraries. The charts needed are simple line charts (metric over time). A ~100-line SVG generator handles this. The HTML file is fully self-contained (no CDN, no server).

**Dashboard contents:**
- Header: project name, date range, number of snapshots
- Grid of line charts: total lines, total complexity, unused exports, duplication %, cycle count
- Each chart: X-axis = snapshots (by date), Y-axis = metric value, with delta annotation
- Table of all snapshots with status summaries

**New files:**
- `src/dashboard/render.ts` — HTML template with embedded data + SVG chart generator
- `src/dashboard/charts.ts` — SVG polyline chart function (axes, labels, hover points)

**Changes:**
- `src/cli.ts` — add `dashboard` subcommand with `--last <n>` flag
- Output to `.codeweather/dashboard.html`, auto-open (reusing the `open` pattern from `graph.ts`)

---

### Phase 5: Polish

- `codeweather history` subcommand — table of past snapshots (date, commit, status counts)
- `--no-history` global flag to skip saving
- Snapshot pruning config (`history.maxSnapshots` or `history.maxDays`)
- Include trend line in the markdown report (not just HTML)

---

## Implementation Order

| Step | Phase | Deliverable |
|------|-------|-------------|
| 1 | P1 | Metric interfaces + stats JSON extraction |
| 2 | P1 | Unused, duplicates, cycles metric extraction |
| 3 | P1 | Metrics in `--json` and markdown output |
| 4 | P2 | Git metadata helper |
| 5 | P2 | Snapshot save/load + auto-save in runner |
| 6 | P3 | Terminal delta display |
| 7 | P4 | SVG chart generator |
| 8 | P4 | Dashboard HTML renderer + `dashboard` subcommand |
| 9 | P5 | `history` subcommand, `--no-history`, pruning |

## Key Design Decisions

- **Dual-call for metrics extraction** (text + JSON) in Phase 1 to avoid breaking existing output. Can optimize later by deriving text from structured data.
- **No new dependencies.** HTML dashboard uses template literals + inline SVG. Storage is plain `fs`. Git metadata uses existing `exec()` helper.
- **`.codeweather/` is project-local, not global.** Metrics are meaningless across codebases.
- **Automatic saving, no opt-in.** Friction-free — just keep running `codeweather` and history builds up.

## Verification

1. `codeweather --json` output now includes `metrics` objects with actual numbers
2. `.codeweather/snapshots/` accumulates JSON files after each run
3. Second run prints delta line comparing to first
4. `codeweather dashboard` generates HTML, opens in browser with charts
5. Test on Horizon: run 3+ times, dashboard shows trend lines
