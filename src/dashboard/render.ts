import { readFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { buildDashboardRows, dashboardMetrics } from './charts.js'
import { getSnapshotRange } from '../history/summary.js'
import type { SnapshotSummary, SnapshotTreeIndex } from '../history/types.js'

const require = createRequire(import.meta.url)

export function renderDashboardHtml(
  cwd: string,
  snapshots: SnapshotSummary[],
  trees: Record<string, SnapshotTreeIndex> = {},
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
    trees,
    metrics: dashboardMetrics,
    controls: rangeControls,
  })

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Codeweather Dashboard</title>
  <style>
    :root {
      --bg: #f4efe6;
      --panel: rgba(255, 251, 245, 0.82);
      --panel-strong: #fffaf2;
      --text: #1d1b18;
      --muted: #665f56;
      --border: rgba(29, 27, 24, 0.12);
      --accent: #126e52;
      --shadow: 0 18px 40px rgba(45, 32, 17, 0.08);
      --radius: 22px;
      --font: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, serif;
      --font-ui: "Avenir Next", "Segoe UI", sans-serif;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at top left, rgba(18, 110, 82, 0.14), transparent 24rem),
        radial-gradient(circle at top right, rgba(177, 74, 24, 0.12), transparent 24rem),
        linear-gradient(180deg, #fbf7ef 0%, var(--bg) 100%);
      color: var(--text);
      font-family: var(--font-ui);
    }

    .shell {
      width: min(1200px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 28px 0 56px;
    }

    .hero,
    .panel {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      backdrop-filter: blur(18px);
    }

    .hero {
      padding: 28px;
      display: grid;
      gap: 20px;
    }

    .hero-top {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: start;
      flex-wrap: wrap;
    }

    .eyebrow {
      font-size: 12px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 10px;
    }

    h1 {
      margin: 0;
      font-family: var(--font);
      font-size: clamp(2.2rem, 4vw, 3.8rem);
      line-height: 0.95;
      font-weight: 700;
    }

    .hero-meta {
      display: grid;
      gap: 6px;
      color: var(--muted);
      max-width: 34rem;
    }

    .hero-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
    }

    .stat-card,
    .mini-card {
      background: var(--panel-strong);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 16px;
    }

    .stat-card strong,
    .mini-card strong {
      display: block;
      font-size: 1.5rem;
      margin-top: 8px;
    }

    .controls {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin: 22px 0 16px;
      flex-wrap: wrap;
    }

    .button-row {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    button {
      border: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.74);
      color: var(--text);
      border-radius: 999px;
      padding: 10px 16px;
      font: inherit;
      cursor: pointer;
      transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
    }

    button:hover { transform: translateY(-1px); }
    button.active {
      background: var(--text);
      color: white;
      border-color: var(--text);
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 14px;
    }

    .chart-card {
      padding: 18px;
      min-height: 320px;
    }

    .chart-card h2,
    .table-panel h2 {
      margin: 0 0 14px;
      font-family: var(--font);
      font-size: 1.5rem;
    }

    .chart-card canvas {
      width: 100% !important;
      height: 230px !important;
    }

    .latest-summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
      margin-bottom: 18px;
    }

    .table-panel {
      margin-top: 16px;
      padding: 18px;
    }

    .insights-panel {
      margin-top: 16px;
      padding: 18px;
      display: grid;
      gap: 18px;
    }

    .insight-summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
    }

    .insight-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 14px;
    }

    .insight-card {
      background: var(--panel-strong);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 16px;
      display: grid;
      gap: 12px;
    }

    .insight-list {
      display: grid;
      gap: 10px;
    }

    .insight-row {
      display: flex;
      justify-content: space-between;
      align-items: start;
      gap: 12px;
      padding: 12px;
      border-radius: 14px;
      background: rgba(18, 110, 82, 0.06);
    }

    .insight-row strong {
      white-space: nowrap;
      font-size: 1rem;
    }

    .insight-path {
      font-weight: 600;
      word-break: break-word;
    }

    .insight-meta {
      margin-top: 4px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.4;
    }

    .insight-empty {
      color: var(--muted);
      font-size: 14px;
    }

    .tree-panel {
      margin-top: 16px;
      padding: 18px;
      display: grid;
      gap: 18px;
    }

    .tree-header {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      align-items: start;
      flex-wrap: wrap;
    }

    .tree-meta {
      color: var(--muted);
      max-width: 42rem;
      display: grid;
      gap: 4px;
      font-size: 14px;
    }

    .tree-layout {
      display: grid;
      grid-template-columns: minmax(0, 1.5fr) minmax(280px, 0.9fr);
      gap: 16px;
      align-items: start;
    }

    .tree-shell,
    .tree-detail {
      background: var(--panel-strong);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 14px;
    }

    .tree-shell {
      min-height: 420px;
      max-height: 68vh;
      overflow: auto;
    }

    .tree-root {
      display: grid;
      gap: 2px;
    }

    .tree-node-children {
      display: grid;
      gap: 2px;
    }

    .tree-line {
      display: grid;
      grid-template-columns: 18px minmax(0, 1fr);
      gap: 8px;
      align-items: center;
      padding-left: calc(10px + var(--depth, 0) * 16px);
    }

    .tree-row {
      width: 100%;
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
      padding: 8px 10px;
      border: 0;
      border-radius: 12px;
      background: transparent;
      color: inherit;
      text-align: left;
      cursor: pointer;
    }

    .tree-row:hover {
      background: rgba(18, 110, 82, 0.08);
    }

    .tree-row.selected {
      background: rgba(18, 110, 82, 0.14);
      outline: 1px solid rgba(18, 110, 82, 0.24);
    }

    .tree-toggle,
    .tree-spacer {
      width: 18px;
      height: 18px;
      display: inline-grid;
      place-items: center;
      border-radius: 999px;
      color: var(--muted);
      font-size: 11px;
      flex: none;
    }

    .tree-toggle {
      border: 0;
      background: rgba(29, 27, 24, 0.06);
      cursor: pointer;
    }

    .tree-label {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .tree-icon {
      color: var(--muted);
      width: 18px;
      text-align: center;
      flex: none;
    }

    .tree-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 600;
    }

    .tree-path {
      color: var(--muted);
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tree-badges {
      display: flex;
      flex-wrap: wrap;
      justify-content: end;
      gap: 6px;
    }

    .tree-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border-radius: 999px;
      padding: 5px 8px;
      font-size: 12px;
      background: rgba(29, 27, 24, 0.06);
      color: var(--muted);
      white-space: nowrap;
    }

    .tree-badge.issues {
      background: rgba(177, 74, 24, 0.12);
      color: #8b4515;
    }

    .tree-detail {
      display: grid;
      gap: 14px;
      min-height: 260px;
    }

    .tree-detail h3,
    .tree-detail h4 {
      margin: 0;
      font-family: var(--font);
      font-size: 1.2rem;
    }

    .tree-detail-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 10px;
    }

    .tree-detail-stat {
      padding: 12px;
      border-radius: 14px;
      border: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.62);
    }

    .tree-detail-stat strong {
      display: block;
      margin-top: 6px;
      font-size: 1.2rem;
      color: var(--text);
    }

    .tree-detail-list {
      display: grid;
      gap: 8px;
      color: var(--muted);
      font-size: 14px;
    }

    .table-wrap {
      overflow: auto;
      border-radius: 14px;
      border: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.72);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 860px;
      font-size: 14px;
    }

    th, td {
      padding: 12px 14px;
      text-align: left;
      border-bottom: 1px solid rgba(29, 27, 24, 0.08);
      white-space: nowrap;
    }

    th {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: var(--muted);
      background: rgba(255, 250, 242, 0.9);
    }

    tr:last-child td { border-bottom: 0; }

    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(29, 27, 24, 0.06);
      font-size: 12px;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: var(--accent);
    }

    .hidden { display: none; }

    @media (max-width: 700px) {
      .shell { width: min(100vw - 18px, 1200px); padding-top: 18px; }
      .hero, .panel { border-radius: 18px; }
      .chart-card { min-height: 280px; }
      .tree-layout { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="hero">
      <div class="hero-top">
        <div>
          <div class="eyebrow">Trending Dashboard</div>
          <h1>${escapeHtml(basename(cwd))}</h1>
        </div>
        <div class="hero-meta">
          <div id="range-label"></div>
          <div id="generated-label"></div>
        </div>
      </div>
      <div class="hero-stats" id="hero-stats"></div>
    </section>

    <div class="controls">
      <div class="button-row" id="range-controls"></div>
      <div class="button-row">
        <button id="toggle-table" type="button">Hide Table</button>
      </div>
    </div>

    <section class="panel chart-card">
      <div class="latest-summary" id="latest-summary"></div>
      <div class="grid" id="charts-grid"></div>
    </section>

    <section class="panel insights-panel">
      <div>
        <div class="eyebrow">Dependency-Cruiser</div>
        <h2>Dependency Instability</h2>
      </div>
      <div id="instability-panel"></div>
    </section>

    <section class="panel tree-panel">
      <div class="tree-header">
        <div>
          <div class="eyebrow">Prototype Explorer</div>
          <h2>Codebase Tree</h2>
        </div>
        <div class="tree-meta" id="tree-meta"></div>
      </div>
      <div class="tree-layout">
        <div class="tree-shell">
          <div class="tree-root" id="tree-root"></div>
        </div>
        <aside class="tree-detail" id="tree-detail"></aside>
      </div>
    </section>

    <section class="panel table-panel" id="table-panel">
      <h2>Snapshots</h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Commit</th>
              <th>Status</th>
              <th>Lines</th>
              <th>Complexity</th>
              <th>Unused</th>
              <th>Duplication</th>
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
    let activeNodeId = null;
    let activeTreeSnapshotId = null;
    const expandedNodes = new Set();

    const formatNumber = (value) => value == null ? '—' : Number(value).toLocaleString('en-US');
    const formatPercent = (value) => value == null ? '—' : Number(value).toFixed(1) + '%';
    const formatInstability = (value) => value == null ? '—' : (Number(value) * 100).toFixed(1) + '%';
    const formatMetric = (metric, value) => metric.kind === 'percent' ? formatPercent(value) : formatNumber(value);
    const escapeHtml = (value) => value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

    const compactNumber = (value) => {
      if (value == null) return '—';
      const abs = Math.abs(Number(value));
      if (abs >= 1000000) return (value / 1000000).toFixed(1) + 'M';
      if (abs >= 1000) return (value / 1000).toFixed(1) + 'k';
      return Number(value).toLocaleString('en-US');
    };

    function getRowsForRange(rangeId) {
      if (rangeId === 'all') return dashboard.rows;
      const count = Number(rangeId);
      return dashboard.rows.slice(-count);
    }

    function destroyCharts() {
      while (charts.length) {
        charts.pop().destroy();
      }
    }

    function metricDelta(rows, key) {
      if (rows.length < 2) return '—';
      const current = rows.at(-1)?.metrics?.[key];
      const previous = rows.at(-2)?.metrics?.[key];
      if (current == null || previous == null) return '—';
      const delta = Number((current - previous).toFixed(key === 'duplication' ? 1 : 0));
      if (delta === 0) return '=';
      if (key === 'duplication') return (delta > 0 ? '+' : '') + delta.toFixed(1) + '%';
      return (delta > 0 ? '+' : '') + delta.toLocaleString('en-US');
    }

    function renderHero(rows) {
      const statsEl = document.getElementById('hero-stats');
      const latest = rows.at(-1);
      const totals = [
        ['Snapshots', rows.length],
        ['Latest Commit', latest ? latest.commit + (latest.dirty ? '*' : '') : '—'],
        ['Range Start', rows[0]?.label ?? '—'],
        ['Range End', latest?.label ?? '—'],
      ];

      statsEl.innerHTML = totals.map(([label, value]) => \`
        <article class="stat-card">
          <div class="eyebrow">\${label}</div>
          <strong>\${escapeHtml(String(value))}</strong>
        </article>
      \`).join('');

      document.getElementById('range-label').textContent =
        dashboard.range ? 'Recorded range: ' + dashboard.range.start.replace('T', ' ').replace(/\\.\\d+Z$/, ' UTC') + ' → ' + dashboard.range.end.replace('T', ' ').replace(/\\.\\d+Z$/, ' UTC') : 'No snapshots loaded';
      document.getElementById('generated-label').textContent =
        'Generated ' + dashboard.generatedAt.replace('T', ' ').replace(/\\.\\d+Z$/, ' UTC');
    }

    function renderSummaryCards(rows) {
      const latest = rows.at(-1);
      const summaryEl = document.getElementById('latest-summary');
      if (!latest?.metrics) {
        summaryEl.innerHTML = '<article class="mini-card">No structured metrics available for the selected range.</article>';
        return;
      }

      summaryEl.innerHTML = dashboard.metrics.map((metric) => \`
        <article class="mini-card">
          <div class="eyebrow">\${metric.title}</div>
          <strong>\${formatMetric(metric, latest.metrics?.[metric.key])}</strong>
          <div>\${metricDelta(rows, metric.key)} vs previous snapshot</div>
        </article>
      \`).join('');
    }

    function renderCharts(rows) {
      destroyCharts();
      const grid = document.getElementById('charts-grid');
      grid.innerHTML = dashboard.metrics.map((metric) => \`
        <article class="panel chart-card">
          <h2>\${metric.title}</h2>
          <canvas id="chart-\${metric.key}"></canvas>
        </article>
      \`).join('');

      dashboard.metrics.forEach((metric) => {
        const canvas = document.getElementById('chart-' + metric.key);
        const ctx = canvas.getContext('2d');
        const values = rows.map((row) => row.metrics?.[metric.key] ?? null);
        const chart = new Chart(ctx, {
          type: 'line',
          data: {
            labels: rows.map((row) => row.label),
            datasets: [{
              label: metric.title,
              data: values,
              borderColor: metric.color,
              backgroundColor: metric.color + '22',
              borderWidth: 3,
              pointRadius: 4,
              pointHoverRadius: 6,
              pointBackgroundColor: metric.color,
              spanGaps: true,
              tension: 0.24,
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
                callbacks: {
                  label(context) {
                    return metric.title + ': ' + formatMetric(metric, context.raw);
                  },
                  afterBody(items) {
                    const row = rows[items[0]?.dataIndex ?? 0];
                    return row ? ['Commit: ' + row.commit + (row.dirty ? '*' : ''), 'Status: ' + row.status.pass + 'p/' + row.status.warn + 'w/' + row.status.fail + 'f/' + row.status.skip + 's'] : [];
                  },
                },
              },
            },
            scales: {
              x: {
                ticks: { maxRotation: 0, autoSkipPadding: 18, color: '#665f56' },
                grid: { color: 'rgba(29, 27, 24, 0.06)' },
              },
              y: {
                ticks: {
                  color: '#665f56',
                  callback(value) {
                    return formatMetric(metric, value);
                  },
                },
                grid: { color: 'rgba(29, 27, 24, 0.06)' },
              },
            },
          },
        });
        charts.push(chart);
      });
    }

    function renderInsightList(entries, primaryMetric) {
      if (!entries?.length) {
        return '<div class="insight-empty">No files matched this ranking.</div>';
      }

      return '<div class="insight-list">' + entries.map((entry) => {
        const primaryValue = primaryMetric === 'instability'
          ? formatInstability(entry.instability)
          : formatNumber(entry.dependents);

        return \`
          <div class="insight-row">
            <div>
              <div class="insight-path">\${escapeHtml(entry.path)}</div>
              <div class="insight-meta">
                Dependencies \${formatNumber(entry.dependencies)} ·
                Dependents \${formatNumber(entry.dependents)} ·
                In cycle \${entry.inCycle ? 'Yes' : 'No'}
              </div>
            </div>
            <strong>\${primaryValue}</strong>
          </div>
        \`;
      }).join('') + '</div>';
    }

    function renderInstability(rows) {
      const panel = document.getElementById('instability-panel');
      const latest = rows.at(-1);
      const instability = latest?.instability;

      if (!instability) {
        panel.innerHTML = '<article class="mini-card">No dependency instability data available for the selected range.</article>';
        return;
      }

      panel.innerHTML = \`
        <div class="insight-summary">
          <article class="mini-card">
            <div class="eyebrow">Files Analyzed</div>
            <strong>\${formatNumber(instability.summary.totalFiles)}</strong>
          </article>
          <article class="mini-card">
            <div class="eyebrow">Files In Cycles</div>
            <strong>\${formatNumber(instability.summary.filesInCycles)}</strong>
          </article>
          <article class="mini-card">
            <div class="eyebrow">Average Instability</div>
            <strong>\${formatInstability(instability.summary.averageInstability)}</strong>
          </article>
          <article class="mini-card">
            <div class="eyebrow">Highest Dependencies</div>
            <strong>\${formatNumber(instability.summary.highestDependencies)}</strong>
          </article>
          <article class="mini-card">
            <div class="eyebrow">Highest Dependents</div>
            <strong>\${formatNumber(instability.summary.highestDependents)}</strong>
          </article>
        </div>
        <div class="insight-grid">
          <article class="insight-card">
            <h3>Highly Unstable Files</h3>
            \${renderInsightList(instability.highlyUnstableFiles, 'instability')}
          </article>
          <article class="insight-card">
            <h3>Stable Highly-Depended-On Files</h3>
            \${renderInsightList(instability.stableHighlyDependedOnFiles, 'dependents')}
          </article>
        </div>
      \`;
    }

    function getTreeSnapshot(rows) {
      const latest = rows.at(-1);
      if (!latest) return undefined;
      const tree = dashboard.trees?.[latest.id];
      if (!tree) return undefined;
      return { row: latest, tree };
    }

    function ensureExpanded(tree) {
      if (!tree) return;
      const root = tree.nodes[tree.rootId];
      if (!root) return;
      expandedNodes.add(tree.rootId);
      root.childIds.slice(0, 6).forEach((childId) => {
        const child = tree.nodes[childId];
        if (child?.kind === 'dir') {
          expandedNodes.add(childId);
        }
      });
    }

    function renderTreeMeta(treeSnapshot) {
      const meta = document.getElementById('tree-meta');
      if (!treeSnapshot) {
        meta.innerHTML = 'No tree data found for the selected range.';
        return;
      }

      meta.innerHTML = [
        'Showing the latest snapshot in the active range: ' + escapeHtml(treeSnapshot.row.label),
        'Commit ' + escapeHtml(treeSnapshot.row.commit + (treeSnapshot.row.dirty ? '*' : '')) + ' · ' +
          escapeHtml(treeSnapshot.tree.rootId) + ' root · ' +
          treeSnapshot.row.tree.nodeCount.toLocaleString('en-US') + ' nodes',
      ].map((line) => '<div>' + line + '</div>').join('');
    }

    function renderTreeNode(tree, nodeId, depth) {
      const node = tree.nodes[nodeId];
      if (!node) return '';

      const escapedNodeId = escapeHtml(nodeId);
      const isDir = node.kind === 'dir';
      const isExpanded = expandedNodes.has(nodeId);
      const isSelected = activeNodeId === nodeId;
      const issueText = node.issues.total > 0 ? compactNumber(node.issues.total) + ' issues' : 'clean';
      const statText = isDir
        ? compactNumber(node.stats.files) + ' files'
        : compactNumber(node.stats.lines) + ' lines';
      const children = isDir && isExpanded
        ? '<div class="tree-node-children">' + node.childIds.map((childId) => renderTreeNode(tree, childId, depth + 1)).join('') + '</div>'
        : '';

      return \`
        <div class="tree-node" data-node="\${escapedNodeId}">
          <div class="tree-line" style="--depth: \${depth}">
            \${isDir
              ? '<button type="button" class="tree-toggle" data-toggle="' + escapedNodeId + '">' + (isExpanded ? '&#9662;' : '&#9656;') + '</button>'
              : '<span class="tree-spacer"></span>'}
            <button type="button" class="tree-row tree-select \${isSelected ? 'selected' : ''}" data-select-node="\${escapedNodeId}">
              <span class="tree-label">
                <span class="tree-icon">\${isDir ? '&#128193;' : '&#128196;'}</span>
                <span>
                  <span class="tree-name">\${escapeHtml(node.name || node.path)}</span>
                  <div class="tree-path">\${escapeHtml(node.path)}</div>
                </span>
              </span>
              <span class="tree-badges">
                <span class="tree-badge \${node.issues.total > 0 ? 'issues' : ''}">\${escapeHtml(issueText)}</span>
                <span class="tree-badge">\${escapeHtml(statText)}</span>
              </span>
            </button>
          </div>
          \${children}
        </div>
      \`;
    }

    function renderTreeDetail(treeSnapshot) {
      const detail = document.getElementById('tree-detail');
      if (!treeSnapshot) {
        detail.innerHTML = '<article class="mini-card">No tree data available yet for the selected range.</article>';
        return;
      }

      const tree = treeSnapshot.tree;
      const node = tree.nodes[activeNodeId] ?? tree.nodes[tree.rootId];
      if (!node) {
        detail.innerHTML = '<article class="mini-card">Tree root is missing.</article>';
        return;
      }

      detail.innerHTML = \`
        <div>
          <div class="eyebrow">\${node.kind === 'dir' ? 'Folder' : 'File'}</div>
          <h3>\${escapeHtml(node.name || node.path)}</h3>
          <div class="tree-path">\${escapeHtml(node.path)}</div>
        </div>
        <div class="tree-detail-grid">
          <article class="tree-detail-stat">
            <div class="eyebrow">Files</div>
            <strong>\${formatNumber(node.stats.files)}</strong>
          </article>
          <article class="tree-detail-stat">
            <div class="eyebrow">Lines</div>
            <strong>\${formatNumber(node.stats.lines)}</strong>
          </article>
          <article class="tree-detail-stat">
            <div class="eyebrow">Code</div>
            <strong>\${formatNumber(node.stats.code)}</strong>
          </article>
          <article class="tree-detail-stat">
            <div class="eyebrow">Complexity</div>
            <strong>\${formatNumber(node.stats.complexity)}</strong>
          </article>
        </div>
        <div>
          <h4>Issue Rollup</h4>
          <div class="tree-detail-list">
            <div>Total: \${formatNumber(node.issues.total)}</div>
            <div>Unused: \${formatNumber(node.issues.unused)}</div>
            <div>Duplication: \${formatNumber(node.issues.duplication)}</div>
            <div>Cycles: \${formatNumber(node.issues.cycles)}</div>
            <div>Children: \${formatNumber(node.childIds.length)}</div>
          </div>
        </div>
        \${node.kind === 'file' && node.dependency ? \`
          <div>
            <h4>Dependency Instability</h4>
            <div class="tree-detail-list">
              <div>Dependencies: \${formatNumber(node.dependency.dependencies)}</div>
              <div>Dependents: \${formatNumber(node.dependency.dependents)}</div>
              <div>Instability: \${formatInstability(node.dependency.instability)}</div>
              <div>In cycle: \${node.dependency.inCycle ? 'Yes' : 'No'}</div>
            </div>
          </div>
        \` : ''}
      \`;
    }

    function renderTree(rows) {
      const treeRoot = document.getElementById('tree-root');
      const treeSnapshot = getTreeSnapshot(rows);
      renderTreeMeta(treeSnapshot);

      if (!treeSnapshot) {
        activeTreeSnapshotId = null;
        activeNodeId = null;
        treeRoot.innerHTML = '<article class="mini-card">No tree data found for the latest snapshot in this range.</article>';
        renderTreeDetail(undefined);
        return;
      }

      const tree = treeSnapshot.tree;
      if (activeTreeSnapshotId !== treeSnapshot.row.id) {
        activeTreeSnapshotId = treeSnapshot.row.id;
        activeNodeId = tree.rootId;
      }

      ensureExpanded(tree);
      treeRoot.innerHTML = renderTreeNode(tree, tree.rootId, 0);
      renderTreeDetail(treeSnapshot);
    }

    function renderTable(rows) {
      const body = document.getElementById('history-body');
      body.innerHTML = rows.slice().reverse().map((row) => \`
        <tr>
          <td>\${escapeHtml(row.label)}</td>
          <td>\${escapeHtml(row.commit + (row.dirty ? '*' : ''))}</td>
          <td>
            <span class="status-pill">
              <span class="status-dot"></span>
              \${row.status.pass}p / \${row.status.warn}w / \${row.status.fail}f / \${row.status.skip}s
            </span>
          </td>
          <td>\${formatNumber(row.metrics?.lines)}</td>
          <td>\${formatNumber(row.metrics?.complexity)}</td>
          <td>\${formatNumber(row.metrics?.unused)}</td>
          <td>\${formatPercent(row.metrics?.duplication)}</td>
          <td>\${formatNumber(row.metrics?.cycles)}</td>
        </tr>
      \`).join('');
    }

    function setActiveButton(rangeId) {
      document.querySelectorAll('#range-controls button').forEach((button) => {
        button.classList.toggle('active', button.dataset.range === rangeId);
      });
    }

    function render(rangeId) {
      activeRange = rangeId;
      const rows = getRowsForRange(rangeId);
      setActiveButton(rangeId);
      renderHero(rows);
      renderSummaryCards(rows);
      renderCharts(rows);
      renderInstability(rows);
      renderTree(rows);
      renderTable(rows);
    }

    const rangeControls = document.getElementById('range-controls');
    rangeControls.innerHTML = dashboard.controls.map((control) => \`
      <button type="button" data-range="\${control.id}" class="\${control.id === activeRange ? 'active' : ''}">
        \${control.label}
      </button>
    \`).join('');

    rangeControls.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-range]');
      if (!button) return;
      render(button.dataset.range);
    });

    document.getElementById('toggle-table').addEventListener('click', () => {
      const panel = document.getElementById('table-panel');
      const hidden = panel.classList.toggle('hidden');
      document.getElementById('toggle-table').textContent = hidden ? 'Show Table' : 'Hide Table';
    });

    document.getElementById('tree-root').addEventListener('click', (event) => {
      const toggle = event.target.closest('[data-toggle]');
      if (toggle) {
        const nodeId = toggle.dataset.toggle;
        if (expandedNodes.has(nodeId)) expandedNodes.delete(nodeId);
        else expandedNodes.add(nodeId);
        render(activeRange);
        return;
      }

      const button = event.target.closest('[data-select-node]');
      if (!button) return;
      activeNodeId = button.dataset.selectNode;
      const rows = getRowsForRange(activeRange);
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
