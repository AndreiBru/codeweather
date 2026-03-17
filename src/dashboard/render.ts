import { readFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { buildDashboardRows, computeHotspots, computeDirectoryHotspots, dashboardMetrics } from './charts.js'
import { getSnapshotRange } from '../history/summary.js'
import type { SnapshotSummary, SnapshotTreeIndex } from '../history/types.js'

const require = createRequire(import.meta.url)

export function renderDashboardHtml(
  cwd: string,
  snapshots: SnapshotSummary[],
  trees: Record<string, SnapshotTreeIndex> = {},
  latestArtifacts?: { duplicates?: unknown; unused?: unknown },
): string {
  const rows = buildDashboardRows(snapshots)
  const range = getSnapshotRange(snapshots)
  const chartDistDir = dirname(require.resolve('chart.js'))
  const chartJsBundle = readFileSync(resolve(chartDistDir, 'chart.umd.js'), 'utf8')
  const rangeControls = [
    { id: 'all', label: 'All', count: rows.length },
    ...(rows.length > 10 ? [{ id: '10', label: 'Last 10', count: 10 }] : []),
    ...(rows.length > 25 ? [{ id: '25', label: 'Last 25', count: 25 }] : []),
  ]

  const latestRow = rows.at(-1)
  const latestTree = latestRow ? trees[latestRow.id] : undefined
  const fileHotspots = latestTree ? computeHotspots(latestTree, 10) : []
  const dirHotspots = latestTree ? computeDirectoryHotspots(latestTree, 5) : []

  const payload = serializeForScript({
    projectName: basename(cwd),
    generatedAt: new Date().toISOString(),
    range,
    rows,
    trees,
    metrics: dashboardMetrics,
    controls: rangeControls,
    fileHotspots,
    dirHotspots,
    latestArtifacts: latestArtifacts ?? null,
  })

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Codeweather &mdash; ${escapeHtml(basename(cwd))}</title>
  <style>
    :root {
      --bg: #f5f1ea;
      --surface: rgba(255, 252, 247, 0.88);
      --surface-solid: #fffcf7;
      --surface-raised: #ffffff;
      --text: #1a1814;
      --text-secondary: #6b6560;
      --text-tertiary: #9a938b;
      --border: rgba(26, 24, 20, 0.10);
      --border-strong: rgba(26, 24, 20, 0.18);
      --green: #0d6b4e;
      --green-soft: rgba(13, 107, 78, 0.08);
      --green-medium: rgba(13, 107, 78, 0.14);
      --amber: #b8590c;
      --amber-soft: rgba(184, 89, 12, 0.08);
      --red: #a12844;
      --red-soft: rgba(161, 40, 68, 0.08);
      --blue: #1a56b8;
      --blue-soft: rgba(26, 86, 184, 0.08);
      --shadow-sm: 0 1px 3px rgba(26, 24, 20, 0.06);
      --shadow-md: 0 4px 16px rgba(26, 24, 20, 0.06);
      --shadow-lg: 0 12px 40px rgba(26, 24, 20, 0.08);
      --radius-sm: 8px;
      --radius-md: 12px;
      --radius-lg: 16px;
      --radius-xl: 20px;
      --font: "Avenir Next", "Segoe UI", system-ui, sans-serif;
      --font-mono: "SF Mono", "Cascadia Code", "Consolas", monospace;
    }

    * { box-sizing: border-box; margin: 0; }

    body {
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font-family: var(--font);
      font-size: 14px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    .shell {
      max-width: 1120px;
      margin: 0 auto;
      padding: 20px 24px 64px;
    }

    /* ── Header ── */
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 16px 0;
      border-bottom: 1px solid var(--border);
      margin-bottom: 24px;
      flex-wrap: wrap;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .header h1 {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    .header-badge {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--green);
      background: var(--green-soft);
      padding: 3px 8px;
      border-radius: 4px;
    }

    .header-meta {
      display: flex;
      gap: 16px;
      color: var(--text-secondary);
      font-size: 13px;
    }

    .header-meta span { white-space: nowrap; }

    /* ── Controls ── */
    .controls {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }

    .seg-group {
      display: inline-flex;
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm);
      overflow: hidden;
    }

    .seg-group button {
      padding: 6px 14px;
      font: inherit;
      font-size: 12px;
      font-weight: 500;
      border: 0;
      background: var(--surface-solid);
      color: var(--text-secondary);
      cursor: pointer;
      transition: background 100ms, color 100ms;
    }

    .seg-group button:not(:last-child) {
      border-right: 1px solid var(--border);
    }

    .seg-group button:hover { background: var(--green-soft); color: var(--text); }
    .seg-group button.active { background: var(--text); color: #fff; }

    .controls-right {
      display: flex;
      gap: 8px;
    }

    .btn-ghost {
      padding: 6px 12px;
      font: inherit;
      font-size: 12px;
      font-weight: 500;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text-secondary);
      cursor: pointer;
    }

    .btn-ghost:hover { background: var(--surface); color: var(--text); }

    /* ── Cards & Panels ── */
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-sm);
      backdrop-filter: blur(12px);
    }

    .section-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-tertiary);
      margin-bottom: 12px;
    }

    .section-gap { margin-bottom: 16px; }

    /* ── Health Score ── */
    .health-row {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 24px;
      padding: 24px;
      align-items: center;
    }

    .health-ring {
      position: relative;
      width: 140px;
      height: 140px;
      flex: none;
    }

    .health-ring svg {
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);
    }

    .health-ring-track {
      fill: none;
      stroke: var(--border);
      stroke-width: 10;
    }

    .health-ring-value {
      fill: none;
      stroke-width: 10;
      stroke-linecap: round;
      transition: stroke-dasharray 600ms ease;
    }

    .health-ring-label {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .health-number {
      font-size: 36px;
      font-weight: 800;
      letter-spacing: -0.04em;
      line-height: 1;
    }

    .health-trend {
      font-size: 13px;
      font-weight: 600;
      margin-top: 2px;
    }

    .health-trend.up { color: var(--green); }
    .health-trend.down { color: var(--red); }
    .health-trend.flat { color: var(--text-tertiary); }

    .health-caption {
      font-size: 11px;
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-top: 4px;
    }

    .health-detail {
      display: grid;
      gap: 12px;
    }

    .sub-score {
      display: grid;
      grid-template-columns: 100px 1fr auto;
      gap: 12px;
      align-items: center;
    }

    .sub-score-label {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-secondary);
    }

    .sub-score-bar-track {
      height: 6px;
      border-radius: 3px;
      background: var(--border);
      overflow: hidden;
    }

    .sub-score-bar-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 500ms ease;
    }

    .sub-score-value {
      font-size: 13px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      min-width: 28px;
      text-align: right;
    }

    .health-empty {
      padding: 24px;
      color: var(--text-tertiary);
      text-align: center;
    }

    /* ── Hotspots ── */
    .hotspots-panel { padding: 20px; }

    .hotspots-tabs {
      display: flex;
      gap: 0;
      border-bottom: 1px solid var(--border);
      margin-bottom: 16px;
    }

    .hotspots-tab {
      padding: 8px 16px;
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      border: 0;
      border-bottom: 2px solid transparent;
      background: none;
      color: var(--text-tertiary);
      cursor: pointer;
      transition: color 100ms, border-color 100ms;
    }

    .hotspots-tab:hover { color: var(--text); }

    .hotspots-tab.active {
      color: var(--text);
      border-bottom-color: var(--green);
    }

    .hotspot-list { display: grid; gap: 4px; }

    .hotspot-row {
      display: grid;
      grid-template-columns: 36px 1fr auto;
      gap: 12px;
      align-items: center;
      padding: 10px 12px;
      border-radius: var(--radius-sm);
      transition: background 100ms;
    }

    .hotspot-row:hover { background: var(--green-soft); }

    .hotspot-score-badge {
      width: 36px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      border-radius: 6px;
    }

    .hotspot-score-badge.high {
      background: var(--red-soft);
      color: var(--red);
    }

    .hotspot-score-badge.medium {
      background: var(--amber-soft);
      color: var(--amber);
    }

    .hotspot-score-badge.low {
      background: var(--green-soft);
      color: var(--green);
    }

    .hotspot-info {
      min-width: 0;
    }

    .hotspot-path {
      font-size: 13px;
      font-weight: 600;
      font-family: var(--font-mono);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .hotspot-meta {
      font-size: 12px;
      color: var(--text-tertiary);
      margin-top: 2px;
    }

    .hotspot-signals {
      display: flex;
      gap: 4px;
    }

    .signal-dot {
      width: 8px;
      height: 20px;
      border-radius: 2px;
      opacity: 0.2;
      transition: opacity 100ms;
    }

    .signal-dot.active { opacity: 1; }

    .signal-dot.complexity { background: var(--amber); }
    .signal-dot.size { background: var(--text-secondary); }
    .signal-dot.issues { background: var(--red); }
    .signal-dot.instability { background: var(--blue); }

    .hotspot-empty {
      padding: 24px;
      text-align: center;
      color: var(--text-tertiary);
      font-size: 13px;
    }

    /* ── Trends ── */
    .trends-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 12px;
    }

    .trend-card {
      padding: 16px;
    }

    .trend-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 8px;
    }

    .trend-title {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-secondary);
    }

    .trend-value {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
    }

    .trend-delta {
      font-size: 12px;
      font-weight: 600;
      margin-left: 6px;
    }

    .trend-delta.positive { color: var(--red); }
    .trend-delta.negative { color: var(--green); }
    .trend-delta.neutral { color: var(--text-tertiary); }
    .trend-delta.positive-good { color: var(--green); }
    .trend-delta.negative-bad { color: var(--red); }

    .trend-chart {
      height: 80px;
      margin-top: 4px;
    }

    .trend-chart canvas {
      width: 100% !important;
      height: 80px !important;
    }

    /* ── Tree ── */
    .tree-panel { padding: 20px; }

    .tree-panel-header {
      display: flex;
      justify-content: space-between;
      align-items: start;
      gap: 14px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }

    .tree-meta-line {
      color: var(--text-tertiary);
      font-size: 12px;
    }

    .tree-layout {
      display: grid;
      grid-template-columns: minmax(280px, 0.95fr) minmax(380px, 1.35fr);
      gap: 14px;
      align-items: start;
    }

    .tree-shell,
    .tree-detail {
      background: var(--surface-solid);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
    }

    .tree-shell {
      min-width: 0;
      min-height: 360px;
      max-height: 56vh;
      overflow: auto;
      padding: 8px;
    }

    .tree-root { display: grid; gap: 1px; }
    .tree-node-children { display: grid; gap: 1px; }

    .tree-line {
      display: grid;
      grid-template-columns: 16px minmax(0, 1fr);
      gap: 6px;
      align-items: center;
      padding-left: calc(8px + var(--depth, 0) * 14px);
    }

    .tree-row {
      width: 100%;
      display: flex;
      justify-content: space-between;
      gap: 8px;
      align-items: center;
      padding: 5px 8px;
      border: 0;
      border-radius: var(--radius-sm);
      background: transparent;
      color: inherit;
      text-align: left;
      cursor: pointer;
      font: inherit;
      font-size: 13px;
      transition: background 80ms;
    }

    .tree-row:hover { background: var(--green-soft); }
    .tree-row.selected { background: var(--green-medium); }

    .tree-toggle,
    .tree-spacer {
      width: 16px;
      height: 16px;
      display: inline-grid;
      place-items: center;
      font-size: 10px;
      color: var(--text-tertiary);
      flex: none;
    }

    .tree-toggle {
      border: 0;
      background: none;
      cursor: pointer;
      border-radius: 3px;
    }

    .tree-toggle:hover { background: var(--border); }

    .tree-label {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .tree-icon {
      color: var(--text-tertiary);
      font-size: 13px;
      width: 16px;
      text-align: center;
      flex: none;
    }

    .tree-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 500;
    }

    .tree-badges {
      display: flex;
      gap: 4px;
      flex: none;
    }

    .tree-badge {
      font-size: 11px;
      font-variant-numeric: tabular-nums;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(26, 24, 20, 0.05);
      color: var(--text-tertiary);
      white-space: nowrap;
    }

    .tree-badge.issues {
      background: var(--amber-soft);
      color: var(--amber);
      font-weight: 600;
    }

    .tree-detail {
      min-width: 0;
      padding: 16px;
      display: grid;
      gap: 16px;
      min-height: 200px;
      max-height: 56vh;
      overflow: auto;
    }

    .tree-detail h3 {
      font-size: 14px;
      font-weight: 700;
    }

    .tree-detail-section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-tertiary);
      margin-bottom: 8px;
    }

    .tree-detail-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .tree-detail-stat {
      padding: 10px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border);
      background: var(--surface);
    }

    .tree-detail-stat-label {
      font-size: 11px;
      color: var(--text-tertiary);
    }

    .tree-detail-stat-value {
      font-size: 16px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      margin-top: 2px;
    }

    .tree-detail-list {
      display: grid;
      gap: 4px;
      font-size: 13px;
      color: var(--text-secondary);
    }

    .tree-detail-list-row {
      display: flex;
      justify-content: space-between;
      align-items: start;
      gap: 10px;
      padding: 4px 0;
      border-bottom: 1px solid var(--border);
    }

    .tree-detail-list-row:last-child { border-bottom: 0; }

    .duplicate-entry {
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--surface);
      overflow: hidden;
    }

    .duplicate-entry + .duplicate-entry { margin-top: 8px; }

    .duplicate-toggle {
      list-style: none;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: start;
      gap: 12px;
      padding: 10px 12px;
    }

    .duplicate-toggle::-webkit-details-marker { display: none; }

    .duplicate-toggle-main {
      min-width: 0;
      display: grid;
      gap: 4px;
    }

    .duplicate-target {
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--text);
      word-break: break-word;
    }

    .duplicate-meta,
    .duplicate-expand-hint,
    .unused-detail-note {
      font-size: 11px;
      color: var(--text-tertiary);
    }

    .duplicate-expand-hint {
      white-space: nowrap;
      margin-top: 1px;
    }

    .duplicate-entry[open] .duplicate-expand-hint { color: var(--amber); }

    .duplicate-fragment {
      margin: 0;
      padding: 12px;
      border-top: 1px solid var(--border);
      background: #f4efe7;
      color: var(--text);
      font: 12px/1.5 var(--font-mono);
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .tree-detail-empty {
      font-size: 12px;
      color: var(--text-tertiary);
    }

    /* ── Table ── */
    .table-panel { padding: 20px; }

    .table-wrap {
      overflow: auto;
      border-radius: var(--radius-md);
      border: 1px solid var(--border);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 720px;
      font-size: 13px;
      font-variant-numeric: tabular-nums;
    }

    th, td {
      padding: 8px 12px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }

    th {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-tertiary);
      background: var(--surface-solid);
      position: sticky;
      top: 0;
    }

    tr:last-child td { border-bottom: 0; }
    tr:hover td { background: var(--green-soft); }

    .commit-badge {
      font-family: var(--font-mono);
      font-size: 12px;
      background: rgba(26, 24, 20, 0.05);
      padding: 2px 6px;
      border-radius: 4px;
    }

    .status-dots {
      display: inline-flex;
      gap: 3px;
      align-items: center;
    }

    .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
    }

    .status-dot.pass { background: var(--green); }
    .status-dot.warn { background: var(--amber); }
    .status-dot.fail { background: var(--red); }
    .status-dot.skip { background: var(--border-strong); }

    .hidden { display: none; }

    @media (max-width: 700px) {
      .shell { padding: 12px 12px 40px; }
      .health-row { grid-template-columns: 1fr; justify-items: center; }
      .tree-layout { grid-template-columns: 1fr; }
      .trends-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <!-- Header -->
    <header class="header">
      <div class="header-left">
        <h1>${escapeHtml(basename(cwd))}</h1>
        <span class="header-badge">Codeweather</span>
      </div>
      <div class="header-meta" id="header-meta"></div>
    </header>

    <!-- Controls -->
    <div class="controls">
      <div class="seg-group" id="range-controls"></div>
      <div class="controls-right">
        <button class="btn-ghost" id="toggle-tree" type="button">Hide Tree</button>
        <button class="btn-ghost" id="toggle-table" type="button">Hide Table</button>
      </div>
    </div>

    <!-- Health Score -->
    <section class="card section-gap" id="health-section">
      <div id="health-content"></div>
    </section>

    <!-- Hotspots -->
    <section class="card section-gap hotspots-panel" id="hotspots-section">
      <div class="section-label">Hotspots</div>
      <div class="hotspots-tabs" id="hotspot-tabs">
        <button type="button" class="hotspots-tab active" data-hotspot-tab="files">Files</button>
        <button type="button" class="hotspots-tab" data-hotspot-tab="dirs">Directories</button>
      </div>
      <div id="hotspot-content"></div>
    </section>

    <!-- Trends -->
    <section class="section-gap">
      <div class="section-label">Trends</div>
      <div class="trends-grid" id="trends-grid"></div>
    </section>

    <!-- Tree -->
    <section class="card section-gap tree-panel" id="tree-section">
      <div class="tree-panel-header">
        <div>
          <div class="section-label" style="margin-bottom:4px">Codebase Tree</div>
          <div class="tree-meta-line" id="tree-meta"></div>
        </div>
      </div>
      <div class="tree-layout">
        <div class="tree-shell">
          <div class="tree-root" id="tree-root"></div>
        </div>
        <aside class="tree-detail" id="tree-detail"></aside>
      </div>
    </section>

    <!-- Table -->
    <section class="card table-panel" id="table-panel">
      <div class="section-label" style="margin-bottom:12px">Snapshot History</div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Commit</th>
              <th>Health</th>
              <th>Status</th>
              <th>Lines</th>
              <th>Complexity</th>
              <th>Unused</th>
              <th>Dup %</th>
              <th>Cycles</th>
            </tr>
          </thead>
          <tbody id="history-body"></tbody>
        </table>
      </div>
    </section>
  </main>

  <script>${chartJsBundle}</script>
  <script>
    const dashboard = ${payload};
    const charts = [];
    let activeRange = dashboard.controls[0]?.id ?? 'all';
    let activeHotspotTab = 'files';
    let activeNodeId = null;
    let activeTreeSnapshotId = null;
    const expandedNodes = new Set();

    const fmt = (v) => v == null ? '\\u2014' : Number(v).toLocaleString('en-US');
    const fmtPct = (v) => v == null ? '\\u2014' : Number(v).toFixed(1) + '%';
    const fmtMetric = (m, v) => m.kind === 'percent' ? fmtPct(v) : fmt(v);
    const esc = (v) => String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const compact = (v) => {
      if (v == null) return '\\u2014';
      const n = Number(v);
      if (Math.abs(n) >= 1e6) return (n/1e6).toFixed(1)+'M';
      if (Math.abs(n) >= 1e3) return (n/1e3).toFixed(1)+'k';
      return n.toLocaleString('en-US');
    };
    const unusedTypeLabels = {
      dependencies: 'Unused dependency',
      devDependencies: 'Unused devDependency',
      optionalPeerDependencies: 'Unused optional peer dependency',
      unlisted: 'Unlisted dependency',
      binaries: 'Unused binary',
      unresolved: 'Unresolved import',
      exports: 'Unused export',
      nsExports: 'Unused namespace export',
      classMembers: 'Unused class member',
      types: 'Unused type',
      nsTypes: 'Unused namespace type',
      enumMembers: 'Unused enum member',
      duplicates: 'Duplicate entry',
      catalog: 'Unused catalog entry',
    };

    function formatLineRange(file) {
      if (!file) return 'lines ?';
      var start = file.startLoc?.line ?? file.start ?? '?';
      var end = file.endLoc?.line ?? file.end ?? start;
      return start === end ? 'line ' + start : 'lines ' + start + '\\u2013' + end;
    }

    function flattenArtifactEntries(value) {
      var items = [];

      function visit(entry) {
        if (Array.isArray(entry)) {
          entry.forEach(visit);
          return;
        }
        if (entry && typeof entry === 'object') {
          if (
            'name' in entry ||
            'symbol' in entry ||
            'path' in entry ||
            'file' in entry ||
            'line' in entry ||
            'col' in entry
          ) {
            items.push(entry);
            return;
          }
          Object.values(entry).forEach(visit);
          return;
        }
        if (typeof entry === 'string') {
          items.push({ name: entry });
        }
      }

      visit(value);
      return items;
    }

    function collectUnusedItems(artifact, nodePath) {
      var items = [];
      var seen = new Set();

      flattenArtifactEntries(artifact?.files).forEach(function(fileEntry) {
        var filePath = fileEntry.path || fileEntry.file || fileEntry.name;
        if (filePath !== nodePath) return;
        if (seen.has('Entire file unused')) return;
        seen.add('Entire file unused');
        items.push({ label: 'Entire file unused' });
      });

      if (!Array.isArray(artifact?.issues)) return items;

      artifact.issues.forEach(function(issue) {
        if (issue.file !== nodePath) return;

        Object.keys(unusedTypeLabels).forEach(function(groupKey) {
          flattenArtifactEntries(issue[groupKey]).forEach(function(entry) {
            var subject = entry.symbol || entry.name || entry.path || entry.file || '?';
            var line = entry.line != null ? ' (line ' + entry.line + ')' : '';
            var label = unusedTypeLabels[groupKey] + ': ' + subject + line;
            if (seen.has(label)) return;
            seen.add(label);
            items.push({ label: label });
          });
        });
      });

      return items;
    }

    function getRows(rangeId) {
      if (rangeId === 'all') return dashboard.rows;
      return dashboard.rows.slice(-Number(rangeId));
    }

    function destroyCharts() {
      while (charts.length) charts.pop().destroy();
    }

    function scoreColor(score) {
      if (score >= 80) return 'var(--green)';
      if (score >= 50) return 'var(--amber)';
      return 'var(--red)';
    }

    function scoreTier(score) {
      if (score >= 80) return 'low';
      if (score >= 50) return 'medium';
      return 'high';
    }

    function metricDelta(rows, key) {
      if (rows.length < 2) return null;
      const c = rows.at(-1)?.metrics?.[key];
      const p = rows.at(-2)?.metrics?.[key];
      if (c == null || p == null) return null;
      return Number((c - p).toFixed(key === 'duplication' ? 1 : 0));
    }

    function deltaClass(key, delta) {
      if (delta == null || delta === 0) return 'neutral';
      if (key === 'lines') return delta > 0 ? 'neutral' : 'neutral';
      return delta > 0 ? 'positive' : 'negative';
    }

    function deltaText(key, delta) {
      if (delta == null) return '';
      if (delta === 0) return '=';
      const sign = delta > 0 ? '+' : '';
      if (key === 'duplication') return sign + delta.toFixed(1) + '%';
      return sign + delta.toLocaleString('en-US');
    }

    /* ── Header ── */
    function renderHeader(rows) {
      const el = document.getElementById('header-meta');
      const latest = rows.at(-1);
      const parts = [];
      if (latest) {
        parts.push('<span>' + esc(latest.label.replace(' UTC','')) + '</span>');
        parts.push('<span>' + esc(latest.commit + (latest.dirty ? '*' : '')) + (latest.branch ? ' on ' + esc(latest.branch) : '') + '</span>');
      }
      parts.push('<span>' + rows.length + ' snapshot' + (rows.length !== 1 ? 's' : '') + '</span>');
      el.innerHTML = parts.join('');
    }

    /* ── Health Score ── */
    function renderHealthScore(rows) {
      const el = document.getElementById('health-content');
      const latest = rows.at(-1);
      const hs = latest?.healthScore;

      if (!hs) {
        el.innerHTML = '<div class="health-empty">No health data available for the selected range.</div>';
        return;
      }

      const circumference = 2 * Math.PI * 56;
      const offset = circumference * (1 - hs.overall / 100);
      const color = scoreColor(hs.overall);
      const trendClass = hs.trend > 0 ? 'up' : hs.trend < 0 ? 'down' : 'flat';
      const trendText = hs.trend > 0 ? '+' + hs.trend : hs.trend < 0 ? String(hs.trend) : '\\u2014';

      el.innerHTML = '<div class="health-row">' +
        '<div class="health-ring">' +
          '<svg viewBox="0 0 128 128">' +
            '<circle cx="64" cy="64" r="56" class="health-ring-track"/>' +
            '<circle cx="64" cy="64" r="56" class="health-ring-value" ' +
              'stroke="' + color + '" ' +
              'stroke-dasharray="' + (circumference - offset).toFixed(1) + ' ' + circumference.toFixed(1) + '"/>' +
          '</svg>' +
          '<div class="health-ring-label">' +
            '<span class="health-number" style="color:' + color + '">' + hs.overall + '</span>' +
            '<span class="health-trend ' + trendClass + '">' + trendText + '</span>' +
            '<span class="health-caption">Health</span>' +
          '</div>' +
        '</div>' +
        '<div class="health-detail">' +
          hs.subScores.map(function(s) {
            return '<div class="sub-score">' +
              '<span class="sub-score-label">' + esc(s.label) + '</span>' +
              '<div class="sub-score-bar-track">' +
                '<div class="sub-score-bar-fill" style="width:' + s.score + '%;background:' + s.color + '"></div>' +
              '</div>' +
              '<span class="sub-score-value">' + s.score + '</span>' +
            '</div>';
          }).join('') +
        '</div>' +
      '</div>';
    }

    /* ── Hotspots ── */
    function renderSignalDots(signals) {
      const dims = [
        { key: 'complexity', threshold: 0.3 },
        { key: 'size', threshold: 0.3 },
        { key: 'issues', threshold: 0.1 },
      ];
      return '<span class="hotspot-signals" title="complexity / size / issues">' +
        dims.map(function(d) {
          return '<span class="signal-dot ' + d.key + (signals[d.key] >= d.threshold ? ' active' : '') + '"></span>';
        }).join('') +
      '</span>';
    }

    function renderHotspotList(items) {
      if (!items?.length) return '<div class="hotspot-empty">No hotspots detected.</div>';
      return '<div class="hotspot-list">' + items.map(function(h) {
        const tier = scoreTier(100 - h.score);
        const meta = [];
        if (h.stats.lines) meta.push(compact(h.stats.lines) + ' lines');
        if (h.stats.complexity) meta.push(compact(h.stats.complexity) + ' complexity');
        if (h.issues.total) meta.push(h.issues.total + ' issue' + (h.issues.total !== 1 ? 's' : ''));
        return '<div class="hotspot-row">' +
          '<span class="hotspot-score-badge ' + tier + '">' + h.score + '</span>' +
          '<div class="hotspot-info">' +
            '<div class="hotspot-path">' + esc(h.path) + '</div>' +
            '<div class="hotspot-meta">' + esc(meta.join(' \\u00b7 ')) + '</div>' +
          '</div>' +
          renderSignalDots(h.signals) +
        '</div>';
      }).join('') + '</div>';
    }

    function renderHotspots() {
      const el = document.getElementById('hotspot-content');
      el.innerHTML = activeHotspotTab === 'files'
        ? renderHotspotList(dashboard.fileHotspots)
        : renderHotspotList(dashboard.dirHotspots);
    }

    /* ── Trends ── */
    function renderTrends(rows) {
      destroyCharts();
      const grid = document.getElementById('trends-grid');

      grid.innerHTML = dashboard.metrics.map(function(m) {
        const latest = rows.at(-1);
        const val = latest?.metrics?.[m.key];
        const delta = metricDelta(rows, m.key);
        const dClass = deltaClass(m.key, delta);
        const dText = deltaText(m.key, delta);

        return '<article class="card trend-card">' +
          '<div class="trend-header">' +
            '<span class="trend-title">' + m.title + '</span>' +
          '</div>' +
          '<div>' +
            '<span class="trend-value" style="color:' + m.color + '">' + fmtMetric(m, val) + '</span>' +
            (dText ? '<span class="trend-delta ' + dClass + '">' + dText + '</span>' : '') +
          '</div>' +
          '<div class="trend-chart"><canvas id="chart-' + m.key + '"></canvas></div>' +
        '</article>';
      }).join('');

      dashboard.metrics.forEach(function(m) {
        const canvas = document.getElementById('chart-' + m.key);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const values = rows.map(function(r) { return r.metrics?.[m.key] ?? null; });
        const chart = new Chart(ctx, {
          type: 'line',
          data: {
            labels: rows.map(function(r) { return r.label; }),
            datasets: [{
              data: values,
              borderColor: m.color,
              backgroundColor: m.color + '18',
              borderWidth: 2,
              pointRadius: rows.length > 30 ? 0 : 3,
              pointHoverRadius: 4,
              pointBackgroundColor: m.color,
              spanGaps: true,
              tension: 0.3,
              fill: true,
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
              legend: { display: false },
              tooltip: {
                titleFont: { size: 11 },
                bodyFont: { size: 11 },
                padding: 8,
                callbacks: {
                  label: function(ctx) { return fmtMetric(m, ctx.raw); },
                  afterBody: function(items) {
                    var row = rows[items[0]?.dataIndex ?? 0];
                    return row ? [row.commit + (row.dirty ? '*' : '')] : [];
                  },
                },
              },
            },
            scales: {
              x: { display: false },
              y: {
                display: true,
                grid: { color: 'rgba(26,24,20,0.04)', drawBorder: false },
                ticks: {
                  font: { size: 10 },
                  color: '#9a938b',
                  maxTicksLimit: 4,
                  callback: function(v) { return fmtMetric(m, v); },
                },
              },
            },
          },
        });
        charts.push(chart);
      });
    }

    /* ── Tree ── */
    function getTreeSnapshot(rows) {
      var latest = rows.at(-1);
      if (!latest) return undefined;
      var tree = dashboard.trees?.[latest.id];
      if (!tree) return undefined;
      return { row: latest, tree: tree };
    }

    function ensureExpanded(tree) {
      if (!tree) return;
      var root = tree.nodes[tree.rootId];
      if (!root) return;
      expandedNodes.add(tree.rootId);
      root.childIds.slice(0, 6).forEach(function(cid) {
        var child = tree.nodes[cid];
        if (child?.kind === 'dir') expandedNodes.add(cid);
      });
    }

    function renderTreeNode(tree, nodeId, depth) {
      var node = tree.nodes[nodeId];
      if (!node) return '';
      var isDir = node.kind === 'dir';
      var isExp = expandedNodes.has(nodeId);
      var isSel = activeNodeId === nodeId;
      var issueText = node.issues.total > 0 ? node.issues.total + '' : '';
      var statText = isDir ? compact(node.stats.files) + ' files' : compact(node.stats.lines) + ' ln';
      var children = isDir && isExp
        ? '<div class="tree-node-children">' + node.childIds.map(function(c) { return renderTreeNode(tree, c, depth+1); }).join('') + '</div>'
        : '';

      return '<div class="tree-node" data-node="' + esc(nodeId) + '">' +
        '<div class="tree-line" style="--depth:' + depth + '">' +
          (isDir
            ? '<button type="button" class="tree-toggle" data-toggle="' + esc(nodeId) + '">' + (isExp ? '\\u25BE' : '\\u25B8') + '</button>'
            : '<span class="tree-spacer"></span>') +
          '<button type="button" class="tree-row' + (isSel ? ' selected' : '') + '" data-select-node="' + esc(nodeId) + '">' +
            '<span class="tree-label">' +
              '<span class="tree-icon">' + (isDir ? '\\uD83D\\uDCC1' : '\\uD83D\\uDCC4') + '</span>' +
              '<span class="tree-name">' + esc(node.name || node.path) + '</span>' +
            '</span>' +
            '<span class="tree-badges">' +
              (issueText ? '<span class="tree-badge issues">' + issueText + '</span>' : '') +
              '<span class="tree-badge">' + statText + '</span>' +
            '</span>' +
          '</button>' +
        '</div>' +
        children +
      '</div>';
    }

    function renderTreeDetail(treeSnapshot) {
      var detail = document.getElementById('tree-detail');
      if (!treeSnapshot) {
        detail.innerHTML = '<div style="padding:16px;color:var(--text-tertiary)">No tree data available.</div>';
        return;
      }
      var tree = treeSnapshot.tree;
      var node = tree.nodes[activeNodeId] ?? tree.nodes[tree.rootId];
      if (!node) { detail.innerHTML = ''; return; }

      var depSection = '';
      if (node.kind === 'file' && node.dependency) {
        var d = node.dependency;
        depSection = '<div>' +
          '<div class="tree-detail-section-title">Dependencies</div>' +
          '<div class="tree-detail-list">' +
            '<div class="tree-detail-list-row"><span>Outgoing</span><strong>' + fmt(d.dependencies) + '</strong></div>' +
            '<div class="tree-detail-list-row"><span>Incoming</span><strong>' + fmt(d.dependents) + '</strong></div>' +
            '<div class="tree-detail-list-row"><span>Instability</span><strong>' + (d.instability * 100).toFixed(0) + '%</strong></div>' +
            '<div class="tree-detail-list-row"><span>In cycle</span><strong>' + (d.inCycle ? 'Yes' : 'No') + '</strong></div>' +
          '</div></div>';
      }

      var dupSection = '';
      if (node.kind === 'file' && node.issues.duplication > 0 && dashboard.latestArtifacts?.duplicates?.duplicates) {
        var clones = dashboard.latestArtifacts.duplicates.duplicates.filter(function(d) {
          return d.firstFile?.name === node.path || d.secondFile?.name === node.path;
        });
        if (clones.length > 0) {
          dupSection = '<div>' +
            '<div class="tree-detail-section-title">Duplicates</div>' +
            '<div>' +
            clones.map(function(c) {
              var selfFile = c.firstFile?.name === node.path ? c.firstFile : c.secondFile;
              var other = c.firstFile?.name === node.path ? c.secondFile : c.firstFile;
              var otherName = other?.name || '?';
              var lines = c.lines || '?';
              var selfLabel = 'This file ' + formatLineRange(selfFile);
              var otherLabel = (otherName === node.path ? 'Matching copy ' : esc(otherName) + ' ') + formatLineRange(other);
              var fragment = c.fragment
                ? '<pre class="duplicate-fragment">' + esc(c.fragment) + '</pre>'
                : '<div class="duplicate-fragment tree-detail-empty">No fragment captured for this clone.</div>';
              return '<details class="duplicate-entry">' +
                '<summary class="duplicate-toggle">' +
                  '<span class="duplicate-toggle-main">' +
                    '<span class="duplicate-target">' + esc(otherName) + '</span>' +
                    '<span class="duplicate-meta">' + selfLabel + ' \\u00b7 ' + otherLabel + ' \\u00b7 ' + lines + ' lines</span>' +
                  '</span>' +
                  '<span class="duplicate-expand-hint">Show fragment</span>' +
                '</summary>' +
                fragment +
              '</details>';
            }).join('') +
            '</div></div>';
        }
      }

      var unusedSection = '';
      if (node.kind === 'file' && node.issues.unused > 0 && dashboard.latestArtifacts?.unused) {
        var items = collectUnusedItems(dashboard.latestArtifacts.unused, node.path);

        if (items.length > 0) {
          unusedSection = '<div>' +
            '<div class="tree-detail-section-title">Unused Code</div>' +
            '<div class="tree-detail-list">' +
            items.map(function(item) {
              return '<div class="tree-detail-list-row"><span style="font-size:12px">' + esc(item.label) + '</span></div>';
            }).join('') +
            '</div></div>';
        } else {
          unusedSection = '<div>' +
            '<div class="tree-detail-section-title">Unused Code</div>' +
            '<div class="tree-detail-empty">No detailed unused-code entries were found in the latest snapshot artifact.</div>' +
          '</div>';
        }
      }

      detail.innerHTML =
        '<div>' +
          '<h3>' + esc(node.name || node.path) + '</h3>' +
          '<div style="font-size:12px;color:var(--text-tertiary);margin-top:2px">' + esc(node.path) + '</div>' +
        '</div>' +
        '<div>' +
          '<div class="tree-detail-section-title">Stats</div>' +
          '<div class="tree-detail-grid">' +
            '<div class="tree-detail-stat"><div class="tree-detail-stat-label">Files</div><div class="tree-detail-stat-value">' + fmt(node.stats.files) + '</div></div>' +
            '<div class="tree-detail-stat"><div class="tree-detail-stat-label">Lines</div><div class="tree-detail-stat-value">' + fmt(node.stats.lines) + '</div></div>' +
            '<div class="tree-detail-stat"><div class="tree-detail-stat-label">Code</div><div class="tree-detail-stat-value">' + fmt(node.stats.code) + '</div></div>' +
            '<div class="tree-detail-stat"><div class="tree-detail-stat-label">Complexity</div><div class="tree-detail-stat-value">' + fmt(node.stats.complexity) + '</div></div>' +
          '</div>' +
        '</div>' +
        '<div>' +
          '<div class="tree-detail-section-title">Issues</div>' +
          '<div class="tree-detail-list">' +
            '<div class="tree-detail-list-row"><span>Unused</span><strong>' + fmt(node.issues.unused) + '</strong></div>' +
            '<div class="tree-detail-list-row"><span>Duplication</span><strong>' + fmt(node.issues.duplication) + '</strong></div>' +
            '<div class="tree-detail-list-row"><span>Cycles</span><strong>' + fmt(node.issues.cycles) + '</strong></div>' +
          '</div>' +
        '</div>' +
        depSection +
        dupSection +
        unusedSection;
    }

    function renderTree(rows) {
      var treeRoot = document.getElementById('tree-root');
      var treeSnapshot = getTreeSnapshot(rows);
      var metaEl = document.getElementById('tree-meta');

      if (!treeSnapshot) {
        activeTreeSnapshotId = null;
        activeNodeId = null;
        treeRoot.innerHTML = '<div style="padding:16px;color:var(--text-tertiary)">No tree data for this range.</div>';
        metaEl.textContent = '';
        renderTreeDetail(undefined);
        return;
      }

      var tree = treeSnapshot.tree;
      metaEl.textContent = esc(treeSnapshot.row.label) + ' \\u00b7 ' + treeSnapshot.row.tree.nodeCount + ' nodes';

      if (activeTreeSnapshotId !== treeSnapshot.row.id) {
        activeTreeSnapshotId = treeSnapshot.row.id;
        activeNodeId = tree.rootId;
      }
      ensureExpanded(tree);
      treeRoot.innerHTML = renderTreeNode(tree, tree.rootId, 0);
      renderTreeDetail(treeSnapshot);
    }

    /* ── Table ── */
    function renderTable(rows) {
      var body = document.getElementById('history-body');
      body.innerHTML = rows.slice().reverse().map(function(row) {
        var dots = '';
        for (var i = 0; i < row.status.pass; i++) dots += '<span class="status-dot pass"></span>';
        for (var j = 0; j < row.status.warn; j++) dots += '<span class="status-dot warn"></span>';
        for (var k = 0; k < row.status.fail; k++) dots += '<span class="status-dot fail"></span>';
        for (var l = 0; l < row.status.skip; l++) dots += '<span class="status-dot skip"></span>';

        return '<tr>' +
          '<td>' + esc(row.label.replace(' UTC','')) + '</td>' +
          '<td><span class="commit-badge">' + esc(row.commit + (row.dirty ? '*':'')) + '</span></td>' +
          '<td>' + (row.healthScore ? row.healthScore.overall : '\\u2014') + '</td>' +
          '<td><span class="status-dots">' + dots + '</span></td>' +
          '<td>' + fmt(row.metrics?.lines) + '</td>' +
          '<td>' + fmt(row.metrics?.complexity) + '</td>' +
          '<td>' + fmt(row.metrics?.unused) + '</td>' +
          '<td>' + fmtPct(row.metrics?.duplication) + '</td>' +
          '<td>' + fmt(row.metrics?.cycles) + '</td>' +
        '</tr>';
      }).join('');
    }

    /* ── Render All ── */
    function render(rangeId) {
      activeRange = rangeId;
      var rows = getRows(rangeId);
      document.querySelectorAll('#range-controls button').forEach(function(b) {
        b.classList.toggle('active', b.dataset.range === rangeId);
      });
      renderHeader(rows);
      renderHealthScore(rows);
      renderHotspots();
      renderTrends(rows);
      renderTree(rows);
      renderTable(rows);
    }

    /* ── Init ── */
    var rangeEl = document.getElementById('range-controls');
    rangeEl.innerHTML = dashboard.controls.map(function(c) {
      return '<button type="button" data-range="' + c.id + '"' + (c.id === activeRange ? ' class="active"' : '') + '>' + c.label + '</button>';
    }).join('');

    rangeEl.addEventListener('click', function(e) {
      var btn = e.target.closest('button[data-range]');
      if (btn) render(btn.dataset.range);
    });

    document.getElementById('toggle-table').addEventListener('click', function() {
      var panel = document.getElementById('table-panel');
      var hidden = panel.classList.toggle('hidden');
      this.textContent = hidden ? 'Show Table' : 'Hide Table';
    });

    document.getElementById('toggle-tree').addEventListener('click', function() {
      var panel = document.getElementById('tree-section');
      var hidden = panel.classList.toggle('hidden');
      this.textContent = hidden ? 'Show Tree' : 'Hide Tree';
    });

    document.getElementById('hotspot-tabs').addEventListener('click', function(e) {
      var tab = e.target.closest('[data-hotspot-tab]');
      if (!tab) return;
      activeHotspotTab = tab.dataset.hotspotTab;
      this.querySelectorAll('.hotspots-tab').forEach(function(t) {
        t.classList.toggle('active', t.dataset.hotspotTab === activeHotspotTab);
      });
      renderHotspots();
    });

    document.getElementById('tree-root').addEventListener('click', function(e) {
      var toggle = e.target.closest('[data-toggle]');
      if (toggle) {
        var nid = toggle.dataset.toggle;
        if (expandedNodes.has(nid)) expandedNodes.delete(nid);
        else expandedNodes.add(nid);
        render(activeRange);
        return;
      }
      var btn = e.target.closest('[data-select-node]');
      if (!btn) return;
      activeNodeId = btn.dataset.selectNode;
      var rows = getRows(activeRange);
      renderTree(rows);
    });

    render(activeRange);
  </script>
</body>
</html>`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function serializeForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
}
