import { readFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { buildDashboardRows, dashboardMetrics } from './charts.js'
import { getSnapshotRange } from '../history/summary.js'
import type { Snapshot } from '../history/types.js'

const require = createRequire(import.meta.url)

export function renderDashboardHtml(
  cwd: string,
  snapshots: Snapshot[],
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

  const payload = serializeForScript({
    projectName: basename(cwd),
    generatedAt: new Date().toISOString(),
    range,
    rows,
    metrics: dashboardMetrics,
    controls: rangeControls,
  })

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Codeweather — ${escapeHtml(basename(cwd))}</title>
  <style>${buildCssBlock()}</style>
</head>
<body>
  ${buildHtmlSkeleton(cwd)}
  <script>${chartJsBundle}</script>
  <script>${buildClientScript(payload)}</script>
</body>
</html>`
}

function buildCssBlock(): string {
  return `
    :root {
      --bg: #f6f4f1;
      --surface: #ffffff;
      --surface-raised: #faf9f7;
      --text: #1a1a1a;
      --text-secondary: #6b6560;
      --text-tertiary: #9e9790;
      --border: #e8e4df;
      --accent: #1a6b4e;
      --warn: #c4650a;
      --danger: #b82d4a;
      --info: #2856cc;
      --chart-green: #1a6b4e;
      --chart-amber: #c4650a;
      --chart-blue: #2856cc;
      --chart-rose: #b82d4a;
      --chart-purple: #7c5bbf;
      --chart-cyan: #0e8a8a;
      --shadow: 0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06);
      --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
      --font-heading: "Newsreader", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
      --font-body: "IBM Plex Sans", "SF Pro Text", -apple-system, "Segoe UI", system-ui, sans-serif;
      --font-mono: "IBM Plex Mono", "SF Mono", "Cascadia Code", "Fira Code", ui-monospace, monospace;
      --radius-lg: 16px;
      --radius-md: 12px;
      --radius-sm: 8px;
      --radius-pill: 999px;
      --grid-color: rgba(0,0,0,0.05);
      --tick-color: #6b6560;
    }

    [data-theme="dark"] {
      --bg: #131211;
      --surface: #1e1d1b;
      --surface-raised: #272523;
      --text: #e8e4df;
      --text-secondary: #9e9790;
      --text-tertiary: #6b6560;
      --border: #2f2d2a;
      --accent: #3dd9a0;
      --warn: #f0943e;
      --danger: #f06080;
      --info: #6b9aff;
      --chart-green: #3dd9a0;
      --chart-amber: #f0943e;
      --chart-blue: #6b9aff;
      --chart-rose: #f06080;
      --chart-purple: #b494f0;
      --chart-cyan: #30d4d4;
      --shadow: 0 1px 3px rgba(0,0,0,0.2), 0 8px 24px rgba(0,0,0,0.3);
      --shadow-sm: 0 1px 2px rgba(0,0,0,0.2);
      --grid-color: rgba(255,255,255,0.06);
      --tick-color: #9e9790;
    }

    * { box-sizing: border-box; margin: 0; }

    body {
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-body);
      font-size: 14px;
      line-height: 1.5;
    }

    /* ── Sticky Header ── */
    .header {
      position: sticky;
      top: 0;
      z-index: 100;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      box-shadow: var(--shadow-sm);
    }
    .header-inner {
      max-width: 1280px;
      margin: 0 auto;
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }
    .header-left {
      display: flex;
      align-items: baseline;
      gap: 12px;
      min-width: 0;
    }
    .header-title {
      font-family: var(--font-heading);
      font-size: 1.35rem;
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .branch-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 10px;
      border-radius: var(--radius-pill);
      background: var(--surface-raised);
      border: 1px solid var(--border);
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--text-secondary);
      white-space: nowrap;
    }
    .header-center {
      display: flex;
      gap: 4px;
    }
    .range-pill {
      border: 1px solid var(--border);
      background: transparent;
      color: var(--text-secondary);
      border-radius: var(--radius-pill);
      padding: 6px 14px;
      font: inherit;
      font-size: 13px;
      cursor: pointer;
      transition: all 120ms ease;
    }
    .range-pill:hover { background: var(--surface-raised); color: var(--text); }
    .range-pill.active {
      background: var(--text);
      color: var(--bg);
      border-color: var(--text);
    }
    .header-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .theme-toggle {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: transparent;
      color: var(--text-secondary);
      cursor: pointer;
      transition: all 120ms ease;
    }
    .theme-toggle:hover { background: var(--surface-raised); color: var(--text); }
    .theme-toggle svg { width: 18px; height: 18px; }

    /* ── Tab Navigation ── */
    .tab-bar {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
    }
    .tab-bar-inner {
      max-width: 1280px;
      margin: 0 auto;
      padding: 0 24px;
      display: flex;
      gap: 0;
    }
    .tab-btn {
      padding: 12px 20px;
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--text-secondary);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 120ms ease;
      white-space: nowrap;
    }
    .tab-btn:hover { color: var(--text); }
    .tab-btn.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
    }

    /* ── Main Content ── */
    .main {
      max-width: 1280px;
      margin: 0 auto;
      padding: 24px;
    }
    .tab-content { display: none; opacity: 0; transition: opacity 150ms ease; }
    .tab-content.active { display: block; opacity: 1; }

    /* ── Panels & Cards ── */
    .panel {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow);
    }
    .card {
      background: var(--surface-raised);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 16px;
    }

    /* ── Overview: Health Score ── */
    .overview-top {
      display: grid;
      grid-template-columns: 240px 1fr;
      gap: 24px;
      margin-bottom: 24px;
    }
    .gauge-panel {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .gauge-panel canvas { margin-bottom: 8px; }
    .gauge-label {
      font-family: var(--font-heading);
      font-size: 0.95rem;
      color: var(--text-secondary);
      text-align: center;
    }

    /* ── Overview: Metric Grid ── */
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }
    .metric-card {
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .metric-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .metric-card-title {
      font-size: 12px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-secondary);
    }
    .metric-card-value {
      font-family: var(--font-heading);
      font-size: 1.6rem;
      font-weight: 700;
      line-height: 1.2;
    }
    .metric-card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .delta-badge {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 2px 8px;
      border-radius: var(--radius-pill);
      font-size: 12px;
      font-weight: 600;
      font-family: var(--font-mono);
    }
    .delta-badge.good { background: rgba(26,107,78,0.1); color: var(--accent); }
    .delta-badge.bad { background: rgba(184,45,74,0.1); color: var(--danger); }
    .delta-badge.neutral { background: var(--surface-raised); color: var(--text-tertiary); }
    [data-theme="dark"] .delta-badge.good { background: rgba(61,217,160,0.12); }
    [data-theme="dark"] .delta-badge.bad { background: rgba(240,96,128,0.12); }

    /* ── Snapshot Bar ── */
    .snapshot-bar {
      padding: 16px 20px;
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      gap: 20px;
      flex-wrap: wrap;
    }
    .snapshot-bar-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      color: var(--text-secondary);
    }
    .snapshot-bar-item strong {
      color: var(--text);
      font-family: var(--font-mono);
      font-size: 12px;
    }
    .status-bar-visual {
      display: flex;
      height: 6px;
      border-radius: var(--radius-pill);
      overflow: hidden;
      flex: 1;
      min-width: 120px;
    }
    .status-bar-visual span { height: 100%; }
    .sb-pass { background: var(--accent); }
    .sb-warn { background: var(--warn); }
    .sb-fail { background: var(--danger); }
    .sb-skip { background: var(--border); }

    /* ── Language Chart Section ── */
    .lang-section {
      margin-top: 24px;
    }
    .lang-section .panel { padding: 20px; }
    .lang-chart-wrap { max-width: 360px; margin: 0 auto; }
    .lang-chart-wrap canvas { width: 100% !important; height: 280px !important; }

    /* ── Trends Tab ── */
    .chart-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }
    .chart-panel {
      padding: 20px;
      min-height: 300px;
    }
    .chart-panel h3 {
      font-family: var(--font-heading);
      font-size: 1.1rem;
      font-weight: 600;
      margin-bottom: 12px;
    }
    .chart-panel canvas {
      width: 100% !important;
      height: 220px !important;
    }

    /* ── Code Health Tab ── */
    .health-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }
    .health-panel {
      padding: 20px;
    }
    .health-panel h3 {
      font-family: var(--font-heading);
      font-size: 1.1rem;
      font-weight: 600;
      margin-bottom: 12px;
    }
    .health-panel.full-width {
      grid-column: 1 / -1;
    }
    .file-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .file-table th, .file-table td {
      padding: 8px 10px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    .file-table th {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-secondary);
      font-weight: 600;
    }
    .file-table td {
      font-family: var(--font-mono);
      font-size: 12px;
    }
    .file-table td:first-child {
      max-width: 280px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .file-table tr:last-child td { border-bottom: 0; }
    .dep-stats {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }
    .dep-stat-item {
      text-align: center;
      padding: 12px;
      background: var(--surface);
      border-radius: var(--radius-sm);
      border: 1px solid var(--border);
    }
    .dep-stat-value {
      font-family: var(--font-heading);
      font-size: 1.5rem;
      font-weight: 700;
    }
    .dep-stat-label {
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 2px;
    }
    .donut-wrap { max-width: 260px; margin: 0 auto; }
    .donut-wrap canvas { width: 100% !important; height: 220px !important; }
    .comp-chart-wrap canvas { width: 100% !important; height: 220px !important; }

    /* ── History Tab ── */
    .history-panel { padding: 20px; }
    .history-panel h3 {
      font-family: var(--font-heading);
      font-size: 1.1rem;
      font-weight: 600;
      margin-bottom: 12px;
    }
    .table-wrap {
      overflow: auto;
      border-radius: var(--radius-md);
      border: 1px solid var(--border);
    }
    .history-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      min-width: 900px;
    }
    .history-table th, .history-table td {
      padding: 10px 12px;
      text-align: left;
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }
    .history-table th {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-secondary);
      font-weight: 600;
      background: var(--surface-raised);
      cursor: pointer;
      user-select: none;
      transition: color 120ms ease;
    }
    .history-table th:hover { color: var(--text); }
    .history-table th .sort-arrow { font-size: 10px; margin-left: 4px; }
    .history-table tr:last-child td { border-bottom: 0; }
    .history-table .commit-cell {
      font-family: var(--font-mono);
      font-size: 12px;
    }
    .history-table .message-cell {
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--text-secondary);
    }
    .status-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .status-dot.pass { background: var(--accent); }
    .status-dot.warn { background: var(--warn); }
    .status-dot.fail { background: var(--danger); }
    .status-dot.skip { background: var(--text-tertiary); }
    .expandable-row { cursor: pointer; }
    .expandable-row:hover { background: var(--surface-raised); }
    .detail-row td {
      padding: 0 !important;
      border-bottom: 1px solid var(--border);
    }
    .detail-content {
      padding: 12px 16px;
      background: var(--surface-raised);
    }
    .detail-content table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .detail-content td {
      padding: 6px 10px !important;
      border-bottom: 1px solid var(--border) !important;
      white-space: normal !important;
    }
    .detail-content tr:last-child td { border-bottom: 0 !important; }

    /* ── Section Headings ── */
    .section-title {
      font-family: var(--font-heading);
      font-size: 1.1rem;
      font-weight: 600;
      margin-bottom: 16px;
    }

    /* ── Responsive ── */
    @media (max-width: 1024px) {
      .chart-grid, .health-grid { grid-template-columns: 1fr; }
      .health-panel.full-width { grid-column: auto; }
    }
    @media (max-width: 768px) {
      .overview-top { grid-template-columns: 1fr; }
      .metric-grid { grid-template-columns: repeat(2, 1fr); }
      .header-inner { padding: 10px 16px; }
      .header-center { display: none; }
      .main { padding: 16px; }
      .tab-btn { padding: 10px 14px; font-size: 13px; }
    }
    @media (max-width: 480px) {
      .metric-grid { grid-template-columns: 1fr; }
    }

    /* ── Print ── */
    @media print {
      .header { position: static; box-shadow: none; }
      .tab-bar, .theme-toggle, .header-center { display: none; }
      .tab-content { display: block !important; opacity: 1 !important; page-break-inside: avoid; }
      .panel, .card { box-shadow: none; border: 1px solid #ccc; }
      body { background: #fff; color: #000; }
    }
  `
}

function buildHtmlSkeleton(cwd: string): string {
  const sunIcon = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"/></svg>'
  const moonIcon = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z"/></svg>'

  return `
  <header class="header">
    <div class="header-inner">
      <div class="header-left">
        <span class="header-title">${escapeHtml(basename(cwd))}</span>
        <span class="branch-badge" id="branch-badge"></span>
      </div>
      <div class="header-center" id="range-controls"></div>
      <div class="header-right">
        <button class="theme-toggle" id="theme-toggle" type="button" title="Toggle theme">
          <span class="sun-icon">${sunIcon}</span>
          <span class="moon-icon" style="display:none">${moonIcon}</span>
        </button>
      </div>
    </div>
  </header>

  <nav class="tab-bar">
    <div class="tab-bar-inner">
      <button class="tab-btn active" data-tab="overview" type="button">Overview</button>
      <button class="tab-btn" data-tab="trends" type="button">Trends</button>
      <button class="tab-btn" data-tab="health" type="button">Code Health</button>
      <button class="tab-btn" data-tab="history" type="button">History</button>
    </div>
  </nav>

  <main class="main">
    <!-- Overview Tab -->
    <section class="tab-content active" id="tab-overview">
      <div class="overview-top">
        <div class="panel gauge-panel">
          <canvas id="gauge-canvas" width="200" height="140"></canvas>
          <div class="gauge-label" id="gauge-label">Health Score</div>
        </div>
        <div class="metric-grid" id="metric-grid"></div>
      </div>
      <div class="panel snapshot-bar" id="snapshot-bar"></div>
      <div class="lang-section">
        <h3 class="section-title">Language Distribution</h3>
        <div class="panel" style="padding:20px">
          <div class="lang-chart-wrap">
            <canvas id="lang-chart"></canvas>
          </div>
        </div>
      </div>
    </section>

    <!-- Trends Tab -->
    <section class="tab-content" id="tab-trends">
      <div class="chart-grid" id="trends-grid"></div>
    </section>

    <!-- Code Health Tab -->
    <section class="tab-content" id="tab-health">
      <div class="health-grid" id="health-grid"></div>
    </section>

    <!-- History Tab -->
    <section class="tab-content" id="tab-history">
      <div class="panel history-panel">
        <h3>Snapshot History</h3>
        <div class="table-wrap">
          <table class="history-table">
            <thead>
              <tr id="history-head"></tr>
            </thead>
            <tbody id="history-body"></tbody>
          </table>
        </div>
      </div>
    </section>
  </main>`
}

function buildClientScript(payload: string): string {
  return `
'use strict';
const dashboard = ${payload};
const allCharts = [];
let activeRange = dashboard.controls[0]?.id ?? 'all';
let activeTab = localStorage.getItem('cw-tab') || 'overview';
let sortCol = null;
let sortDir = 'desc';

/* ── Utilities ── */
const fmt = (v) => v == null ? '—' : Number(v).toLocaleString('en-US');
const fmtPct = (v) => v == null ? '—' : Number(v).toFixed(1) + '%';
const fmtMetric = (m, v) => m.kind === 'percent' ? fmtPct(v) : fmt(v);
const esc = (v) => String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';

function getRowsForRange(id) {
  if (id === 'all') return dashboard.rows;
  return dashboard.rows.slice(-Number(id));
}

function getMetricValue(row, key) {
  if (row.metrics && key in row.metrics) return row.metrics[key];
  if (row.extended && key in row.extended) return row.extended[key];
  return null;
}

/* ── Theme ── */
function initTheme() {
  const saved = localStorage.getItem('cw-theme');
  if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  updateThemeIcon();
}
function toggleTheme() {
  const dark = !isDark();
  if (dark) document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
  localStorage.setItem('cw-theme', dark ? 'dark' : 'light');
  updateThemeIcon();
  updateChartTheme();
}
function updateThemeIcon() {
  const dark = isDark();
  document.querySelector('.sun-icon').style.display = dark ? 'none' : '';
  document.querySelector('.moon-icon').style.display = dark ? '' : 'none';
}
function getMetricColor(m) {
  return isDark() ? m.colorDark : m.color;
}

/* ── Tabs ── */
function switchTab(tabId) {
  activeTab = tabId;
  localStorage.setItem('cw-tab', tabId);
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
  document.querySelectorAll('.tab-content').forEach(s => s.classList.toggle('active', s.id === 'tab-' + tabId));
  if (tabId === 'trends') renderTrends();
  if (tabId === 'health') renderHealth();
}

/* ── Health Score ── */
function computeHealthScore(row) {
  if (!row.metrics) return null;
  const m = row.metrics;
  const ext = row.extended || {};

  // Sub-scores (0-100, higher is better)
  const complexityScore = Math.max(0, Math.min(100, 100 - (m.complexity / 10)));
  const unusedScore = Math.max(0, Math.min(100, 100 - (m.unused * 2)));
  const dupScore = Math.max(0, Math.min(100, 100 - (m.duplication * 10)));
  const cycleScore = Math.max(0, Math.min(100, m.cycles === 0 ? 100 : Math.max(0, 100 - m.cycles * 10)));

  const total = row.status.pass + row.status.warn + row.status.fail + row.status.skip;
  const passRate = total > 0 ? ((row.status.pass / total) * 100) : 100;

  return Math.round(
    complexityScore * 0.25 +
    unusedScore * 0.20 +
    dupScore * 0.25 +
    cycleScore * 0.15 +
    passRate * 0.15
  );
}

function renderGauge(score) {
  const canvas = document.getElementById('gauge-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = 200 * dpr;
  canvas.height = 140 * dpr;
  ctx.scale(dpr, dpr);

  const cx = 100, cy = 110, r = 80;
  const startAngle = Math.PI * 0.85;
  const endAngle = Math.PI * 2.15;
  const totalArc = endAngle - startAngle;

  // Background arc
  ctx.beginPath();
  ctx.arc(cx, cy, r, startAngle, endAngle);
  ctx.strokeStyle = isDark() ? '#2f2d2a' : '#e8e4df';
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.stroke();

  if (score != null) {
    // Score arc
    const scoreAngle = startAngle + (score / 100) * totalArc;
    const gradient = ctx.createConicGradient(startAngle, cx, cy);
    const green = isDark() ? '#3dd9a0' : '#1a6b4e';
    const amber = isDark() ? '#f0943e' : '#c4650a';
    const red = isDark() ? '#f06080' : '#b82d4a';
    // Simplified: use score color directly
    let scoreColor = green;
    if (score < 50) scoreColor = red;
    else if (score < 75) scoreColor = amber;

    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, scoreAngle);
    ctx.strokeStyle = scoreColor;
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Score text
    ctx.fillStyle = isDark() ? '#e8e4df' : '#1a1a1a';
    ctx.font = 'bold 36px ' + getComputedStyle(document.documentElement).getPropertyValue('--font-heading');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(score, cx, cy - 10);

    ctx.fillStyle = isDark() ? '#9e9790' : '#6b6560';
    ctx.font = '13px ' + getComputedStyle(document.documentElement).getPropertyValue('--font-body');
    ctx.fillText('/ 100', cx, cy + 16);
  } else {
    ctx.fillStyle = isDark() ? '#9e9790' : '#6b6560';
    ctx.font = '16px ' + getComputedStyle(document.documentElement).getPropertyValue('--font-body');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N/A', cx, cy - 4);
  }

  document.getElementById('gauge-label').textContent = score != null
    ? (score >= 75 ? 'Healthy' : score >= 50 ? 'Needs Attention' : 'Critical')
    : 'Health Score';
}

/* ── Sparklines ── */
function renderSparkline(canvas, values, color) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = 60, h = 22;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.scale(dpr, dpr);

  const nums = values.filter(v => v != null);
  if (nums.length < 2) return;

  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min || 1;
  const pad = 2;

  ctx.beginPath();
  nums.forEach((v, i) => {
    const x = pad + (i / (nums.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

/* ── Metric Cards ── */
function renderMetricGrid(rows) {
  const grid = document.getElementById('metric-grid');
  const latest = rows.at(-1);
  const prev = rows.at(-2);
  const coreMetrics = dashboard.metrics.filter(m => m.group === 'core');

  // Also add comment ratio as 6th card
  const extraMetric = dashboard.metrics.find(m => m.key === 'commentRatio');
  const displayMetrics = extraMetric ? [...coreMetrics, extraMetric] : coreMetrics;

  grid.innerHTML = displayMetrics.map(m => {
    const val = latest ? getMetricValue(latest, m.key) : null;
    const prevVal = prev ? getMetricValue(prev, m.key) : null;
    const sparkVals = rows.slice(-10).map(r => getMetricValue(r, m.key));

    let deltaHtml = '';
    if (val != null && prevVal != null) {
      const delta = val - prevVal;
      if (delta === 0) {
        deltaHtml = '<span class="delta-badge neutral">=</span>';
      } else {
        const sign = delta > 0 ? '+' : '';
        const formatted = m.kind === 'percent' ? sign + delta.toFixed(1) + '%' : sign + Math.round(delta).toLocaleString();
        const isGood = m.lowerIsBetter ? delta < 0 : delta > 0;
        deltaHtml = '<span class="delta-badge ' + (isGood ? 'good' : 'bad') + '">' + formatted + '</span>';
      }
    } else {
      deltaHtml = '<span class="delta-badge neutral">—</span>';
    }

    return '<div class="card metric-card">' +
      '<div class="metric-card-header"><span class="metric-card-title">' + esc(m.title) + '</span></div>' +
      '<div class="metric-card-value">' + fmtMetric(m, val) + '</div>' +
      '<div class="metric-card-footer">' + deltaHtml +
      '<canvas class="sparkline" data-key="' + m.key + '"></canvas></div></div>';
  }).join('');

  // Render sparklines
  grid.querySelectorAll('.sparkline').forEach(canvas => {
    const key = canvas.dataset.key;
    const m = dashboard.metrics.find(x => x.key === key);
    const vals = rows.slice(-10).map(r => getMetricValue(r, key));
    if (m) renderSparkline(canvas, vals, getMetricColor(m));
  });
}

/* ── Snapshot Bar ── */
function renderSnapshotBar(rows) {
  const bar = document.getElementById('snapshot-bar');
  const latest = rows.at(-1);
  if (!latest) { bar.innerHTML = '<span style="color:var(--text-secondary)">No snapshots</span>'; return; }

  const s = latest.status;
  const total = s.pass + s.warn + s.fail + s.skip || 1;

  bar.innerHTML =
    '<div class="snapshot-bar-item">Commit <strong>' + esc(latest.commit.slice(0, 7) + (latest.dirty ? '*' : '')) + '</strong></div>' +
    (latest.commitMessage ? '<div class="snapshot-bar-item" style="color:var(--text-tertiary);font-style:italic;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(latest.commitMessage.split('\\n')[0]) + '</div>' : '') +
    '<div class="snapshot-bar-item">Duration <strong>' + (latest.duration / 1000).toFixed(1) + 's</strong></div>' +
    '<div class="snapshot-bar-item">' + s.pass + 'p / ' + s.warn + 'w / ' + s.fail + 'f / ' + s.skip + 's</div>' +
    '<div class="status-bar-visual">' +
      (s.pass ? '<span class="sb-pass" style="width:' + (s.pass/total*100) + '%"></span>' : '') +
      (s.warn ? '<span class="sb-warn" style="width:' + (s.warn/total*100) + '%"></span>' : '') +
      (s.fail ? '<span class="sb-fail" style="width:' + (s.fail/total*100) + '%"></span>' : '') +
      (s.skip ? '<span class="sb-skip" style="width:' + (s.skip/total*100) + '%"></span>' : '') +
    '</div>';
}

/* ── Branch Badge ── */
function renderBranchBadge(rows) {
  const badge = document.getElementById('branch-badge');
  const latest = rows.at(-1);
  if (latest?.branch) { badge.textContent = latest.branch; badge.style.display = ''; }
  else badge.style.display = 'none';
}

/* ── Language Donut ── */
let langChart = null;
function renderLanguageChart(rows) {
  const latest = rows.at(-1);
  const langs = latest?.languages || [];
  if (langChart) { langChart.destroy(); langChart = null; }

  const canvas = document.getElementById('lang-chart');
  if (!canvas || langs.length === 0) return;

  const colors = [
    getComputedStyle(document.documentElement).getPropertyValue('--chart-green').trim(),
    getComputedStyle(document.documentElement).getPropertyValue('--chart-amber').trim(),
    getComputedStyle(document.documentElement).getPropertyValue('--chart-blue').trim(),
    getComputedStyle(document.documentElement).getPropertyValue('--chart-rose').trim(),
    getComputedStyle(document.documentElement).getPropertyValue('--chart-purple').trim(),
    getComputedStyle(document.documentElement).getPropertyValue('--chart-cyan').trim(),
  ];

  langChart = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: langs.map(l => l.language),
      datasets: [{
        data: langs.map(l => l.code),
        backgroundColor: langs.map((_, i) => colors[i % colors.length]),
        borderWidth: 2,
        borderColor: isDark() ? '#1e1d1b' : '#ffffff',
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '55%',
      plugins: {
        legend: {
          position: 'right',
          labels: { color: isDark() ? '#e8e4df' : '#1a1a1a', font: { size: 12 }, padding: 12 }
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              const total = ctx.dataset.data.reduce((s, v) => s + v, 0);
              const pct = ((ctx.raw / total) * 100).toFixed(1);
              return ctx.label + ': ' + Number(ctx.raw).toLocaleString() + ' lines (' + pct + '%)';
            }
          }
        }
      }
    }
  });
  allCharts.push(langChart);
}

/* ── Trend Charts ── */
let trendsRendered = false;
function renderTrends() {
  if (trendsRendered) return;
  trendsRendered = true;

  const rows = getRowsForRange(activeRange);
  const grid = document.getElementById('trends-grid');
  const allMetrics = dashboard.metrics;

  // Also add stacked charts
  const chartDefs = [
    ...allMetrics.map(m => ({ type: 'line', metric: m })),
    { type: 'stacked', id: 'composition', title: 'Code Composition' },
    { type: 'stacked', id: 'unused-breakdown', title: 'Unused Breakdown' },
  ];

  grid.innerHTML = chartDefs.map((def, i) => {
    const id = def.type === 'line' ? 'trend-' + def.metric.key : 'trend-' + def.id;
    const title = def.type === 'line' ? def.metric.title : def.title;
    return '<div class="panel chart-panel"><h3>' + esc(title) + '</h3><canvas id="' + id + '"></canvas></div>';
  }).join('');

  const labels = rows.map(r => r.label);
  const gridColor = isDark() ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
  const tickColor = isDark() ? '#9e9790' : '#6b6560';

  // Line charts
  allMetrics.forEach(m => {
    const canvas = document.getElementById('trend-' + m.key);
    if (!canvas) return;
    const values = rows.map(r => getMetricValue(r, m.key));
    const color = getMetricColor(m);
    const chart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: m.title,
          data: values,
          borderColor: color,
          backgroundColor: color + '18',
          borderWidth: 2.5,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: color,
          spanGaps: true,
          tension: 0.3,
          fill: true,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label(ctx) { return m.title + ': ' + fmtMetric(m, ctx.raw); } } },
        },
        scales: {
          x: { ticks: { maxRotation: 0, autoSkipPadding: 18, color: tickColor }, grid: { color: gridColor } },
          y: { ticks: { color: tickColor, callback(v) { return fmtMetric(m, v); } }, grid: { color: gridColor } },
        },
      },
    });
    allCharts.push(chart);
  });

  // Composition stacked area
  const compCanvas = document.getElementById('trend-composition');
  if (compCanvas) {
    const codeVals = rows.map(r => r.extended?.totalCode ?? null);
    const commentVals = rows.map(r => r.extended?.totalComments ?? null);
    const blankVals = rows.map(r => r.extended?.totalBlanks ?? null);
    const cs = getComputedStyle(document.documentElement);
    const chart = new Chart(compCanvas.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Code', data: codeVals, borderColor: cs.getPropertyValue('--chart-green').trim(), backgroundColor: cs.getPropertyValue('--chart-green').trim() + '40', fill: true, tension: 0.3, borderWidth: 2, pointRadius: 0 },
          { label: 'Comments', data: commentVals, borderColor: cs.getPropertyValue('--chart-blue').trim(), backgroundColor: cs.getPropertyValue('--chart-blue').trim() + '40', fill: true, tension: 0.3, borderWidth: 2, pointRadius: 0 },
          { label: 'Blanks', data: blankVals, borderColor: cs.getPropertyValue('--chart-purple').trim(), backgroundColor: cs.getPropertyValue('--chart-purple').trim() + '40', fill: true, tension: 0.3, borderWidth: 2, pointRadius: 0 },
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: { legend: { labels: { color: tickColor } } },
        scales: {
          x: { stacked: true, ticks: { maxRotation: 0, autoSkipPadding: 18, color: tickColor }, grid: { color: gridColor } },
          y: { stacked: true, ticks: { color: tickColor }, grid: { color: gridColor } },
        },
      },
    });
    allCharts.push(chart);
  }

  // Unused breakdown stacked
  const unusedCanvas = document.getElementById('trend-unused-breakdown');
  if (unusedCanvas) {
    const cs = getComputedStyle(document.documentElement);
    const chart = new Chart(unusedCanvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Files', data: rows.map(r => r.extended?.unusedFiles ?? 0), backgroundColor: cs.getPropertyValue('--chart-green').trim() + '90' },
          { label: 'Exports', data: rows.map(r => r.extended?.unusedExports ?? 0), backgroundColor: cs.getPropertyValue('--chart-amber').trim() + '90' },
          { label: 'Types', data: rows.map(r => r.extended?.unusedTypes ?? 0), backgroundColor: cs.getPropertyValue('--chart-blue').trim() + '90' },
          { label: 'Deps', data: rows.map(r => r.extended?.unusedDependencies ?? 0), backgroundColor: cs.getPropertyValue('--chart-rose').trim() + '90' },
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: { legend: { labels: { color: tickColor } } },
        scales: {
          x: { stacked: true, ticks: { maxRotation: 0, autoSkipPadding: 18, color: tickColor }, grid: { color: gridColor } },
          y: { stacked: true, ticks: { color: tickColor }, grid: { color: gridColor } },
        },
      },
    });
    allCharts.push(chart);
  }
}

/* ── Code Health ── */
let healthRendered = false;
function renderHealth() {
  if (healthRendered) return;
  healthRendered = true;

  const rows = getRowsForRange(activeRange);
  const latest = rows.at(-1);
  const grid = document.getElementById('health-grid');
  if (!latest) { grid.innerHTML = '<div class="panel health-panel"><h3>No data</h3></div>'; return; }

  let html = '';

  // Complexity hotspots
  const complexFiles = latest.topComplexFiles || [];
  html += '<div class="panel health-panel"><h3>Complexity Hotspots</h3>';
  if (complexFiles.length) {
    html += '<table class="file-table"><thead><tr><th>File</th><th>Lines</th><th>Complexity</th></tr></thead><tbody>';
    complexFiles.forEach(f => {
      html += '<tr><td title="' + esc(f.path) + '">' + esc(f.path) + '</td><td>' + fmt(f.lines) + '</td><td>' + fmt(f.complexity) + '</td></tr>';
    });
    html += '</tbody></table>';
  } else html += '<p style="color:var(--text-secondary)">No data available</p>';
  html += '</div>';

  // Largest files
  const largeFiles = latest.topLargestFiles || [];
  html += '<div class="panel health-panel"><h3>Largest Files</h3>';
  if (largeFiles.length) {
    html += '<table class="file-table"><thead><tr><th>File</th><th>Lines</th><th>Code</th></tr></thead><tbody>';
    largeFiles.forEach(f => {
      html += '<tr><td title="' + esc(f.path) + '">' + esc(f.path) + '</td><td>' + fmt(f.lines) + '</td><td>' + fmt(f.code) + '</td></tr>';
    });
    html += '</tbody></table>';
  } else html += '<p style="color:var(--text-secondary)">No data available</p>';
  html += '</div>';

  // Unused code breakdown donut
  const ext = latest.extended;
  html += '<div class="panel health-panel"><h3>Unused Code Breakdown</h3>';
  if (ext && (ext.unusedFiles + ext.unusedExports + ext.unusedTypes + ext.unusedDependencies) > 0) {
    html += '<div class="donut-wrap"><canvas id="unused-donut"></canvas></div>';
  } else html += '<p style="color:var(--text-secondary)">No unused code detected</p>';
  html += '</div>';

  // Dependency health
  html += '<div class="panel health-panel"><h3>Dependency Health</h3>';
  if (ext) {
    html += '<div class="dep-stats">';
    html += '<div class="dep-stat-item"><div class="dep-stat-value">' + fmt(ext.totalModules) + '</div><div class="dep-stat-label">Modules</div></div>';
    html += '<div class="dep-stat-item"><div class="dep-stat-value">' + fmt(ext.totalDependencies) + '</div><div class="dep-stat-label">Dependencies</div></div>';
    html += '<div class="dep-stat-item"><div class="dep-stat-value">' + fmt(latest.metrics?.cycles ?? 0) + '</div><div class="dep-stat-label">Cycles</div></div>';
    html += '<div class="dep-stat-item"><div class="dep-stat-value">' + (ext.dependencyRatio || '—') + '</div><div class="dep-stat-label">Deps/Module</div></div>';
    html += '</div>';
  } else html += '<p style="color:var(--text-secondary)">No data available</p>';
  html += '</div>';

  // Code composition stacked bar
  html += '<div class="panel health-panel full-width"><h3>Code Composition</h3>';
  if (ext) {
    html += '<div class="comp-chart-wrap"><canvas id="comp-bar"></canvas></div>';
  } else html += '<p style="color:var(--text-secondary)">No data available</p>';
  html += '</div>';

  grid.innerHTML = html;

  // Render unused donut
  if (ext && (ext.unusedFiles + ext.unusedExports + ext.unusedTypes + ext.unusedDependencies) > 0) {
    const donutCanvas = document.getElementById('unused-donut');
    if (donutCanvas) {
      const cs = getComputedStyle(document.documentElement);
      const chart = new Chart(donutCanvas.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: ['Files', 'Exports', 'Types', 'Dependencies'],
          datasets: [{
            data: [ext.unusedFiles, ext.unusedExports, ext.unusedTypes, ext.unusedDependencies],
            backgroundColor: [
              cs.getPropertyValue('--chart-green').trim(),
              cs.getPropertyValue('--chart-amber').trim(),
              cs.getPropertyValue('--chart-blue').trim(),
              cs.getPropertyValue('--chart-rose').trim(),
            ],
            borderWidth: 2,
            borderColor: isDark() ? '#1e1d1b' : '#ffffff',
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '50%',
          plugins: {
            legend: { labels: { color: isDark() ? '#e8e4df' : '#1a1a1a', font: { size: 12 } } }
          }
        }
      });
      allCharts.push(chart);
    }
  }

  // Render composition bar
  if (ext) {
    const compCanvas = document.getElementById('comp-bar');
    if (compCanvas) {
      const cs = getComputedStyle(document.documentElement);
      const chart = new Chart(compCanvas.getContext('2d'), {
        type: 'bar',
        data: {
          labels: ['Current Snapshot'],
          datasets: [
            { label: 'Code', data: [ext.totalCode], backgroundColor: cs.getPropertyValue('--chart-green').trim() },
            { label: 'Comments', data: [ext.totalComments], backgroundColor: cs.getPropertyValue('--chart-blue').trim() },
            { label: 'Blanks', data: [ext.totalBlanks], backgroundColor: cs.getPropertyValue('--chart-purple').trim() },
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'y',
          plugins: {
            legend: { labels: { color: isDark() ? '#e8e4df' : '#1a1a1a', font: { size: 12 } } }
          },
          scales: {
            x: { stacked: true, ticks: { color: isDark() ? '#9e9790' : '#6b6560' }, grid: { color: isDark() ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' } },
            y: { stacked: true, ticks: { color: isDark() ? '#9e9790' : '#6b6560' }, grid: { display: false } },
          }
        }
      });
      allCharts.push(chart);
    }
  }
}

/* ── History Table ── */
const historyColumns = [
  { key: 'label', title: 'Timestamp', sort: (a, b) => a.timestamp.localeCompare(b.timestamp) },
  { key: 'commit', title: 'Commit', sort: (a, b) => a.commit.localeCompare(b.commit) },
  { key: 'message', title: 'Message', sort: null },
  { key: 'status', title: 'Status', sort: (a, b) => (a.status.pass - a.status.fail) - (b.status.pass - b.status.fail) },
  { key: 'lines', title: 'Lines', sort: (a, b) => (a.metrics?.lines ?? 0) - (b.metrics?.lines ?? 0) },
  { key: 'complexity', title: 'Complexity', sort: (a, b) => (a.metrics?.complexity ?? 0) - (b.metrics?.complexity ?? 0) },
  { key: 'unused', title: 'Unused', sort: (a, b) => (a.metrics?.unused ?? 0) - (b.metrics?.unused ?? 0) },
  { key: 'duplication', title: 'Duplication', sort: (a, b) => (a.metrics?.duplication ?? 0) - (b.metrics?.duplication ?? 0) },
  { key: 'cycles', title: 'Cycles', sort: (a, b) => (a.metrics?.cycles ?? 0) - (b.metrics?.cycles ?? 0) },
];

function renderHistoryHead() {
  const headRow = document.getElementById('history-head');
  headRow.innerHTML = historyColumns.map(col => {
    const arrow = sortCol === col.key ? (sortDir === 'asc' ? ' \\u25B2' : ' \\u25BC') : '';
    return '<th data-sort="' + col.key + '">' + col.title + '<span class="sort-arrow">' + arrow + '</span></th>';
  }).join('');
}

function renderHistoryTable(rows) {
  renderHistoryHead();
  let sorted = rows.slice().reverse();
  if (sortCol) {
    const col = historyColumns.find(c => c.key === sortCol);
    if (col?.sort) {
      sorted = rows.slice().sort((a, b) => {
        const v = col.sort(a, b);
        return sortDir === 'asc' ? v : -v;
      });
    }
  }

  const body = document.getElementById('history-body');
  body.innerHTML = sorted.map((row, i) => {
    const s = row.status;
    const total = s.pass + s.warn + s.fail + s.skip;
    const worstStatus = s.fail > 0 ? 'fail' : s.warn > 0 ? 'warn' : 'pass';

    let detailHtml = '';
    if (row.checkDetails?.length) {
      detailHtml = '<tr class="detail-row" id="detail-' + i + '" style="display:none"><td colspan="' + historyColumns.length + '"><div class="detail-content"><table>';
      row.checkDetails.forEach(c => {
        detailHtml += '<tr><td><span class="status-dot ' + c.status + '"></span> ' + esc(c.name) + '</td><td>' + esc(c.summary) + '</td><td>' + (c.duration / 1000).toFixed(1) + 's</td></tr>';
      });
      detailHtml += '</table></div></td></tr>';
    }

    return '<tr class="expandable-row" data-detail="detail-' + i + '">' +
      '<td>' + esc(row.label) + '</td>' +
      '<td class="commit-cell">' + esc(row.commit.slice(0, 7) + (row.dirty ? '*' : '')) + '</td>' +
      '<td class="message-cell">' + esc(row.commitMessage?.split('\\n')[0] ?? '—') + '</td>' +
      '<td><span class="status-dot ' + worstStatus + '"></span> ' + s.pass + 'p/' + s.warn + 'w/' + s.fail + 'f/' + s.skip + 's</td>' +
      '<td>' + fmt(row.metrics?.lines) + '</td>' +
      '<td>' + fmt(row.metrics?.complexity) + '</td>' +
      '<td>' + fmt(row.metrics?.unused) + '</td>' +
      '<td>' + fmtPct(row.metrics?.duplication) + '</td>' +
      '<td>' + fmt(row.metrics?.cycles) + '</td>' +
      '</tr>' + detailHtml;
  }).join('');
}

/* ── Chart Theme Update ── */
function updateChartTheme() {
  // Easiest: destroy and re-render everything
  while (allCharts.length) allCharts.pop().destroy();
  langChart = null;
  trendsRendered = false;
  healthRendered = false;
  const rows = getRowsForRange(activeRange);
  renderGauge(computeHealthScore(rows.at(-1)));
  renderMetricGrid(rows);
  renderLanguageChart(rows);
  if (activeTab === 'trends') renderTrends();
  if (activeTab === 'health') renderHealth();
}

/* ── Range Controls ── */
function renderRangeControls() {
  const container = document.getElementById('range-controls');
  container.innerHTML = dashboard.controls.map(c =>
    '<button class="range-pill' + (c.id === activeRange ? ' active' : '') + '" data-range="' + c.id + '" type="button">' + c.label + '</button>'
  ).join('');
}

function onRangeChange(rangeId) {
  activeRange = rangeId;
  document.querySelectorAll('.range-pill').forEach(b => b.classList.toggle('active', b.dataset.range === rangeId));

  // Reset lazy render flags
  while (allCharts.length) allCharts.pop().destroy();
  langChart = null;
  trendsRendered = false;
  healthRendered = false;

  const rows = getRowsForRange(rangeId);
  renderOverview(rows);
  renderHistoryTable(rows);
  if (activeTab === 'trends') renderTrends();
  if (activeTab === 'health') renderHealth();
}

/* ── Overview (composite) ── */
function renderOverview(rows) {
  const latest = rows.at(-1);
  renderBranchBadge(rows);
  renderGauge(computeHealthScore(latest));
  renderMetricGrid(rows);
  renderSnapshotBar(rows);
  renderLanguageChart(rows);
}

/* ── Event Listeners ── */
function init() {
  initTheme();
  renderRangeControls();

  const rows = getRowsForRange(activeRange);
  renderOverview(rows);
  renderHistoryTable(rows);

  // Restore tab
  if (activeTab !== 'overview') switchTab(activeTab);

  // Range controls
  document.getElementById('range-controls').addEventListener('click', e => {
    const btn = e.target.closest('[data-range]');
    if (btn) onRangeChange(btn.dataset.range);
  });

  // Theme toggle
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

  // Tab switching
  document.querySelector('.tab-bar-inner').addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (btn) switchTab(btn.dataset.tab);
  });

  // History table sort
  document.getElementById('history-head').addEventListener('click', e => {
    const th = e.target.closest('th[data-sort]');
    if (!th) return;
    const key = th.dataset.sort;
    if (sortCol === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else { sortCol = key; sortDir = 'desc'; }
    renderHistoryTable(getRowsForRange(activeRange));
  });

  // Expandable rows
  document.getElementById('history-body').addEventListener('click', e => {
    const row = e.target.closest('.expandable-row');
    if (!row) return;
    const detailId = row.dataset.detail;
    const detail = document.getElementById(detailId);
    if (detail) detail.style.display = detail.style.display === 'none' ? '' : 'none';
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === '1') switchTab('overview');
    else if (e.key === '2') switchTab('trends');
    else if (e.key === '3') switchTab('health');
    else if (e.key === '4') switchTab('history');
    else if (e.key === 't' || e.key === 'T') toggleTheme();
  });
}

init();
`
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
