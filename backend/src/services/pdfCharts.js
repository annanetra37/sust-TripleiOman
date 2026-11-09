'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// pdfCharts.js
// Lightweight chart primitives that render directly into a PDFKit document
// using vector paths — no external dependencies, no headless browser.
// Used by reportsV2.js to embed KPI / metric visuals next to the narrative
// paragraphs (e.g. emission-scope disclosures).
// ─────────────────────────────────────────────────────────────────────────────

const SCOPE_COLORS = {
  'Scope 1': '#ef4444',
  'Scope 2': '#f59e0b',
  'Scope 3': '#3b82f6',
};

const PALETTE = ['#10b981', '#06b6d4', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#64748b', '#14b8a6'];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function ensureSpace(doc, needed) {
  const bottomLimit = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottomLimit) {
    doc.addPage();
  }
}

function resetFlow(doc, startY, blockHeight) {
  doc.x = doc.page.margins.left;
  doc.y = startY + blockHeight;
  doc.fillColor('#333').font('Helvetica');
}

// ─── Donut chart with legend ─────────────────────────────────────────────────
// data: [{ label, value }]
function drawDonutChart(doc, { data, title, colorMap }) {
  const clean = (data || []).filter((d) => (d && d.value > 0));
  const total = clean.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return;

  const radius = 52;
  const blockHeight = 24 + radius * 2 + 12;
  ensureSpace(doc, blockHeight);
  const startY = doc.y;
  const x = doc.page.margins.left + 10;

  if (title) {
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#003700')
       .text(title, x, startY, { lineBreak: false });
  }

  const cx = x + radius + 8;
  const cy = startY + 22 + radius;

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

    doc.save();
    doc.path(`M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`)
       .fillColor(color).fill();
    doc.restore();

    start = end;
  });

  // Donut hole
  doc.save();
  doc.circle(cx, cy, radius * 0.55).fillColor('#ffffff').fill();
  doc.restore();

  // Center label
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#003700')
     .text(`${round2(total)}`, cx - 35, cy - 8, { width: 70, align: 'center', lineBreak: false });
  doc.fontSize(7).font('Helvetica').fillColor('#64748b')
     .text('total', cx - 35, cy + 4, { width: 70, align: 'center', lineBreak: false });

  // Legend
  const legendX = x + radius * 2 + 30;
  let ly = startY + 26;
  clean.forEach((d, i) => {
    const color = (colorMap && colorMap[d.label]) || PALETTE[i % PALETTE.length];
    doc.save();
    doc.rect(legendX, ly + 1, 9, 9).fillColor(color).fill();
    doc.restore();
    const pct = ((d.value / total) * 100).toFixed(1);
    doc.fillColor('#333').fontSize(9).font('Helvetica')
       .text(`${d.label}: ${round2(d.value)} (${pct}%)`, legendX + 14, ly, { width: 280, lineBreak: false });
    ly += 14;
  });

  resetFlow(doc, startY, blockHeight);
}

// ─── Horizontal bar chart ────────────────────────────────────────────────────
// data: [{ label, value }]
function drawHBarChart(doc, { data, title, unit, color, maxBars, width }) {
  const filtered = (data || [])
    .filter((d) => d && (d.value || 0) > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, maxBars || 6);
  if (filtered.length === 0) return;

  const max = Math.max(...filtered.map((d) => d.value));
  const rowH = 16;
  const blockHeight = 24 + filtered.length * rowH + 10;
  ensureSpace(doc, blockHeight);

  const startY = doc.y;
  const x = doc.page.margins.left + 10;
  const totalW = width || 480;
  const labelW = 140;
  const valueW = 90;
  const barAreaX = x + labelW;
  const barAreaW = totalW - labelW - valueW;

  if (title) {
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#003700')
       .text(title, x, startY, { lineBreak: false });
  }

  let cy = startY + 22;
  filtered.forEach((d, i) => {
    const barW = max > 0 ? (d.value / max) * barAreaW : 0;
    const c = color || PALETTE[i % PALETTE.length];
    const rawLabel = d.label || '—';
    const label = rawLabel.length > 24 ? rawLabel.slice(0, 23) + '…' : rawLabel;

    doc.fontSize(8).font('Helvetica').fillColor('#333')
       .text(label, x, cy + 1, { width: labelW - 5, lineBreak: false, ellipsis: true });

    doc.save();
    doc.rect(barAreaX, cy, barAreaW, 10).fillColor('#f1f5f9').fill();
    if (barW > 0) doc.rect(barAreaX, cy, barW, 10).fillColor(c).fill();
    doc.restore();

    doc.fontSize(8).font('Helvetica').fillColor('#333')
       .text(`${round2(d.value)}${unit ? ' ' + unit : ''}`, barAreaX + barAreaW + 6, cy + 1,
             { width: valueW - 6, lineBreak: false });
    cy += rowH;
  });

  resetFlow(doc, startY, blockHeight);
}

// ─── KPI cards in a row ──────────────────────────────────────────────────────
// kpis: [{ label, value, unit, color }]
function drawKpiRow(doc, { kpis, width }) {
  const list = (kpis || []).filter(Boolean);
  if (list.length === 0) return;

  const totalW = width || 490;
  const gap = 10;
  const cardW = (totalW - gap * (list.length - 1)) / list.length;
  const cardH = 54;
  const blockHeight = cardH + 10;
  ensureSpace(doc, blockHeight);

  const startY = doc.y;
  const startX = doc.page.margins.left;

  list.forEach((k, i) => {
    const cx = startX + i * (cardW + gap);
    const color = k.color || '#003700';

    doc.save();
    doc.rect(cx, startY, cardW, cardH).fillColor('#f8fafc').fill();
    doc.rect(cx, startY, 4, cardH).fillColor(color).fill();
    doc.restore();

    doc.fontSize(8).font('Helvetica').fillColor('#64748b')
       .text(k.label, cx + 10, startY + 8, { width: cardW - 15, lineBreak: false, ellipsis: true });
    doc.fontSize(15).font('Helvetica-Bold').fillColor('#003700')
       .text(`${k.value}`, cx + 10, startY + 22, { width: cardW - 15, lineBreak: false, ellipsis: true });
    if (k.unit) {
      doc.fontSize(8).font('Helvetica').fillColor('#64748b')
         .text(k.unit, cx + 10, startY + 40, { width: cardW - 15, lineBreak: false, ellipsis: true });
    }
  });

  resetFlow(doc, startY, blockHeight);
}

// ─── Year-over-Year two-bar comparison ───────────────────────────────────────
function drawYoYBars(doc, { prevLabel, currLabel, prevValue, currValue, title, unit }) {
  const pv = Number(prevValue) || 0;
  const cv = Number(currValue) || 0;
  const max = Math.max(pv, cv, 1);
  const blockHeight = 115;
  ensureSpace(doc, blockHeight);

  const startY = doc.y;
  const x = doc.page.margins.left + 10;

  if (title) {
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#003700')
       .text(title, x, startY, { lineBreak: false });
  }

  const chartTop = startY + 22;
  const chartBottom = startY + 88;
  const chartH = chartBottom - chartTop;
  const barW = 55;
  const gap = 30;
  const axisX = x + 30;
  const prevX = axisX + 30;
  const currX = prevX + barW + gap;

  // Baseline
  doc.save();
  doc.strokeColor('#cbd5e1').lineWidth(0.5)
     .moveTo(axisX, chartBottom).lineTo(axisX + 220, chartBottom).stroke();
  doc.restore();

  const prevH = (pv / max) * chartH;
  const currH = (cv / max) * chartH;

  doc.save();
  doc.rect(prevX, chartBottom - prevH, barW, prevH).fillColor('#94a3b8').fill();
  const currColor = cv > pv ? '#ef4444' : '#10b981';
  doc.rect(currX, chartBottom - currH, barW, currH).fillColor(currColor).fill();
  doc.restore();

  doc.fontSize(8).font('Helvetica-Bold').fillColor('#333')
     .text(`${round2(pv)}`, prevX, chartBottom - prevH - 11, { width: barW, align: 'center', lineBreak: false })
     .text(`${round2(cv)}`, currX, chartBottom - currH - 11, { width: barW, align: 'center', lineBreak: false });

  doc.fontSize(8).font('Helvetica').fillColor('#64748b')
     .text(prevLabel, prevX, chartBottom + 3, { width: barW, align: 'center', lineBreak: false })
     .text(currLabel, currX, chartBottom + 3, { width: barW, align: 'center', lineBreak: false });

  if (unit) {
    doc.fontSize(7).fillColor('#888')
       .text(unit, axisX, chartBottom + 16, { width: 240, lineBreak: false });
  }

  resetFlow(doc, startY, blockHeight);
}

// ─── Progress bar (0-100%) for targets, coverage, gauges ─────────────────────
function drawProgressBar(doc, { label, percent, title, color }) {
  const blockHeight = 48;
  ensureSpace(doc, blockHeight);
  const startY = doc.y;
  const x = doc.page.margins.left + 10;
  const barW = 470;

  if (title) {
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#003700')
       .text(title, x, startY, { lineBreak: false });
  }

  const pct = Math.max(0, Math.min(100, Number(percent) || 0));
  const fillColor = color || '#10b981';
  const barY = startY + 22;

  doc.save();
  doc.rect(x, barY, barW, 12).fillColor('#e2e8f0').fill();
  if (pct > 0) doc.rect(x, barY, (pct / 100) * barW, 12).fillColor(fillColor).fill();
  doc.restore();

  doc.fontSize(8).font('Helvetica').fillColor('#333')
     .text(`${label || ''}`, x, barY + 17, { width: barW - 60, lineBreak: false });
  doc.fontSize(9).font('Helvetica-Bold').fillColor(fillColor)
     .text(`${pct.toFixed(1)}%`, x + barW - 55, barY + 16, { width: 55, align: 'right', lineBreak: false });

  resetFlow(doc, startY, blockHeight);
}

module.exports = {
  SCOPE_COLORS,
  PALETTE,
  drawDonutChart,
  drawHBarChart,
  drawKpiRow,
  drawYoYBars,
  drawProgressBar,
};
