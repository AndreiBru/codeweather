import { readFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { buildDashboardRows, dashboardMetrics } from './charts.js'
import { getSnapshotRange } from '../history/summary.js'
import type { SnapshotSummary } from '../history/types.js'

const require = createRequire(import.meta.url)

export function renderDashboardHtml(
  cwd: string,
  snapshots: SnapshotSummary[],
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

    const formatNumber = (value) => value == null ? '—' : Number(value).toLocaleString('en-US');
    const formatPercent = (value) => value == null ? '—' : Number(value).toFixed(1) + '%';
    const formatMetric = (metric, value) => metric.kind === 'percent' ? formatPercent(value) : formatNumber(value);
    const escapeHtml = (value) => value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

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
