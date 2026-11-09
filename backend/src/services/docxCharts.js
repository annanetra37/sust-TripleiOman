'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// docxCharts.js
// Generates PNG chart buffers for embedding into Word documents.  Charts are
// authored as SVG strings (fast, dependency-free) and rasterised via `sharp`
// so they can be dropped into docx `ImageRun`s.
//
// Visual style mirrors pdfCharts.js (donut, horizontal bars, KPI cards,
// year-over-year comparison, progress bar) so the Word export is consistent
// with the PDF version.
// ─────────────────────────────────────────────────────────────────────────────

const SCOPE_COLORS = {
  'Scope 1': '#ef4444',
  'Scope 2': '#f59e0b',
  'Scope 3': '#3b82f6',
};

const PALETTE = ['#10b981', '#06b6d4', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#64748b', '#14b8a6'];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// XML-escape user-supplied text so we don't break the SVG.
const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

// Truncate long labels so they fit inside the bar rows.
const truncate = (s, n) => {
  const str = String(s || '');
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
};

// Try to load sharp lazily.  If it's unavailable (e.g. in a dev env where
// native deps aren't installed), we gracefully skip the rasterisation and
// the caller will simply not embed the chart.
function getSharp() {
  try {
    return require('sharp');
  } catch (e) {
    return null;
  }
}

// Bundled fonts for deterministic text rendering.  Production containers
// often ship without any system fonts, in which case librsvg (sharp's SVG
// engine) renders every glyph as a tofu box (□).  @resvg/resvg-js accepts
// font FILES directly, so we bundle DejaVu Sans and never depend on the
// host's fontconfig.
const path = require('path');
function getResvg() {
  try {
    return require('@resvg/resvg-js').Resvg;
  } catch (e) {
    return null;
  }
}
function fontFiles() {
  try {
    const dir = path.dirname(require.resolve('dejavu-fonts-ttf/package.json'));
    return [
      path.join(dir, 'ttf', 'DejaVuSans.ttf'),
      path.join(dir, 'ttf', 'DejaVuSans-Bold.ttf'),
      path.join(dir, 'ttf', 'DejaVuSans-Oblique.ttf'),
    ];
  } catch (e) {
    return [];
  }
}

// Convert an SVG string to a PNG buffer + dimensions, or null on failure.
// Prefers resvg (bundled fonts, no system dependency); falls back to sharp.
async function svgToPng(svg, width, height) {
  const Resvg = getResvg();
  if (Resvg) {
    try {
      const files = fontFiles();
      const resvg = new Resvg(svg, {
        fitTo: { mode: 'width', value: width * 2 }, // 2x for crisp print rendering
        font: {
          fontFiles: files,
          loadSystemFonts: files.length === 0, // system fonts only as a last resort
          defaultFontFamily: 'DejaVu Sans',
        },
      });
      return { buffer: resvg.render().asPng(), width, height };
    } catch (e) {
      console.warn('[docxCharts] resvg svg→png failed, falling back to sharp:', e.message);
    }
  }
  const sharp = getSharp();
  if (!sharp) return null;
  try {
    const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
    return { buffer, width, height };
  } catch (e) {
    console.warn('[docxCharts] svg→png failed:', e.message);
    return null;
  }
}

// ─── Donut chart ─────────────────────────────────────────────────────────────
// data: [{ label, value }]
async function donutChartBuffer({ data, title, colorMap }) {
  const clean = (data || []).filter((d) => d && d.value > 0);
  const total = clean.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return null;

  const W = 640;
  const H = 260;
  const cx = 130;
  const cy = 140;
  const radius = 70;
  const innerR = radius * 0.55;

  const slices = [];
  let start = -Math.PI / 2;
  clean.forEach((d, i) => {
    const frac = d.value / total;
    const end = start + frac * 2 * Math.PI * 0.99999;
    const color = (colorMap && colorMap[d.label]) || PALETTE[i % PALETTE.length];

    const x1 = cx + radius * Math.cos(start);
    const y1 = cy + radius * Math.sin(start);
    const x2 = cx + radius * Math.cos(end);
    const y2 = cy + radius * Math.sin(end);
    const large = frac > 0.5 ? 1 : 0;
    slices.push(
      `<path d="M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${color}" />`,
    );
    start = end;
  });

  const legendX = cx + radius + 30;
  const legendItems = clean
    .map((d, i) => {
      const color = (colorMap && colorMap[d.label]) || PALETTE[i % PALETTE.length];
      const pct = ((d.value / total) * 100).toFixed(1);
      const y = 58 + i * 22;
      return `
        <rect x="${legendX}" y="${y}" width="12" height="12" fill="${color}" />
        <text x="${legendX + 18}" y="${y + 10}" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" fill="#333">${esc(d.label)}: ${round2(d.value)} (${pct}%)</text>
      `;
    })
    .join('');

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <rect width="${W}" height="${H}" fill="#ffffff" />
      ${title ? `<text x="20" y="28" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="bold" fill="#003700">${esc(title)}</text>` : ''}
      ${slices.join('')}
      <circle cx="${cx}" cy="${cy}" r="${innerR}" fill="#ffffff" />
      <text x="${cx}" y="${cy - 2}" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="bold" fill="#003700">${round2(total)}</text>
      <text x="${cx}" y="${cy + 14}" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="10" fill="#64748b">total</text>
      ${legendItems}
    </svg>
  `.trim();

  return svgToPng(svg, W, H);
}

// ─── Horizontal bar chart ────────────────────────────────────────────────────
// data: [{ label, value }]
async function hBarChartBuffer({ data, title, unit, color, maxBars }) {
  const filtered = (data || [])
    .filter((d) => d && (d.value || 0) > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, maxBars || 6);
  if (filtered.length === 0) return null;

  const max = Math.max(...filtered.map((d) => d.value));
  const W = 640;
  const rowH = 26;
  const top = title ? 44 : 18;
  const bottom = 16;
  const H = top + filtered.length * rowH + bottom;

  const labelW = 180;
  const valueW = 110;
  const barAreaX = 20 + labelW;
  const barAreaW = W - barAreaX - valueW - 10;

  const rows = filtered
    .map((d, i) => {
      const barW = max > 0 ? (d.value / max) * barAreaW : 0;
      const c = color || PALETTE[i % PALETTE.length];
      const y = top + i * rowH;
      const label = esc(truncate(d.label || '—', 28));
      const valueText = `${round2(d.value)}${unit ? ' ' + unit : ''}`;
      return `
        <text x="20" y="${y + 14}" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" fill="#333">${label}</text>
        <rect x="${barAreaX}" y="${y + 4}" width="${barAreaW}" height="16" fill="#f1f5f9" />
        ${barW > 0 ? `<rect x="${barAreaX}" y="${y + 4}" width="${barW.toFixed(2)}" height="16" fill="${c}" />` : ''}
        <text x="${barAreaX + barAreaW + 6}" y="${y + 16}" font-family="DejaVu Sans, Arial, sans-serif" font-size="11" fill="#333">${esc(valueText)}</text>
      `;
    })
    .join('');

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <rect width="${W}" height="${H}" fill="#ffffff" />
      ${title ? `<text x="20" y="28" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="bold" fill="#003700">${esc(title)}</text>` : ''}
      ${rows}
    </svg>
  `.trim();

  return svgToPng(svg, W, H);
}

// ─── KPI cards in a row ──────────────────────────────────────────────────────
// kpis: [{ label, value, unit, color }]
async function kpiRowBuffer({ kpis }) {
  const list = (kpis || []).filter(Boolean);
  if (list.length === 0) return null;

  const W = 640;
  const H = 100;
  const pad = 16;
  const gap = 12;
  const cardW = (W - pad * 2 - gap * (list.length - 1)) / list.length;
  const cardH = H - pad * 2;

  const cards = list
    .map((k, i) => {
      const x = pad + i * (cardW + gap);
      const y = pad;
      const color = k.color || '#003700';
      return `
        <rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" fill="#f8fafc" />
        <rect x="${x}" y="${y}" width="5" height="${cardH}" fill="${color}" />
        <text x="${x + 14}" y="${y + 18}" font-family="DejaVu Sans, Arial, sans-serif" font-size="11" fill="#64748b">${esc(truncate(k.label, 28))}</text>
        <text x="${x + 14}" y="${y + 42}" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="bold" fill="#003700">${esc(truncate(String(k.value), 16))}</text>
        ${k.unit ? `<text x="${x + 14}" y="${y + 60}" font-family="DejaVu Sans, Arial, sans-serif" font-size="10" fill="#64748b">${esc(truncate(k.unit, 30))}</text>` : ''}
      `;
    })
    .join('');

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <rect width="${W}" height="${H}" fill="#ffffff" />
      ${cards}
    </svg>
  `.trim();

  return svgToPng(svg, W, H);
}

// ─── Year-over-Year two-bar comparison ───────────────────────────────────────
async function yoyBarsBuffer({ prevLabel, currLabel, prevValue, currValue, title, unit }) {
  const pv = Number(prevValue) || 0;
  const cv = Number(currValue) || 0;
  const max = Math.max(pv, cv, 1);

  const W = 640;
  const H = 240;
  const chartTop = title ? 48 : 24;
  const chartBottom = H - 48;
  const chartH = chartBottom - chartTop;
  const barW = 90;
  const gap = 70;
  const axisX = 120;
  const prevX = axisX + 40;
  const currX = prevX + barW + gap;

  const prevH = (pv / max) * chartH;
  const currH = (cv / max) * chartH;
  const currColor = cv > pv ? '#ef4444' : '#10b981';

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <rect width="${W}" height="${H}" fill="#ffffff" />
      ${title ? `<text x="20" y="28" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="bold" fill="#003700">${esc(title)}</text>` : ''}
      <line x1="${axisX}" y1="${chartBottom}" x2="${axisX + 380}" y2="${chartBottom}" stroke="#cbd5e1" stroke-width="1" />
      <rect x="${prevX}" y="${chartBottom - prevH}" width="${barW}" height="${prevH}" fill="#94a3b8" />
      <rect x="${currX}" y="${chartBottom - currH}" width="${barW}" height="${currH}" fill="${currColor}" />
      <text x="${prevX + barW / 2}" y="${chartBottom - prevH - 6}" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" font-weight="bold" fill="#333">${round2(pv)}</text>
      <text x="${currX + barW / 2}" y="${chartBottom - currH - 6}" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" font-weight="bold" fill="#333">${round2(cv)}</text>
      <text x="${prevX + barW / 2}" y="${chartBottom + 16}" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="11" fill="#64748b">${esc(prevLabel)}</text>
      <text x="${currX + barW / 2}" y="${chartBottom + 16}" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="11" fill="#64748b">${esc(currLabel)}</text>
      ${unit ? `<text x="${axisX}" y="${chartBottom + 34}" font-family="DejaVu Sans, Arial, sans-serif" font-size="10" fill="#888">${esc(unit)}</text>` : ''}
    </svg>
  `.trim();

  return svgToPng(svg, W, H);
}

// ─── Progress bar (0-100%) ───────────────────────────────────────────────────
async function progressBarBuffer({ label, percent, title, color }) {
  const W = 640;
  const H = 90;
  const pct = Math.max(0, Math.min(100, Number(percent) || 0));
  const fillColor = color || '#10b981';
  const barW = W - 40;
  const barX = 20;
  const barY = title ? 40 : 22;
  const barH = 16;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <rect width="${W}" height="${H}" fill="#ffffff" />
      ${title ? `<text x="20" y="24" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="bold" fill="#003700">${esc(title)}</text>` : ''}
      <rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" fill="#e2e8f0" />
      ${pct > 0 ? `<rect x="${barX}" y="${barY}" width="${((pct / 100) * barW).toFixed(2)}" height="${barH}" fill="${fillColor}" />` : ''}
      <text x="${barX}" y="${barY + barH + 18}" font-family="DejaVu Sans, Arial, sans-serif" font-size="11" fill="#333">${esc(label || '')}</text>
      <text x="${barX + barW}" y="${barY + barH + 18}" text-anchor="end" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" font-weight="bold" fill="${fillColor}">${pct.toFixed(1)}%</text>
    </svg>
  `.trim();

  return svgToPng(svg, W, H);
}

module.exports = {
  SCOPE_COLORS,
  PALETTE,
  donutChartBuffer,
  hBarChartBuffer,
  kpiRowBuffer,
  yoyBarsBuffer,
  progressBarBuffer,
};
