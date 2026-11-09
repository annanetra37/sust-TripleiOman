const router = require('express').Router();
const PDFDocument = require('pdfkit');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  ImageRun,
} = require('docx');
const path = require('path');
const fs = require('fs');
const prisma = require('../config/prisma');
const { authenticate } = require('../middleware/auth');
const { formatError } = require('../utils/errors');
const { logActivity } = require('../utils/activityLog');
const { STANDARDS, validateReportData } = require('../services/standardRegistry');
const pdfCharts = require('../services/pdfCharts');
const docxCharts = require('../services/docxCharts');
const estimator = require('../utils/estimator');
const { deductCredits } = require('../middleware/credits');
const { logCost } = require('../utils/costTracker');
const { attachTier } = require('../middleware/tier');
const tierFeatures = require('../services/tierFeatures');

router.use(authenticate, attachTier);

// Year-over-year sentence with a sanity guard: a percentage against a
// near-zero baseline (e.g. 0.04 → 461 tCO2e = "+1,213,194%") is
// meaningless and reads as a bug. Above ±500% we report the absolute
// change and flag the baseline instead.
function yoyTrendSentence(prev, curr, pct, prevYear, currYear, round) {
  const direction = pct > 0 ? 'increased' : 'decreased';
  if (Math.abs(pct) <= 500) {
    return `Total GHG emissions ${direction} by ${Math.abs(round(pct))}% compared to the previous year (${prevYear}: ${round(prev)} tCO2e vs ${currYear}: ${round(curr)} tCO2e).`;
  }
  return `Total GHG emissions rose from ${round(prev)} tCO2e (${prevYear}) to ${round(curr)} tCO2e (${currYear}). ` +
    `A percentage comparison is not meaningful because the ${prevYear} baseline is near zero — ` +
    `verify whether ${prevYear} data collection was complete before treating this as a real increase.`;
}

// ─── List available standards ───────────────────────────────
// Every tier sees the full list — standards the user isn't entitled to are
// returned with `locked: true` + `requiredTier` so the UI can render a lock
// icon and an upgrade prompt.  Generation of locked standards is refused
// server-side below.
router.get('/standards', (req, res) => {
  const allowed = new Set(tierFeatures.allowedStandardsFor(req.tier));
  const list = Object.entries(STANDARDS).map(([key, s]) => ({
    key, name: s.name, framework: s.framework, version: s.version,
    locked: !allowed.has(key),
    requiredTier: allowed.has(key) ? null : (tierFeatures.STANDARD_TIER[key] || 'PROFESSIONAL'),
    topics: Object.entries(s.topics).map(([tk, t]) => ({ key: tk, code: t.code, name: t.name, pillar: t.pillar })),
  }));
  res.json(list);
});

// ─── Validate data for report ───────────────────────────────

router.post('/validate', async (req, res) => {
  try {
    const { year, standard, topics } = req.body;
    if (!year || !standard) return res.status(400).json({ error: 'Year and standard are required.' });

    const result = await validateReportData(prisma, req.user.companyId, parseInt(year), standard, topics);
    res.json(result);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Estimate credit cost for a report ──────────────────────
// Scales with the number of topics selected and the data availability that
// comes back from validateReportData().  The response is what the frontend
// shows to the user before they confirm generation.
router.post('/estimate', async (req, res) => {
  try {
    const { year, standard, topics } = req.body;
    if (!year || !standard) return res.status(400).json({ error: 'Year and standard are required.' });

    const std = STANDARDS[standard];
    if (!std) return res.status(400).json({ error: `Unknown standard: ${standard}` });
    const selectedTopics = topics && topics.length ? topics : Object.keys(std.topics);

    const validation = await validateReportData(prisma, req.user.companyId, parseInt(year), standard, selectedTopics);
    const estimate = estimator.estimateReport({ validation });

    const company = await prisma.company.findUnique({
      where: { id: req.user.companyId },
      select: { creditBalance: true },
    });
    const balance = company?.creditBalance ?? 0;

    // Strip internal pricing fields (USD, model, heuristic flags) before
    // returning — the client should only ever see credits and scaling info.
    const SAFE_KEYS = new Set([
      'fileCount', 'rowCount', 'sheetCount', 'batches',
      'topicCount', 'topicsWithData', 'disclosuresWithData', 'disclosuresMissing',
      'narrativeCount',
    ]);
    const safeBreakdown = {};
    for (const [k, v] of Object.entries(estimate.breakdown || {})) {
      if (SAFE_KEYS.has(k)) safeBreakdown[k] = v;
    }

    res.json({
      credits: estimate.credits,
      breakdown: safeBreakdown,
      balance,
      sufficient: balance >= estimate.credits,
      remainingAfter: Math.max(0, balance - estimate.credits),
    });
  } catch (err) {
    console.error('Report estimate error:', err);
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── DOCX builder ──────────────────────────────────────────
// Produces a Word document that mirrors the textual content of the PDF
// report.  Charts are not embedded — the docx version is optimised for
// easy editing rather than print-ready visual fidelity.
async function buildReportDocx({
  company,
  companyDescription,
  std,
  standard,
  y,
  selectedTopics,
  validation,
  orgUnits,
  data,
  generateWithoutMissing,
  logoFilePath,
  sectorKpiData,
  pcfProducts,
  approvedDrafts = {},
}) {
  const round = (n) => Math.round(n * 10000) / 10000;

  const BRAND = '003700';
  const children = [];

  const heading = (text, level = HeadingLevel.HEADING_1) =>
    new Paragraph({
      heading: level,
      children: [new TextRun({ text, bold: true, color: BRAND })],
    });
  const text = (t, opts = {}) =>
    new Paragraph({ children: [new TextRun({ text: t, ...opts })] });
  const bullet = (t) =>
    new Paragraph({ children: [new TextRun({ text: t })], bullet: { level: 0 } });
  const spacer = () => new Paragraph({ children: [new TextRun({ text: '' })] });
  const centered = (t, opts = {}) =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: t, ...opts })],
    });

  // Embed a rasterised chart into the document.  The chart buffer comes
  // from docxCharts (SVG → PNG via sharp).  Returns silently if rendering
  // failed (e.g. `sharp` unavailable) so the document still generates.
  // Width is scaled to ~480px, which fits inside A4 margins in Word.
  const addChart = (chart) => {
    if (!chart || !chart.buffer) return;
    const targetW = 480;
    const scale = targetW / chart.width;
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            data: chart.buffer,
            transformation: {
              width: targetW,
              height: Math.round(chart.height * scale),
            },
          }),
        ],
      }),
    );
  };

  // ═══════════════ COVER PAGE ═══════════════
  if (logoFilePath) {
    try {
      const imgBuf = fs.readFileSync(logoFilePath);
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              data: imgBuf,
              transformation: { width: 120, height: 120 },
            }),
          ],
        }),
      );
    } catch (e) {
      // ignore logo failures
    }
  }

  children.push(spacer());
  children.push(centered('Sustainability Management Report', { bold: true, size: 48, color: BRAND }));
  children.push(centered(`(${standard})`, { bold: true, size: 28 }));
  children.push(spacer());
  children.push(centered(company.name, { size: 32 }));
  children.push(
    centered(companyDescription || `${company.industry} | ${company.country}`, {
      size: 22,
      color: '666666',
    }),
  );
  children.push(spacer());
  children.push(centered(`Reporting Year: ${y || 'All Years'}`, { size: 26 }));
  children.push(centered('Prepared in accordance with:', { size: 20, color: '666666' }));
  children.push(centered(std.name, { bold: true, size: 24, color: BRAND }));
  children.push(centered(`${std.framework} ${std.version}`, { size: 18, color: '888888' }));
  children.push(spacer());
  children.push(
    centered(`Generated on ${new Date().toLocaleDateString()} | Confidential`, {
      size: 18,
      color: 'AAAAAA',
    }),
  );
  children.push(centered('Triple I ESG Portal — www.triplei.io', { size: 18, color: 'AAAAAA' }));

  // ═══════════════ ABOUT THIS REPORT ═══════════════
  children.push(heading('1. About This Report'));
  children.push(
    text(
      `This report has been prepared by ${company.name} in accordance with the ${std.name} (${std.framework} ${std.version}).`,
    ),
  );
  children.push(text(`Reporting period: January 1, ${y} to December 31, ${y}`));
  children.push(text(`Company: ${company.name}`));
  children.push(text(`Industry: ${company.industry}`));
  children.push(text(`Headquarters: ${company.hqLocation || company.country}`));
  children.push(text(`Company size: ${company.companySize}`));
  if (company.stockExchange) {
    children.push(text(`Stock exchange: ${company.stockExchange} (${company.tickerSymbol || ''})`));
  }

  children.push(heading('Organizational Boundaries', HeadingLevel.HEADING_2));
  children.push(text('Consolidation approach: Operational control'));
  children.push(text('Organizational units included in this report:'));
  for (const ou of orgUnits) {
    children.push(bullet(`${ou.name} — ${ou.country}`));
  }
  const countries = [...new Set(orgUnits.map((u) => u.country))].join(', ');
  children.push(
    text(
      `Operations covered: All operations under the organizational control of ${company.name} across ${orgUnits.length} organizational unit(s) in ${countries}.`,
    ),
  );

  children.push(heading('Methodology', HeadingLevel.HEADING_2));
  children.push(
    text(
      'GHG emissions have been calculated in accordance with the GHG Protocol Corporate Accounting and Reporting Standard (Revised Edition). Emission factors are sourced from recognized databases including DEFRA, EPA, and IEA. Energy consumption is reported in MWh with appropriate conversion factors applied for different fuel types and energy carriers.',
    ),
  );
  children.push(text('Scope boundaries:'));
  children.push(bullet('Scope 1: Direct emissions from owned/controlled sources (stationary combustion, mobile combustion, fugitive emissions)'));
  children.push(bullet('Scope 2: Indirect emissions from purchased electricity, steam, heating, and cooling (location-based method)'));
  children.push(bullet('Scope 3: All other indirect emissions in the value chain (business travel, employee commuting, purchased goods)'));
  children.push(
    text(
      'Energy units: All energy quantities are standardized to MWh. Conversion factors: 1 litre diesel = 0.01 MWh, 1 litre petrol = 0.0091 MWh, 1 m³ natural gas = 0.01055 MWh, 1 GJ = 0.27778 MWh.',
    ),
  );

  if (validation.missing.length > 0 && generateWithoutMissing) {
    children.push(heading('Data Coverage Notice', HeadingLevel.HEADING_2));
    children.push(
      text(
        `The following ${validation.missing.length} disclosure(s) could not be fully populated due to missing data:`,
      ),
    );
    for (const m of validation.missing) {
      children.push(bullet(`${m.code} — ${m.name}`));
    }
  }

  // ═══════════════ SECTOR KPIs + PCF SUMMARY (DOCX) ═══════════════
  let sectionNum = std.crossCutting.length > 0 ? 3 : 2;

  if (sectorKpiData && sectorKpiData.kpis && sectorKpiData.kpis.length > 0) {
    children.push(heading(`${sectionNum}. Industry-Specific Disclosures (${sectorKpiData.packName})`));
    children.push(text(`This section presents the KPIs required by the ${sectorKpiData.packName} sector pack, spanning multiple reporting frameworks applicable to the ${company.industry} sector.`));
    children.push(spacer());

    const byFramework = {};
    for (const kpi of sectorKpiData.kpis) {
      if (!byFramework[kpi.framework]) byFramework[kpi.framework] = [];
      byFramework[kpi.framework].push(kpi);
    }
    for (const [framework, kpis] of Object.entries(byFramework)) {
      children.push(heading(framework, HeadingLevel.HEADING_2));
      for (const kpi of kpis) {
        children.push(text(`${kpi.code}: ${kpi.name}`, { bold: true }));
        if (kpi.unit === 'narrative') {
          children.push(text('[Narrative disclosure — to be completed]', { italics: true, color: '888888' }));
        } else {
          children.push(text(`Unit: ${kpi.unit} | Category: ${kpi.category}`, { color: '666666', size: 18 }));
        }
      }
      children.push(spacer());
    }
    sectionNum++;
  }

  const productsWithCalcDocx = (pcfProducts || []).filter(p => p.calculations && p.calculations.length > 0);
  if (productsWithCalcDocx.length > 0) {
    children.push(heading(`${sectionNum}. Product Carbon Footprints`));
    children.push(text(`${productsWithCalcDocx.length} product(s) have calculated carbon footprints using ISO 14067 / cradle-to-gate (A1–A3) methodology with Monte Carlo uncertainty analysis.`));
    children.push(spacer());

    for (const product of productsWithCalcDocx) {
      const calc = product.calculations[0];
      children.push(text(`${product.name} (${product.sku})`, { bold: true }));
      children.push(text(`Functional unit: ${product.functionalUnit}`));
      children.push(text(`Total PCF: ${calc.totalKgCo2e} kgCO2e (p50)  |  Range: ${calc.uncertaintyLow} – ${calc.uncertaintyHigh} kgCO2e (p5–p95)`));
      children.push(text(`Primary data share: ${Math.round((calc.primaryDataPct || 0) * 100)}%  |  Status: ${calc.status}`));
      const stages = calc.breakdownByStage || {};
      if (Object.keys(stages).length > 0) {
        children.push(text('Lifecycle stage breakdown:', { bold: true }));
        for (const [stage, kg] of Object.entries(stages)) {
          const pct = calc.totalKgCo2e > 0 ? ((kg / calc.totalKgCo2e) * 100).toFixed(1) : '0';
          children.push(bullet(`${stage}: ${kg} kgCO2e (${pct}%)`));
        }
      }
      children.push(spacer());
    }
    sectionNum++;
  }

  // ═══════════════ TOPIC SECTIONS ═══════════════
  for (const topicKey of selectedTopics) {
    const topic = std.topics[topicKey];
    if (!topic) continue;

    children.push(heading(`${sectionNum}. ${topic.code} — ${topic.name}`));
    children.push(text(`Pillar: ${topic.pillar}`, { color: '999999', italics: true }));

    for (const disc of topic.disclosures) {
      children.push(heading(`${disc.code}: ${disc.name}`, HeadingLevel.HEADING_3));

      const discData = validation.topics
        .find((t) => t.key === topicKey)
        ?.disclosures.find((d) => d.code === disc.code);

      if (disc.type === 'metric' && discData?.hasData) {
        if (topicKey === 'E1' && data.E1) {
          const totalAllScopes = Object.values(data.E1.byScope).reduce((s, v) => s + v, 0);

          if (disc.code === 'GRI 305-1') {
            const s1 = round(data.E1.byScope['Scope 1'] || 0);
            const s1Pct = totalAllScopes > 0 ? (s1 / totalAllScopes) * 100 : 0;
            children.push(text(`Direct GHG Emissions (Scope 1): ${s1} tCO2e`));
            children.push(text(`Share of total (Scope 1+2+3): ${s1Pct.toFixed(1)}%`));
            children.push(
              text(
                'Scope 1 includes direct emissions from owned or controlled sources including stationary combustion, mobile combustion (company vehicles), and fugitive emissions.',
                { color: '666666', size: 18 },
              ),
            );
            const s1Cats = {};
            data.E1.activities
              .filter((a) => a.scope === 'Scope 1')
              .forEach((a) => {
                const k = a.activityCategory || 'Other';
                s1Cats[k] = (s1Cats[k] || 0) + (a.totalEmissions || 0);
              });
            addChart(
              await docxCharts.kpiRowBuffer({
                kpis: [
                  { label: 'Scope 1 Emissions', value: s1.toLocaleString(), unit: 'tCO2e', color: docxCharts.SCOPE_COLORS['Scope 1'] },
                  { label: 'Share of Total', value: `${s1Pct.toFixed(1)}%`, unit: 'of Scope 1+2+3', color: docxCharts.SCOPE_COLORS['Scope 1'] },
                  { label: 'Activity Records', value: data.E1.activities.filter((a) => a.scope === 'Scope 1').length, unit: 'data points', color: '#64748b' },
                ],
              }),
            );
            addChart(
              await docxCharts.hBarChartBuffer({
                title: 'Scope 1 Emissions by Activity Category',
                data: Object.entries(s1Cats).map(([label, value]) => ({ label, value })),
                unit: 'tCO2e',
                color: docxCharts.SCOPE_COLORS['Scope 1'],
                maxBars: 5,
              }),
            );
          } else if (disc.code === 'GRI 305-2') {
            const s2 = round(data.E1.byScope['Scope 2'] || 0);
            const s2Pct = totalAllScopes > 0 ? (s2 / totalAllScopes) * 100 : 0;
            children.push(text(`Energy Indirect GHG Emissions (Scope 2): ${s2} tCO2e`));
            children.push(text(`Share of total (Scope 1+2+3): ${s2Pct.toFixed(1)}%`));
            children.push(
              text(
                'Scope 2 covers indirect emissions from purchased electricity, steam, heating, and cooling. Location-based method applied using grid-average emission factors.',
                { color: '666666', size: 18 },
              ),
            );
            const s2Cats = {};
            data.E1.activities
              .filter((a) => a.scope === 'Scope 2')
              .forEach((a) => {
                const k = a.activitySubcat || a.activityCategory || 'Other';
                s2Cats[k] = (s2Cats[k] || 0) + (a.totalEmissions || 0);
              });
            addChart(
              await docxCharts.kpiRowBuffer({
                kpis: [
                  { label: 'Scope 2 Emissions', value: s2.toLocaleString(), unit: 'tCO2e', color: docxCharts.SCOPE_COLORS['Scope 2'] },
                  { label: 'Share of Total', value: `${s2Pct.toFixed(1)}%`, unit: 'of Scope 1+2+3', color: docxCharts.SCOPE_COLORS['Scope 2'] },
                  { label: 'Electricity', value: round(data.E1.energyByType.electricity).toLocaleString(), unit: 'MWh', color: '#0ea5e9' },
                ],
              }),
            );
            addChart(
              await docxCharts.hBarChartBuffer({
                title: 'Scope 2 Emissions by Energy Carrier',
                data: Object.entries(s2Cats).map(([label, value]) => ({ label, value })),
                unit: 'tCO2e',
                color: docxCharts.SCOPE_COLORS['Scope 2'],
                maxBars: 5,
              }),
            );
          } else if (disc.code === 'GRI 305-3') {
            const s3 = round(data.E1.byScope['Scope 3'] || 0);
            const s3Pct = totalAllScopes > 0 ? (s3 / totalAllScopes) * 100 : 0;
            children.push(text(`Other Indirect GHG Emissions (Scope 3): ${s3} tCO2e`));
            children.push(text(`Share of total (Scope 1+2+3): ${s3Pct.toFixed(1)}%`));
            const s3Cats = {};
            data.E1.activities
              .filter((a) => a.scope === 'Scope 3')
              .forEach((a) => {
                s3Cats[a.activityCategory] = (s3Cats[a.activityCategory] || 0) + (a.totalEmissions || 0);
              });
            children.push(
              text(
                'Scope 3 categories included: business travel, employee commuting, purchased goods and services where data is available.',
                { color: '666666', size: 18 },
              ),
            );
            addChart(
              await docxCharts.kpiRowBuffer({
                kpis: [
                  { label: 'Scope 3 Emissions', value: s3.toLocaleString(), unit: 'tCO2e', color: docxCharts.SCOPE_COLORS['Scope 3'] },
                  { label: 'Share of Total', value: `${s3Pct.toFixed(1)}%`, unit: 'of Scope 1+2+3', color: docxCharts.SCOPE_COLORS['Scope 3'] },
                  { label: 'Categories Reported', value: Object.keys(s3Cats).length, unit: 'GHG Protocol cats.', color: '#64748b' },
                ],
              }),
            );
            addChart(
              await docxCharts.hBarChartBuffer({
                title: 'Scope 3 Emissions by Category',
                data: Object.entries(s3Cats).map(([label, value]) => ({ label, value })),
                unit: 'tCO2e',
                color: docxCharts.SCOPE_COLORS['Scope 3'],
                maxBars: 8,
              }),
            );
          } else if (disc.code === 'GRI 305-4') {
            children.push(text(`GHG Emissions Intensity: ${round(data.E1.intensity)} tCO2e per employee`));
            children.push(text(`Total emissions: ${round(data.E1.totalEmissions)} tCO2e`));
            children.push(text(`Denominator: ${data.E1.employees} employees (FTE)`));
            children.push(
              text(
                'Intensity ratio calculated as total Scope 1+2+3 emissions divided by full-time equivalent employee count.',
                { color: '666666', size: 18 },
              ),
            );
            addChart(
              await docxCharts.kpiRowBuffer({
                kpis: [
                  { label: 'GHG Intensity', value: round(data.E1.intensity).toLocaleString(), unit: 'tCO2e / employee', color: '#003700' },
                  { label: 'Total Emissions', value: round(data.E1.totalEmissions).toLocaleString(), unit: 'tCO2e (Scope 1+2+3)', color: '#0ea5e9' },
                  { label: 'Workforce', value: (data.E1.employees || 0).toLocaleString(), unit: 'employees (FTE)', color: '#8b5cf6' },
                ],
              }),
            );
          } else if (disc.code === 'GRI 305-5') {
            children.push(text('[Omission] GHG emissions reduction data is not yet tracked separately.'));
            children.push(
              text(
                'Reason for omission: The organization has not yet established a formal emissions reduction tracking mechanism separate from year-over-year comparison. Plans are in place to implement reduction tracking aligned with SBTi commitments.',
                { color: '666666', size: 18 },
              ),
            );
          } else if (disc.code === 'GRI 302') {
            const energyActivities = data.E1.activities.filter(
              (a) =>
                a.activityCategory?.toLowerCase().includes('electric') ||
                a.activityCategory?.toLowerCase().includes('energy') ||
                a.activityCategory?.toLowerCase().includes('combustion') ||
                a.unit?.toLowerCase().includes('kwh') ||
                a.unit?.toLowerCase().includes('mwh'),
            );
            if (energyActivities.length > 0) {
              const totalKwh = energyActivities.reduce((s, a) => {
                if (a.unit?.toLowerCase().includes('kwh')) return s + a.quantity;
                if (a.unit?.toLowerCase().includes('mwh')) return s + a.quantity * 1000;
                return s;
              }, 0);
              children.push(text(`Total energy consumption: ${round(totalKwh)} kWh (${round(totalKwh * 0.0036)} GJ)`));
              children.push(text(`Energy records: ${energyActivities.length}`));
            } else {
              children.push(text(`${discData.count} emission activity records include energy-related data.`));
            }
          } else if (disc.code.includes('E1-6') || disc.code.includes('MT-b') || disc.code.includes('MET-1')) {
            children.push(text(`Total GHG Emissions: ${round(data.E1.totalEmissions)} tCO2e`));
            Object.entries(data.E1.byScope).forEach(([scope, val]) => {
              children.push(bullet(`${scope}: ${round(val)} tCO2e`));
            });
            if (data.E1.employees > 0) {
              children.push(
                text(`GHG Intensity: ${round(data.E1.intensity)} tCO2e per employee (${data.E1.employees} employees)`),
              );
            }

            // Donut: emissions by scope
            addChart(
              await docxCharts.donutChartBuffer({
                title: 'Total GHG Emissions by Scope (tCO2e)',
                data: Object.entries(data.E1.byScope).map(([label, value]) => ({ label, value: round(value) })),
                colorMap: docxCharts.SCOPE_COLORS,
              }),
            );

            if (data.E1.totalEnergyMwh > 0) {
              children.push(text('Energy Consumption:', { bold: true }));
              children.push(bullet(`Total: ${round(data.E1.totalEnergyMwh)} MWh`));
              if (data.E1.energyByType.electricity > 0)
                children.push(bullet(`Electricity: ${round(data.E1.energyByType.electricity)} MWh`));
              if (data.E1.energyByType.heating > 0)
                children.push(bullet(`District heating: ${round(data.E1.energyByType.heating)} MWh`));
              if (data.E1.energyByType.fuel > 0)
                children.push(bullet(`Fuel (diesel, petrol, LPG): ${round(data.E1.energyByType.fuel)} MWh`));
              if (data.E1.energyByType.other > 0)
                children.push(bullet(`Other energy sources: ${round(data.E1.energyByType.other)} MWh`));

              addChart(
                await docxCharts.hBarChartBuffer({
                  title: 'Energy Consumption Mix (MWh)',
                  data: [
                    { label: 'Electricity', value: round(data.E1.energyByType.electricity) },
                    { label: 'District heating', value: round(data.E1.energyByType.heating) },
                    { label: 'Fuel (diesel/petrol/LPG)', value: round(data.E1.energyByType.fuel) },
                    { label: 'Other energy', value: round(data.E1.energyByType.other) },
                  ],
                  unit: 'MWh',
                  color: '#0ea5e9',
                  maxBars: 6,
                }),
              );
            }

            if (data.E1.yoyChange !== null) {
              children.push(text('Year-over-Year Trend:', { bold: true }));
              children.push(
                text(yoyTrendSentence(data.E1.prevTotalEmissions, data.E1.totalEmissions, data.E1.yoyChange, y - 1, y, round)),
              );

              addChart(
                await docxCharts.yoyBarsBuffer({
                  title: 'Year-over-Year Comparison — Total GHG Emissions',
                  prevLabel: `${y - 1}`,
                  currLabel: `${y}`,
                  prevValue: round(data.E1.prevTotalEmissions),
                  currValue: round(data.E1.totalEmissions),
                  unit: 'tCO2e',
                }),
              );
            }

            const topCats = {};
            data.E1.activities.forEach((a) => {
              topCats[a.activityCategory] = (topCats[a.activityCategory] || 0) + (a.totalEmissions || 0);
            });
            const sortedCats = Object.entries(topCats).sort((a, b) => b[1] - a[1]);
            if (sortedCats.length > 0) {
              children.push(text('Emission Drivers:', { bold: true }));
              children.push(
                text(
                  `The primary sources of emissions are: ${sortedCats
                    .slice(0, 3)
                    .map(([cat, val]) => `${cat} (${round(val)} tCO2e)`)
                    .join(', ')}.`,
                ),
              );

              addChart(
                await docxCharts.hBarChartBuffer({
                  title: 'Top Emission Drivers by Activity Category',
                  data: sortedCats.map(([label, value]) => ({ label, value: round(value) })),
                  unit: 'tCO2e',
                  color: '#ef4444',
                  maxBars: 6,
                }),
              );
            }
          } else if (disc.code.includes('E1-4') || disc.code.includes('MT-c') || disc.code.includes('MET-2')) {
            if (data.E1.targets.length > 0) {
              const t = data.E1.targets[0];
              children.push(text(`Target: ${t.reductionPct}% reduction by ${t.targetYear}`));
              children.push(text(`Base year: ${t.baseYear} | Method: ${t.method} | Scope: ${t.scope}`));
              if (t.description) children.push(text(`Description: ${t.description}`));

              const yearsElapsed = Math.max(0, y - t.baseYear);
              const totalYears = Math.max(1, t.targetYear - t.baseYear);
              const timeProgressPct = Math.min(100, (yearsElapsed / totalYears) * 100);
              addChart(
                await docxCharts.progressBarBuffer({
                  title: `SBTi Target Timeline — ${t.reductionPct}% reduction by ${t.targetYear}`,
                  label: `Elapsed: ${yearsElapsed} of ${totalYears} years (base ${t.baseYear} → target ${t.targetYear})`,
                  percent: timeProgressPct,
                  color: '#10b981',
                }),
              );
            } else {
              children.push(text('[Omission] No formal decarbonization targets have been set.'));
            }
          } else if (disc.code.includes('E1-5')) {
            const totalQty = data.E1.activities.reduce((s, a) => s + (a.quantity || 0), 0);
            children.push(text(`Total activity quantity: ${round(totalQty)} (various units)`));
            children.push(text(`Activity records: ${data.E1.activities.length}`));
          } else {
            children.push(text(`${discData.count} data records available for this disclosure.`));
          }
        } else if (topicKey === 'S1' && data.S1) {
          if (disc.code.includes('S1-6') || disc.code.includes('405-1')) {
            children.push(text(`Total employees: ${data.S1.totalEmployees}`));
            Object.entries(data.S1.byGender).forEach(([g, c]) => children.push(bullet(`${g}: ${c}`)));

            addChart(
              await docxCharts.kpiRowBuffer({
                kpis: [
                  { label: 'Total Employees', value: (data.S1.totalEmployees || 0).toLocaleString(), unit: 'headcount', color: '#003700' },
                  { label: 'Gender Categories', value: Object.keys(data.S1.byGender).length, unit: 'reported', color: '#8b5cf6' },
                  { label: 'Org Units Covered', value: data.S1.comp.length, unit: 'records', color: '#0ea5e9' },
                ],
              }),
            );
            addChart(
              await docxCharts.hBarChartBuffer({
                title: 'Workforce Composition by Gender',
                data: Object.entries(data.S1.byGender).map(([label, value]) => ({ label, value })),
                unit: 'employees',
                color: '#8b5cf6',
                maxBars: 6,
              }),
            );
          } else if (disc.code.includes('S1-13') || disc.code.includes('404-1')) {
            const hours = data.S1.train.reduce((s, r) => s + r.trainingHours, 0);
            const trained = data.S1.train.reduce((s, r) => s + r.employeeCount, 0);
            children.push(text(`Total training hours: ${hours.toLocaleString()}`));
            children.push(text(`Employees trained: ${trained}`));
            children.push(text(`Average hours per employee: ${trained > 0 ? (hours / trained).toFixed(1) : 'N/A'}`));

            addChart(
              await docxCharts.kpiRowBuffer({
                kpis: [
                  { label: 'Total Training Hours', value: hours.toLocaleString(), unit: 'hours', color: '#0ea5e9' },
                  { label: 'Employees Trained', value: trained.toLocaleString(), unit: 'headcount', color: '#10b981' },
                  { label: 'Avg / Employee', value: trained > 0 ? (hours / trained).toFixed(1) : '—', unit: 'hours', color: '#8b5cf6' },
                ],
              }),
            );
          } else if (disc.code.includes('S1-9') || disc.code.includes('S1-12')) {
            const disabled = data.S1.div
              .filter((r) => r.disabilityStatus === 'Yes')
              .reduce((s, r) => s + r.count, 0);
            const disabilityRate = data.S1.totalEmployees > 0 ? (disabled / data.S1.totalEmployees) * 100 : 0;
            children.push(text(`Employees with disclosed disability: ${disabled}`));
            children.push(text(`Disability rate: ${disabilityRate.toFixed(1)}%`));

            addChart(
              await docxCharts.progressBarBuffer({
                title: 'Disability Inclusion Rate',
                label: `${disabled} of ${data.S1.totalEmployees} employees with disclosed disability`,
                percent: disabilityRate,
                color: '#8b5cf6',
              }),
            );
          } else if (disc.code.includes('S1-14') || disc.code.includes('403-9')) {
            const total = data.S1.inj.reduce((s, r) => s + r.count, 0);
            const fatal = data.S1.inj
              .filter((r) => r.injuryStatus === 'Fatal')
              .reduce((s, r) => s + r.count, 0);
            children.push(text(`Total workplace incidents: ${total}`));
            children.push(text(`Fatalities: ${fatal}`));

            addChart(
              await docxCharts.kpiRowBuffer({
                kpis: [
                  { label: 'Total Incidents', value: total.toLocaleString(), unit: 'recorded', color: '#f59e0b' },
                  { label: 'Fatalities', value: fatal.toLocaleString(), unit: 'reporting period', color: '#ef4444' },
                  { label: 'Non-fatal', value: (total - fatal).toLocaleString(), unit: 'incidents', color: '#64748b' },
                ],
              }),
            );
          } else if (disc.code.includes('401-1')) {
            const vol = data.S1.turn
              .filter((r) => r.turnoverType === 'Voluntary')
              .reduce((s, r) => s + r.count, 0);
            const invol = data.S1.turn
              .filter((r) => r.turnoverType === 'Involuntary')
              .reduce((s, r) => s + r.count, 0);
            const turnoverRate =
              data.S1.totalEmployees > 0 ? ((vol + invol) / data.S1.totalEmployees) * 100 : 0;
            children.push(text(`Voluntary turnover: ${vol}`));
            children.push(text(`Involuntary turnover: ${invol}`));
            children.push(text(`Turnover rate: ${turnoverRate.toFixed(1)}%`));

            addChart(
              await docxCharts.hBarChartBuffer({
                title: 'Employee Turnover Breakdown',
                data: [
                  { label: 'Voluntary', value: vol },
                  { label: 'Involuntary', value: invol },
                ],
                unit: 'employees',
                color: '#f59e0b',
                maxBars: 4,
              }),
            );
            addChart(
              await docxCharts.progressBarBuffer({
                title: 'Overall Turnover Rate',
                label: `${vol + invol} of ${data.S1.totalEmployees} employees`,
                percent: turnoverRate,
                color: '#f59e0b',
              }),
            );
          } else {
            children.push(text(`${discData.count} data records available.`));
          }
        } else if (topicKey === 'G1' && data.G1) {
          if (disc.code.includes('G1-4') || disc.code.includes('205-3') || disc.code.includes('206-1')) {
            children.push(text(`Total business-conduct incidents: ${data.G1.totalIncidents}`));
            children.push(text(`Confirmed (substantiated) incidents: ${data.G1.confirmedIncidents}`));
            children.push(text(`Monetary fines and penalties: $${data.G1.totalFines.toLocaleString()}`));

            addChart(
              await docxCharts.kpiRowBuffer({
                kpis: [
                  { label: 'Total Incidents', value: data.G1.totalIncidents.toLocaleString(), unit: 'cases', color: '#f59e0b' },
                  { label: 'Confirmed', value: data.G1.confirmedIncidents.toLocaleString(), unit: 'substantiated', color: '#ef4444' },
                  { label: 'Fines & Penalties', value: `$${data.G1.totalFines.toLocaleString()}`, unit: 'USD', color: '#64748b' },
                ],
              }),
            );
            const typeEntries = Object.entries(data.G1.incidentsByType);
            if (typeEntries.length > 0) {
              addChart(
                await docxCharts.hBarChartBuffer({
                  title: 'Incidents by Type',
                  data: typeEntries.map(([label, value]) => ({ label, value })),
                  unit: 'cases',
                  color: '#d97706',
                  maxBars: 7,
                }),
              );
            }
          } else if (disc.code.includes('G1-3') || disc.code.includes('205-2')) {
            const antiCorruption = data.G1.training
              .filter((r) => r.topic === 'Anti-corruption')
              .reduce((s, r) => s + r.employeesTrained, 0);
            children.push(text(`People who completed ethics/compliance training: ${data.G1.totalTrained.toLocaleString()}`));
            children.push(text(`Of which anti-corruption training: ${antiCorruption.toLocaleString()}`));

            addChart(
              await docxCharts.kpiRowBuffer({
                kpis: [
                  { label: 'People Trained', value: data.G1.totalTrained.toLocaleString(), unit: 'headcount', color: '#0ea5e9' },
                  { label: 'Anti-corruption', value: antiCorruption.toLocaleString(), unit: 'headcount', color: '#10b981' },
                  { label: 'Training Records', value: data.G1.training.length, unit: 'entries', color: '#8b5cf6' },
                ],
              }),
            );
          } else if (disc.code.includes('G1-1')) {
            children.push(text(`Governance policies in place: ${data.G1.policiesInPlace} of ${data.G1.policies.length} registered`));
            data.G1.policies.slice(0, 8).forEach((p) =>
              children.push(bullet(`${p.policyName} (${p.policyArea}) — ${p.status}${p.boardApproved === 'Yes' ? ', board approved' : ''}`)),
            );
          } else if (disc.code.includes('2-9') || disc.code.includes('GOV')) {
            const femaleBoard = data.G1.boardByGender['Female'] || 0;
            children.push(text(`Board size: ${data.G1.boardSize} members`));
            children.push(text(`Women on board: ${data.G1.boardSize > 0 ? Math.round((femaleBoard / data.G1.boardSize) * 100) : 0}%`));
            children.push(text(`Independent members: ${data.G1.boardSize > 0 ? Math.round((data.G1.independentCount / data.G1.boardSize) * 100) : 0}%`));

            const genderEntries = Object.entries(data.G1.boardByGender);
            if (genderEntries.length > 0) {
              addChart(
                await docxCharts.hBarChartBuffer({
                  title: 'Board Composition by Gender',
                  data: genderEntries.map(([label, value]) => ({ label, value })),
                  unit: 'members',
                  color: '#d97706',
                  maxBars: 5,
                }),
              );
            }
          } else {
            children.push(text(`${discData.count} data records available.`));
          }
        }
      } else if (disc.type === 'narrative') {
        const approvedDraft = approvedDrafts[disc.code];
        if (approvedDraft) {
          // ISO Bridge: human-approved narrative content replaces the placeholder
          const body = approvedDraft.editedText || approvedDraft.draftText;
          body.split('\n').filter((p) => p.trim()).forEach((p) => children.push(text(p.trim())));
          const cites = Array.isArray(approvedDraft.citations) ? approvedDraft.citations : [];
          const citeText = cites.length > 0
            ? cites.map((c) => `ISO ${c.isoStandard} clause ${c.clause}${c.sourceFileName ? ` — ${c.sourceFileName}` : ''}`).join('; ')
            : 'ISO management-system documentation';
          children.push(
            text(`Source: ${citeText}. Drafted from ISO evidence via the ISO Bridge and approved by a human reviewer.`, {
              italics: true,
              color: '888888',
              size: 16,
            }),
          );
        } else {
          children.push(
            text(`This disclosure requires qualitative narrative about: ${disc.name.toLowerCase()}.`, {
              italics: true,
              color: '555555',
            }),
          );
          children.push(
            text(
              `[To be completed: Provide details on policies, actions, targets, and governance related to ${disc.name.toLowerCase()}. Include context on why this topic is material, what measures are in place, and what outcomes have been achieved.]`,
              { color: '888888', size: 18 },
            ),
          );
        }
      } else {
        children.push(
          text(`[Omission] Quantitative data for this disclosure is not available for the reporting period ${y}.`, {
            color: 'B45309',
          }),
        );
        children.push(
          text(
            `Reason: Data collection processes for "${disc.name}" have not yet been established or the relevant data sources have not been connected. The organization intends to disclose this metric in future reporting periods as data systems mature.`,
            { color: '888888', size: 18 },
          ),
        );
      }

      children.push(spacer());
    }

    sectionNum++;
  }

  // ═══════════════ STANDARD INDEX ═══════════════
  children.push(heading(`${sectionNum}. ${std.name} Index`));
  for (const topicKey of selectedTopics) {
    const topic = std.topics[topicKey];
    if (!topic) continue;
    children.push(text(`${topic.code} — ${topic.name}`, { bold: true, color: BRAND }));
    for (const disc of topic.disclosures) {
      const discResult = validation.topics
        .find((t) => t.key === topicKey)
        ?.disclosures.find((d) => d.code === disc.code);
      const status = discResult?.hasData
        ? '✓ Reported'
        : disc.type === 'narrative'
          ? '○ Narrative pending'
          : '✗ No data';
      children.push(bullet(`${disc.code} — ${disc.name} — ${status}`));
    }
  }

  children.push(spacer());
  children.push(
    centered(`This report was generated by Triple I ESG Portal on ${new Date().toISOString().split('T')[0]}.`, {
      size: 16,
      color: '999999',
    }),
  );

  const doc = new Document({
    creator: 'Triple I ESG Portal',
    title: `${standard} Report ${y}`,
    description: `${std.name} sustainability report for ${company.name}`,
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}

// ─── Generate report v2 ────────────────────────────────────

router.post('/generate', async (req, res) => {
  try {
    const { year, standard, topics, language, format, generateWithoutMissing, companyDescription } = req.body;
    if (!year || !standard) return res.status(400).json({ error: 'Year and standard are required.' });

    const y = parseInt(year);
    const std = STANDARDS[standard];
    if (!std) return res.status(400).json({ error: `Unknown standard: ${standard}` });

    const lang = language || 'en';
    const fmt = (format || 'pdf').toLowerCase();
    if (!['pdf', 'docx'].includes(fmt)) {
      return res.status(400).json({ error: 'Format must be "pdf" or "docx".' });
    }
    const selectedTopics = topics || Object.keys(std.topics);

    // ─── Tier gating for standard + language ───────────────────────────
    const allowedStandards = new Set(tierFeatures.allowedStandardsFor(req.tier));
    if (!allowedStandards.has(standard)) {
      const needed = tierFeatures.STANDARD_TIER[standard] || 'PROFESSIONAL';
      return res.status(403).json({
        error: 'FEATURE_NOT_IN_PLAN',
        message: `The ${standard} standard requires the ${tierFeatures.getTier(needed).name} plan.`,
        feature: standard === 'GRI' ? 'gri_report' : 'all_standards',
        currentTier: req.tier,
        requiredTier: needed,
      });
    }
    const allowedLangs = new Set(tierFeatures.allowedLanguagesFor(req.tier));
    if (!allowedLangs.has(lang)) {
      const needed = tierFeatures.LANGUAGE_TIER[lang] || 'PROFESSIONAL';
      return res.status(403).json({
        error: 'FEATURE_NOT_IN_PLAN',
        message: `Reports in this language require the ${tierFeatures.getTier(needed).name} plan.`,
        feature: 'multi_language_reports',
        currentTier: req.tier,
        requiredTier: needed,
      });
    }

    // Validate data
    const validation = await validateReportData(prisma, req.user.companyId, y, standard, selectedTopics);

    // ─── Credit check (estimator-based, scales with data availability) ───
    const reportEstimate = estimator.estimateReport({ validation });
    const companyForCredits = await prisma.company.findUnique({
      where: { id: req.user.companyId },
      select: { creditBalance: true },
    });
    if ((companyForCredits?.creditBalance ?? 0) < reportEstimate.credits) {
      return res.status(403).json({
        error: 'Insufficient credits',
        required: reportEstimate.credits,
        available: companyForCredits?.creditBalance ?? 0,
      });
    }

    // Log if generating without missing data
    if (generateWithoutMissing && validation.missing.length > 0) {
      logActivity(req.user.id, req.user.companyId, 'GENERATE_REPORT',
        `Generated ${standard} report for ${y} WITHOUT ${validation.missing.length} missing disclosures: ${validation.missing.map(m => m.code).join(', ')}`,
        { standard, year: y, missingDisclosures: validation.missing }, req.ip
      );
    }

    const company = await prisma.company.findUnique({ where: { id: req.user.companyId } });

    // Fetch org units for boundary section
    const orgUnits = await prisma.orgUnit.findMany({ where: { companyId: req.user.companyId } });

    // Fetch all data for selected topics
    const data = {};
    for (const topicKey of selectedTopics) {
      if (topicKey === 'E1') {
        const [activities, prevActivities, targets, s1Comp] = await Promise.all([
          prisma.fE1EmissionActivityData.findMany({ where: { companyId: req.user.companyId, year: y } }),
          prisma.fE1EmissionActivityData.findMany({ where: { companyId: req.user.companyId, year: y - 1 } }),
          prisma.sBTiTarget.findMany({ where: { companyId: req.user.companyId } }),
          prisma.fS1WorkforceComposition.findMany({ where: { companyId: req.user.companyId, year: y } }),
        ]);
        const totalEmissions = activities.reduce((s, r) => s + (r.totalEmissions || 0), 0);
        const prevTotalEmissions = prevActivities.reduce((s, r) => s + (r.totalEmissions || 0), 0);
        const byScope = {};
        activities.forEach(r => { byScope[r.scope || 'Scope 3'] = (byScope[r.scope || 'Scope 3'] || 0) + (r.totalEmissions || 0); });
        const employees = s1Comp.reduce((s, r) => s + r.employeeCount, 0);

        // Energy breakdown by type (fuel vs electricity)
        const energyByType = { electricity: 0, fuel: 0, heating: 0, other: 0 };
        let totalEnergyMwh = 0;
        activities.forEach((r) => {
          const sub = (r.activitySubcat || '').toLowerCase();
          const cat = (r.activityCategory || '').toLowerCase();
          const unit = (r.unit || '').toLowerCase();
          let mwh = 0;
          if (unit.includes('mwh')) mwh = r.quantity;
          else if (unit.includes('kwh')) mwh = r.quantity / 1000;
          else if (unit.includes('litre')) mwh = r.quantity * 0.01;
          else if (unit.includes('gj')) mwh = r.quantity * 0.27778;

          if (mwh > 0) {
            totalEnergyMwh += mwh;
            if (sub.includes('electric') || sub.includes('grid')) energyByType.electricity += mwh;
            else if (sub.includes('heating') || sub.includes('district') || sub.includes('fernwärme')) energyByType.heating += mwh;
            else if (sub.includes('diesel') || sub.includes('petrol') || sub.includes('lpg') || cat.includes('mobile')) energyByType.fuel += mwh;
            else energyByType.other += mwh;
          }
        });

        const yoyChange = prevTotalEmissions > 0 ? ((totalEmissions - prevTotalEmissions) / prevTotalEmissions * 100) : null;

        data.E1 = { activities, targets, totalEmissions, prevTotalEmissions, yoyChange, byScope, employees,
          intensity: employees > 0 ? totalEmissions / employees : 0, energyByType, totalEnergyMwh };
      }
      if (topicKey === 'S1') {
        const [comp, div, train, turn, inj] = await Promise.all([
          prisma.fS1WorkforceComposition.findMany({ where: { companyId: req.user.companyId, year: y } }),
          prisma.fS1WorkforceDiversity.findMany({ where: { companyId: req.user.companyId, year: y } }),
          prisma.fS1EmployeeTraining.findMany({ where: { companyId: req.user.companyId, year: y } }),
          prisma.fS1EmployeeTurnover.findMany({ where: { companyId: req.user.companyId, year: y } }),
          prisma.fS1WorkplaceInjuries.findMany({ where: { companyId: req.user.companyId, year: y } }),
        ]);
        const totalEmployees = comp.reduce((s, r) => s + r.employeeCount, 0);
        const byGender = {};
        comp.forEach(r => { byGender[r.gender] = (byGender[r.gender] || 0) + r.employeeCount; });
        data.S1 = { comp, div, train, turn, inj, totalEmployees, byGender };
      }
      if (topicKey === 'G1') {
        const [board, training, incidents, policies] = await Promise.all([
          prisma.fG1BoardComposition.findMany({ where: { companyId: req.user.companyId, year: y } }),
          prisma.fG1EthicsTraining.findMany({ where: { companyId: req.user.companyId, year: y } }),
          prisma.fG1GovernanceIncident.findMany({ where: { companyId: req.user.companyId, year: y } }),
          prisma.fG1PolicyRegister.findMany({ where: { companyId: req.user.companyId, year: y } }),
        ]);
        const boardSize = board.reduce((s, r) => s + r.count, 0);
        const boardByGender = {};
        board.forEach(r => { boardByGender[r.gender] = (boardByGender[r.gender] || 0) + r.count; });
        const independentCount = board.filter(r => r.independence === 'Independent').reduce((s, r) => s + r.count, 0);
        const totalTrained = training.reduce((s, r) => s + r.employeesTrained, 0);
        const totalIncidents = incidents.reduce((s, r) => s + r.count, 0);
        const confirmedIncidents = incidents.filter(r => r.status === 'Substantiated').reduce((s, r) => s + r.count, 0);
        const totalFines = incidents.reduce((s, r) => s + (r.finesAmount || 0), 0);
        const incidentsByType = {};
        incidents.forEach(r => { incidentsByType[r.incidentType] = (incidentsByType[r.incidentType] || 0) + r.count; });
        const policiesInPlace = policies.filter(r => r.status === 'In place').length;
        data.G1 = {
          board, training, incidents, policies,
          boardSize, boardByGender, independentCount,
          totalTrained, totalIncidents, confirmedIncidents, totalFines, incidentsByType, policiesInPlace,
        };
      }
    }

    // ─── ISO Bridge: human-approved narrative drafts ───────────
    // Approved DisclosureDrafts (ISO Bridge C4) fill the narrative
    // placeholders for their disclosure codes. Only APPROVED content is
    // ever used — drafts and rejected content never reach a report.
    const approvedDrafts = {};
    try {
      const draftRows = await prisma.disclosureDraft.findMany({
        where: { companyId: req.user.companyId, standard, year: y, status: 'APPROVED' },
        orderBy: { reviewedAt: 'desc' },
      });
      for (const d of draftRows) {
        if (!approvedDrafts[d.disclosureCode]) approvedDrafts[d.disclosureCode] = d; // newest approval wins
      }
    } catch (err) {
      console.warn('[Report] ISO Bridge draft fetch failed (non-fatal):', err.message);
    }

    // ─── Sector KPI + PCF data for the report ──────────────────
    // Fetch the company's active sector pack KPIs and any PCF calculations
    // so they can be included in the report alongside standard disclosures.
    let sectorKpiData = null;
    let pcfProducts = [];
    try {
      const sectorSel = await prisma.companySectorSelection.findUnique({ where: { companyId: req.user.companyId } });
      if (sectorSel) {
        const pack = await prisma.sectorPack.findUnique({
          where: { key: sectorSel.sectorKey },
          include: { kpis: { orderBy: { sortOrder: 'asc' } } },
        });
        if (pack) sectorKpiData = { packName: pack.name, sectorKey: sectorSel.sectorKey, kpis: pack.kpis };
      }
      pcfProducts = await prisma.product.findMany({
        where: { companyId: req.user.companyId },
        include: { calculations: { orderBy: { runAt: 'desc' }, take: 1 } },
      });
    } catch (err) {
      console.warn('[Report] Sector/PCF data fetch failed (non-fatal):', err.message);
    }

    // ─── DOCX branch ──────────────────────────────────────────
    // Build a Word document from the same data and return early.  Credit
    // deduction + activity logging mirror the PDF path below.
    if (fmt === 'docx') {
      let logoFilePath = null;
      if (company.logoPath) {
        const uploadsDir = path.join(__dirname, '../../uploads');
        const candidate = path.join(uploadsDir, company.logoPath);
        if (fs.existsSync(candidate)) logoFilePath = candidate;
      }

      const buffer = await buildReportDocx({
        company,
        companyDescription,
        std,
        standard,
        y,
        selectedTopics,
        validation,
        orgUnits,
        data,
        generateWithoutMissing,
        logoFilePath,
        sectorKpiData,
        pcfProducts,
        approvedDrafts,
      });

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      res.setHeader('Content-Disposition', `attachment; filename="${standard}_Report_${y}.docx"`);
      res.send(buffer);

      try {
        await deductCredits(
          req.user.companyId,
          req.user.id,
          reportEstimate.credits,
          'REPORT_GEN',
          `${standard} report (docx) for ${y} — ${reportEstimate.breakdown.topicsWithData} topic(s), ${reportEstimate.breakdown.disclosuresWithData} disclosures — ${reportEstimate.credits} credits`,
          null,
        );
        await logCost({
          companyId: req.user.companyId,
          userId: req.user.id,
          operation: 'REPORT_GEN',
          model: null,
          inputTokens: 0,
          outputTokens: 0,
          durationMs: null,
          relatedId: null,
          metadata: {
            standard,
            year: y,
            topics: selectedTopics,
            format: fmt,
            credits: reportEstimate.credits,
            breakdown: reportEstimate.breakdown,
          },
          estimatedCostOverride: reportEstimate.estimatedCostUSD,
        });
      } catch (creditErr) {
        console.error('[Report] post-generation credit/cost logging failed:', creditErr.message);
      }

      logActivity(
        req.user.id,
        req.user.companyId,
        'GENERATE_REPORT',
        `Generated ${standard} report (docx) for ${y} with topics: ${selectedTopics.join(', ')} — ${reportEstimate.credits} credits`,
        { standard, year: y, topics: selectedTopics, format: fmt, credits: reportEstimate.credits },
        req.ip,
      );
      return;
    }

    // Generate PDF
    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${standard}_Report_${y}.pdf"`);
    doc.pipe(res);

    // ═══════════════ COVER PAGE ═══════════════

    // Company logo — embed if uploaded (PNG/JPG only)
    let hasLogo = false;
    if (company.logoPath) {
      const uploadsDir = path.join(__dirname, '../../uploads');
      const logoFilePath = path.join(uploadsDir, company.logoPath);
      try {
        if (fs.existsSync(logoFilePath)) {
          doc.moveDown(2);
          doc.image(logoFilePath, { fit: [150, 150], align: 'center' });
          doc.moveDown(1);
          hasLogo = true;
        }
      } catch (logoErr) {
        console.warn('[Report] Could not embed logo:', logoErr.message);
      }
    }

    if (!hasLogo) doc.moveDown(4);

    doc.fontSize(28).font('Helvetica-Bold').fillColor('#003700').text('Sustainability Management Report', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#333').text(`(${standard})`, { align: 'center' });
    doc.moveDown(2);
    doc.fontSize(24).font('Helvetica').fillColor('#333').text(company.name, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica').fillColor('#666').text(companyDescription || `${company.industry} | ${company.country}`, { align: 'center' });
    doc.moveDown(3);
    doc.fontSize(16).font('Helvetica').fillColor('#333').text(`Reporting Year: ${y || 'All Years'}`, { align: 'center' });
    doc.moveDown(1);
    doc.fontSize(11).fillColor('#666').text(`Prepared in accordance with:`, { align: 'center' });
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#003700').text(`${std.name}`, { align: 'center' });
    doc.fontSize(10).font('Helvetica').fillColor('#888').text(`${std.framework} ${std.version}`, { align: 'center' });
    doc.moveDown(5);
    doc.fontSize(9).fillColor('#aaa').text(`Generated on ${new Date().toLocaleDateString()} | Confidential`, { align: 'center' });
    doc.text(`Triple I ESG Portal — www.triplei.io`, { align: 'center' });

    // ═══════════════ TABLE OF CONTENTS ═══════════════
    doc.addPage();
    doc.fontSize(22).font('Helvetica-Bold').fillColor('#003700').text('Table of Contents');
    doc.moveDown(1);

    let tocPage = 3;
    const tocEntries = [];
    tocEntries.push({ label: '1. About This Report', page: tocPage++ });
    if (std.crossCutting.length > 0) tocEntries.push({ label: '2. General Disclosures', page: tocPage++ });

    let sectionNum = 3;
    for (const topicKey of selectedTopics) {
      const topic = std.topics[topicKey];
      if (topic) {
        tocEntries.push({ label: `${sectionNum}. ${topic.code} — ${topic.name}`, page: tocPage });
        tocPage += 2; // estimate
        sectionNum++;
      }
    }
    tocEntries.push({ label: `${sectionNum}. Standard Index`, page: tocPage });

    doc.fontSize(11).font('Helvetica').fillColor('#333');
    for (const entry of tocEntries) {
      const dots = '.'.repeat(Math.max(3, 70 - entry.label.length));
      doc.text(`${entry.label} ${dots} ${entry.page}`, { indent: 20 });
      doc.moveDown(0.3);
    }

    // ═══════════════ ABOUT THIS REPORT ═══════════════
    doc.addPage();
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#003700').text('1. About This Report');
    doc.moveDown(1);
    doc.fontSize(11).font('Helvetica').fillColor('#333');
    doc.text(`This report has been prepared by ${company.name} in accordance with the ${std.name} (${std.framework} ${std.version}).`);
    doc.moveDown(0.5);
    doc.text(`Reporting period: January 1, ${y} to December 31, ${y}`);
    doc.text(`Company: ${company.name}`);
    doc.text(`Industry: ${company.industry}`);
    doc.text(`Headquarters: ${company.hqLocation || company.country}`);
    doc.text(`Company size: ${company.companySize}`);
    if (company.stockExchange) doc.text(`Stock exchange: ${company.stockExchange} (${company.tickerSymbol || ''})`);
    doc.moveDown(1);

    // Organizational boundaries
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#003700').text('Organizational Boundaries');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor('#333');
    doc.text(`Consolidation approach: Operational control`);
    doc.text(`Organizational units included in this report:`);
    doc.moveDown(0.2);
    for (const ou of orgUnits) {
      doc.text(`  • ${ou.name} — ${ou.country}`, { indent: 10 });
    }
    doc.moveDown(0.5);
    doc.text(`Operations covered: All operations under the organizational control of ${company.name} across ${orgUnits.length} organizational unit(s) in ${[...new Set(orgUnits.map(u => u.country))].join(', ')}.`);
    doc.moveDown(0.5);

    // Methodology
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#003700').text('Methodology');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor('#333');
    doc.text('GHG emissions have been calculated in accordance with the GHG Protocol Corporate Accounting and Reporting Standard (Revised Edition). Emission factors are sourced from recognized databases including DEFRA, EPA, and IEA. Energy consumption is reported in MWh (megawatt-hours) with appropriate conversion factors applied for different fuel types and energy carriers.');
    doc.moveDown(0.5);
    doc.text('Scope boundaries:');
    doc.text('  • Scope 1: Direct emissions from owned/controlled sources (stationary combustion, mobile combustion, fugitive emissions)', { indent: 10 });
    doc.text('  • Scope 2: Indirect emissions from purchased electricity, steam, heating, and cooling (location-based method)', { indent: 10 });
    doc.text('  • Scope 3: All other indirect emissions in the value chain (business travel, employee commuting, purchased goods)', { indent: 10 });
    doc.moveDown(0.5);
    doc.text('Energy units: All energy quantities are standardized to MWh. Conversion factors: 1 litre diesel = 0.01 MWh, 1 litre petrol = 0.0091 MWh, 1 m³ natural gas = 0.01055 MWh, 1 GJ = 0.27778 MWh.');
    doc.moveDown(1);

    if (validation.missing.length > 0 && generateWithoutMissing) {
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#b45309').text('Data Coverage Notice');
      doc.font('Helvetica').fillColor('#333');
      doc.text(`The following ${validation.missing.length} disclosure(s) could not be fully populated due to missing data:`);
      doc.moveDown(0.3);
      for (const m of validation.missing) {
        doc.text(`  • ${m.code} — ${m.name}`, { indent: 10 });
      }
      doc.moveDown(1);
    }

    // ═══════════════ SECTOR KPIs + PCF SUMMARY ═══════════════
    // Include industry-specific KPIs and product carbon footprint data
    // in the report when a sector pack is active or PCF data exists.
    if (sectorKpiData || pcfProducts.length > 0) {
      doc.addPage();
      let sectorSectionNum = std.crossCutting.length > 0 ? 3 : 2;

      if (sectorKpiData && sectorKpiData.kpis.length > 0) {
        doc.fontSize(20).font('Helvetica-Bold').fillColor('#003700')
           .text(`${sectorSectionNum}. Industry-Specific Disclosures (${sectorKpiData.packName})`);
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica').fillColor('#333');
        doc.text(`This section presents the KPIs required by the ${sectorKpiData.packName} sector pack. These metrics span multiple reporting frameworks applicable to the ${company.industry} sector.`);
        doc.moveDown(1);

        // Group KPIs by framework
        const byFramework = {};
        for (const kpi of sectorKpiData.kpis) {
          if (!byFramework[kpi.framework]) byFramework[kpi.framework] = [];
          byFramework[kpi.framework].push(kpi);
        }

        for (const [framework, kpis] of Object.entries(byFramework)) {
          if (doc.y > 680) doc.addPage();
          doc.fontSize(12).font('Helvetica-Bold').fillColor('#003700').text(framework);
          doc.moveDown(0.3);

          for (const kpi of kpis) {
            if (doc.y > 720) doc.addPage();
            doc.fontSize(10).font('Helvetica-Bold').fillColor('#333').text(`${kpi.code}: ${kpi.name}`);
            doc.fontSize(9).font('Helvetica').fillColor('#666');
            if (kpi.unit === 'narrative') {
              doc.text(`  [Narrative disclosure — to be completed]`);
            } else {
              doc.text(`  Unit: ${kpi.unit} | Category: ${kpi.category}`);
              if (kpi.formula) doc.text(`  Computation: ${kpi.formula}`);
            }
            doc.moveDown(0.5);
          }
          doc.moveDown(0.5);
        }
        sectorSectionNum++;
      }

      // PCF summary
      const productsWithCalc = pcfProducts.filter(p => p.calculations && p.calculations.length > 0);
      if (productsWithCalc.length > 0) {
        if (doc.y > 600) doc.addPage();
        doc.fontSize(16).font('Helvetica-Bold').fillColor('#003700')
           .text(`${sectorSectionNum}. Product Carbon Footprints`);
        doc.moveDown(0.5);
        doc.fontSize(10).font('Helvetica').fillColor('#333');
        doc.text(`${productsWithCalc.length} product(s) have calculated carbon footprints using the ISO 14067 / cradle-to-gate (A1–A3) methodology with Monte Carlo uncertainty analysis (1,000 iterations).`);
        doc.moveDown(0.5);

        for (const product of productsWithCalc) {
          if (doc.y > 680) doc.addPage();
          const calc = product.calculations[0];
          doc.fontSize(11).font('Helvetica-Bold').fillColor('#333')
             .text(`${product.name} (${product.sku})`);
          doc.fontSize(10).font('Helvetica').fillColor('#333');
          doc.text(`  Functional unit: ${product.functionalUnit}`);
          doc.text(`  Total PCF: ${calc.totalKgCo2e} kgCO2e (p50)`);
          doc.text(`  Uncertainty range: ${calc.uncertaintyLow} – ${calc.uncertaintyHigh} kgCO2e (p5–p95)`);
          doc.text(`  Primary data share: ${Math.round((calc.primaryDataPct || 0) * 100)}%`);
          doc.text(`  Status: ${calc.status}`);

          // Stage breakdown
          const stages = calc.breakdownByStage || {};
          if (Object.keys(stages).length > 0) {
            doc.moveDown(0.2);
            doc.text(`  Lifecycle stage breakdown:`);
            for (const [stage, kg] of Object.entries(stages)) {
              const pct = calc.totalKgCo2e > 0 ? ((kg / calc.totalKgCo2e) * 100).toFixed(1) : '0';
              doc.text(`    ${stage}: ${kg} kgCO2e (${pct}%)`, { indent: 15 });
            }
          }
          doc.moveDown(0.8);
        }
      }
    }

    // ═══════════════ TOPIC SECTIONS ═══════════════
    sectionNum = std.crossCutting.length > 0 ? 3 : 2;

    for (const topicKey of selectedTopics) {
      const topic = std.topics[topicKey];
      if (!topic) continue;

      doc.addPage();
      doc.fontSize(20).font('Helvetica-Bold').fillColor('#003700').text(`${sectionNum}. ${topic.code} — ${topic.name}`);
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor('#999').text(`Pillar: ${topic.pillar}`);
      doc.moveDown(1);

      // Write each disclosure
      for (const disc of topic.disclosures) {
        if (doc.y > 680) doc.addPage();

        doc.fontSize(12).font('Helvetica-Bold').fillColor('#333').text(`${disc.code}: ${disc.name}`);
        doc.moveDown(0.3);

        const discData = validation.topics.find(t => t.key === topicKey)?.disclosures.find(d => d.code === disc.code);

        if (disc.type === 'metric' && discData?.hasData) {
          doc.fontSize(10).font('Helvetica').fillColor('#333');

          // Write metrics based on topic and SPECIFIC disclosure code
          if (topicKey === 'E1' && data.E1) {
            const round = (n) => Math.round(n * 10000) / 10000;

            // === GRI SCOPE-SPECIFIC DISCLOSURES ===
            if (disc.code === 'GRI 305-1') {
              // Scope 1 ONLY
              const s1 = round(data.E1.byScope['Scope 1'] || 0);
              const totalAllScopes = Object.values(data.E1.byScope).reduce((s, v) => s + v, 0);
              const s1Pct = totalAllScopes > 0 ? (s1 / totalAllScopes) * 100 : 0;
              doc.text(`Direct GHG Emissions (Scope 1): ${s1} tCO2e`);
              doc.moveDown(0.3);
              doc.fontSize(9).fillColor('#666');
              doc.text('Scope 1 includes direct emissions from owned or controlled sources including stationary combustion, mobile combustion (company vehicles), and fugitive emissions.');
              doc.text('Methodology: GHG Protocol Corporate Standard. Emission factors sourced from DEFRA/EPA databases.');

              // ── KPI visual: Scope 1 total + share of total + activities breakdown
              doc.moveDown(0.5);
              pdfCharts.drawKpiRow(doc, {
                kpis: [
                  { label: 'Scope 1 Emissions', value: s1.toLocaleString(), unit: 'tCO2e', color: pdfCharts.SCOPE_COLORS['Scope 1'] },
                  { label: 'Share of Total', value: `${s1Pct.toFixed(1)}%`, unit: 'of Scope 1+2+3', color: pdfCharts.SCOPE_COLORS['Scope 1'] },
                  { label: 'Activity Records', value: data.E1.activities.filter(a => a.scope === 'Scope 1').length, unit: 'data points', color: '#64748b' },
                ],
              });
              const s1Cats = {};
              data.E1.activities.filter(a => a.scope === 'Scope 1').forEach(a => {
                const k = a.activityCategory || 'Other';
                s1Cats[k] = (s1Cats[k] || 0) + (a.totalEmissions || 0);
              });
              pdfCharts.drawHBarChart(doc, {
                title: 'Scope 1 Emissions by Activity Category',
                data: Object.entries(s1Cats).map(([label, value]) => ({ label, value })),
                unit: 'tCO2e',
                color: pdfCharts.SCOPE_COLORS['Scope 1'],
                maxBars: 5,
              });
              doc.fontSize(10).font('Helvetica').fillColor('#333');
            } else if (disc.code === 'GRI 305-2') {
              // Scope 2 ONLY
              const s2 = round(data.E1.byScope['Scope 2'] || 0);
              const totalAllScopes2 = Object.values(data.E1.byScope).reduce((s, v) => s + v, 0);
              const s2Pct = totalAllScopes2 > 0 ? (s2 / totalAllScopes2) * 100 : 0;
              doc.text(`Energy Indirect GHG Emissions (Scope 2): ${s2} tCO2e`);
              doc.moveDown(0.3);
              doc.fontSize(9).fillColor('#666');
              doc.text('Scope 2 covers indirect emissions from purchased electricity, steam, heating, and cooling. Location-based method applied using grid-average emission factors.');

              // ── KPI visual: Scope 2 KPIs + energy carrier breakdown
              doc.moveDown(0.5);
              pdfCharts.drawKpiRow(doc, {
                kpis: [
                  { label: 'Scope 2 Emissions', value: s2.toLocaleString(), unit: 'tCO2e', color: pdfCharts.SCOPE_COLORS['Scope 2'] },
                  { label: 'Share of Total', value: `${s2Pct.toFixed(1)}%`, unit: 'of Scope 1+2+3', color: pdfCharts.SCOPE_COLORS['Scope 2'] },
                  { label: 'Electricity', value: round(data.E1.energyByType.electricity).toLocaleString(), unit: 'MWh', color: '#0ea5e9' },
                ],
              });
              const s2Cats = {};
              data.E1.activities.filter(a => a.scope === 'Scope 2').forEach(a => {
                const k = a.activitySubcat || a.activityCategory || 'Other';
                s2Cats[k] = (s2Cats[k] || 0) + (a.totalEmissions || 0);
              });
              pdfCharts.drawHBarChart(doc, {
                title: 'Scope 2 Emissions by Energy Carrier',
                data: Object.entries(s2Cats).map(([label, value]) => ({ label, value })),
                unit: 'tCO2e',
                color: pdfCharts.SCOPE_COLORS['Scope 2'],
                maxBars: 5,
              });
              doc.fontSize(10).font('Helvetica').fillColor('#333');
            } else if (disc.code === 'GRI 305-3') {
              // Scope 3 ONLY
              const s3 = round(data.E1.byScope['Scope 3'] || 0);
              const totalAllScopes3 = Object.values(data.E1.byScope).reduce((s, v) => s + v, 0);
              const s3Pct = totalAllScopes3 > 0 ? (s3 / totalAllScopes3) * 100 : 0;
              doc.text(`Other Indirect GHG Emissions (Scope 3): ${s3} tCO2e`);
              doc.moveDown(0.3);
              doc.fontSize(9).fillColor('#666');
              const s3Categories = {};
              data.E1.activities.filter(a => a.scope === 'Scope 3').forEach(a => {
                s3Categories[a.activityCategory] = (s3Categories[a.activityCategory] || 0) + (a.totalEmissions || 0);
              });
              if (Object.keys(s3Categories).length > 0) {
                doc.text('Breakdown by category:');
                Object.entries(s3Categories).forEach(([cat, val]) => {
                  doc.text(`  • ${cat}: ${round(val)} tCO2e`, { indent: 15 });
                });
              }
              doc.text('Scope 3 categories included: business travel, employee commuting, purchased goods and services where data is available.');

              // ── KPI visual: Scope 3 KPIs + category breakdown
              doc.moveDown(0.5);
              pdfCharts.drawKpiRow(doc, {
                kpis: [
                  { label: 'Scope 3 Emissions', value: s3.toLocaleString(), unit: 'tCO2e', color: pdfCharts.SCOPE_COLORS['Scope 3'] },
                  { label: 'Share of Total', value: `${s3Pct.toFixed(1)}%`, unit: 'of Scope 1+2+3', color: pdfCharts.SCOPE_COLORS['Scope 3'] },
                  { label: 'Categories Reported', value: Object.keys(s3Categories).length, unit: 'GHG Protocol cats.', color: '#64748b' },
                ],
              });
              pdfCharts.drawHBarChart(doc, {
                title: 'Scope 3 Emissions by Category',
                data: Object.entries(s3Categories).map(([label, value]) => ({ label, value })),
                unit: 'tCO2e',
                color: pdfCharts.SCOPE_COLORS['Scope 3'],
                maxBars: 8,
              });
              doc.fontSize(10).font('Helvetica').fillColor('#333');
            } else if (disc.code === 'GRI 305-4') {
              // Intensity ONLY
              doc.text(`GHG Emissions Intensity: ${round(data.E1.intensity)} tCO2e per employee`);
              doc.text(`Total emissions: ${round(data.E1.totalEmissions)} tCO2e`);
              doc.text(`Denominator: ${data.E1.employees} employees (FTE)`);
              doc.moveDown(0.3);
              doc.fontSize(9).fillColor('#666');
              doc.text('Intensity ratio calculated as total Scope 1+2+3 emissions divided by full-time equivalent employee count.');

              // ── KPI visual: intensity card row
              doc.moveDown(0.5);
              pdfCharts.drawKpiRow(doc, {
                kpis: [
                  { label: 'GHG Intensity', value: round(data.E1.intensity).toLocaleString(), unit: 'tCO2e / employee', color: '#003700' },
                  { label: 'Total Emissions', value: round(data.E1.totalEmissions).toLocaleString(), unit: 'tCO2e (Scope 1+2+3)', color: '#0ea5e9' },
                  { label: 'Workforce', value: (data.E1.employees || 0).toLocaleString(), unit: 'employees (FTE)', color: '#8b5cf6' },
                ],
              });
              doc.fontSize(10).font('Helvetica').fillColor('#333');
            } else if (disc.code === 'GRI 305-5') {
              // Reduction — if no specific reduction data, explain
              doc.text('[Omission] GHG emissions reduction data is not yet tracked separately.');
              doc.moveDown(0.3);
              doc.fontSize(9).fillColor('#666');
              doc.text('Reason for omission: The organization has not yet established a formal emissions reduction tracking mechanism separate from year-over-year comparison. Plans are in place to implement reduction tracking aligned with SBTi commitments.');
            } else if (disc.code === 'GRI 302') {
              // Energy data
              const energyActivities = data.E1.activities.filter(a =>
                a.activityCategory?.toLowerCase().includes('electric') ||
                a.activityCategory?.toLowerCase().includes('energy') ||
                a.activityCategory?.toLowerCase().includes('combustion') ||
                a.unit?.toLowerCase().includes('kwh') ||
                a.unit?.toLowerCase().includes('mwh')
              );
              if (energyActivities.length > 0) {
                const totalKwh = energyActivities.reduce((s, a) => {
                  if (a.unit?.toLowerCase().includes('kwh')) return s + a.quantity;
                  if (a.unit?.toLowerCase().includes('mwh')) return s + a.quantity * 1000;
                  return s;
                }, 0);
                doc.text(`Total energy consumption: ${round(totalKwh)} kWh (${round(totalKwh * 0.0036)} GJ)`);
                doc.text(`Energy records: ${energyActivities.length}`);
                const byCat = {};
                energyActivities.forEach(a => { byCat[a.activitySubcat || a.activityCategory] = (byCat[a.activitySubcat || a.activityCategory] || 0) + a.quantity; });
                Object.entries(byCat).forEach(([cat, val]) => { doc.text(`  • ${cat}: ${round(val)} ${energyActivities[0]?.unit || 'kWh'}`, { indent: 15 }); });
              } else {
                doc.text(`${discData.count} emission activity records include energy-related data.`);
              }
              doc.moveDown(0.3);
              doc.fontSize(9).fillColor('#666');
              doc.text('Energy data is derived from utility invoices and activity records processed through the AI ETL pipeline.');

            // === ESRS / TCFD / ISSB — full emissions disclosure ===
            } else if (disc.code.includes('E1-6') || disc.code.includes('MT-b') || disc.code.includes('MET-1')) {
              doc.text(`Total GHG Emissions: ${round(data.E1.totalEmissions)} tCO2e`);
              doc.moveDown(0.2);
              Object.entries(data.E1.byScope).forEach(([scope, val]) => {
                doc.text(`  ${scope}: ${round(val)} tCO2e`, { indent: 15 });
              });
              if (data.E1.employees > 0) {
                doc.text(`GHG Intensity: ${round(data.E1.intensity)} tCO2e per employee (${data.E1.employees} employees)`);
              }
              doc.moveDown(0.3);

              // ── VISUAL: Donut chart of emissions by scope
              pdfCharts.drawDonutChart(doc, {
                title: 'Total GHG Emissions by Scope (tCO2e)',
                data: Object.entries(data.E1.byScope).map(([label, value]) => ({ label, value: round(value) })),
                colorMap: pdfCharts.SCOPE_COLORS,
              });
              doc.fontSize(10).font('Helvetica').fillColor('#333');

              // Energy consumption breakdown (fuel vs electricity)
              if (data.E1.totalEnergyMwh > 0) {
                doc.font('Helvetica-Bold').fillColor('#333').text('Energy Consumption:');
                doc.font('Helvetica');
                doc.text(`  Total: ${round(data.E1.totalEnergyMwh)} MWh`, { indent: 15 });
                if (data.E1.energyByType.electricity > 0) doc.text(`  Electricity: ${round(data.E1.energyByType.electricity)} MWh`, { indent: 15 });
                if (data.E1.energyByType.heating > 0) doc.text(`  District heating: ${round(data.E1.energyByType.heating)} MWh`, { indent: 15 });
                if (data.E1.energyByType.fuel > 0) doc.text(`  Fuel (diesel, petrol, LPG): ${round(data.E1.energyByType.fuel)} MWh`, { indent: 15 });
                if (data.E1.energyByType.other > 0) doc.text(`  Other energy sources: ${round(data.E1.energyByType.other)} MWh`, { indent: 15 });
                doc.moveDown(0.3);

                // ── VISUAL: Horizontal bar chart for energy mix
                const energyRows = [
                  { label: 'Electricity', value: round(data.E1.energyByType.electricity) },
                  { label: 'District heating', value: round(data.E1.energyByType.heating) },
                  { label: 'Fuel (diesel/petrol/LPG)', value: round(data.E1.energyByType.fuel) },
                  { label: 'Other energy', value: round(data.E1.energyByType.other) },
                ];
                pdfCharts.drawHBarChart(doc, {
                  title: 'Energy Consumption Mix (MWh)',
                  data: energyRows,
                  unit: 'MWh',
                  color: '#0ea5e9',
                  maxBars: 6,
                });
                doc.fontSize(10).font('Helvetica').fillColor('#333');
              }

              // Trend narrative
              if (data.E1.yoyChange !== null) {
                doc.font('Helvetica-Bold').fillColor('#333').text('Year-over-Year Trend:');
                doc.font('Helvetica');
                doc.text(yoyTrendSentence(data.E1.prevTotalEmissions, data.E1.totalEmissions, data.E1.yoyChange, y - 1, y, round));
                if (data.E1.yoyChange > 0) {
                  doc.text(`The increase may be attributed to expanded operations, increased business travel, or higher energy consumption. The organization is evaluating mitigation measures.`);
                } else {
                  doc.text(`The reduction reflects the organization's ongoing commitment to energy efficiency improvements, reduced business travel, and transition to lower-carbon energy sources.`);
                }
                doc.moveDown(0.3);

                // ── VISUAL: YoY comparison bars
                pdfCharts.drawYoYBars(doc, {
                  title: `Year-over-Year Comparison — Total GHG Emissions`,
                  prevLabel: `${y - 1}`,
                  currLabel: `${y}`,
                  prevValue: round(data.E1.prevTotalEmissions),
                  currValue: round(data.E1.totalEmissions),
                  unit: 'tCO2e',
                });
                doc.fontSize(10).font('Helvetica').fillColor('#333');
              }

              // Drivers
              doc.font('Helvetica-Bold').fillColor('#333').text('Emission Drivers:');
              doc.font('Helvetica');
              const topCats = {};
              data.E1.activities.forEach(a => { topCats[a.activityCategory] = (topCats[a.activityCategory] || 0) + (a.totalEmissions || 0); });
              const sortedCats = Object.entries(topCats).sort((a, b) => b[1] - a[1]);
              if (sortedCats.length > 0) {
                doc.text(`The primary sources of emissions are: ${sortedCats.slice(0, 3).map(([cat, val]) => `${cat} (${round(val)} tCO2e)`).join(', ')}. ` +
                  `These categories represent the key operational activities contributing to the organization's carbon footprint in the ${company.industry} sector.`);
              }
              doc.moveDown(0.3);

              // ── VISUAL: Top emission drivers bar chart
              pdfCharts.drawHBarChart(doc, {
                title: 'Top Emission Drivers by Activity Category',
                data: sortedCats.map(([label, value]) => ({ label, value: round(value) })),
                unit: 'tCO2e',
                color: '#ef4444',
                maxBars: 6,
              });

              doc.fontSize(9).fillColor('#666');
              doc.text('All emissions reported in tonnes of CO2 equivalent (tCO2e). Energy reported in MWh.');

            // === SBTi Targets ===
            } else if (disc.code.includes('E1-4') || disc.code.includes('MT-c') || disc.code.includes('MET-2')) {
              if (data.E1.targets.length > 0) {
                const t = data.E1.targets[0];
                doc.text(`Target: ${t.reductionPct}% reduction by ${t.targetYear}`);
                doc.text(`Base year: ${t.baseYear} | Method: ${t.method} | Scope: ${t.scope}`);
                if (t.description) doc.text(`Description: ${t.description}`);

                // ── VISUAL: Target progress gauge
                doc.moveDown(0.5);
                const yearsElapsed = Math.max(0, y - t.baseYear);
                const totalYears = Math.max(1, t.targetYear - t.baseYear);
                const timeProgressPct = Math.min(100, (yearsElapsed / totalYears) * 100);
                pdfCharts.drawProgressBar(doc, {
                  title: `SBTi Target Timeline — ${t.reductionPct}% reduction by ${t.targetYear}`,
                  label: `Elapsed: ${yearsElapsed} of ${totalYears} years (base ${t.baseYear} → target ${t.targetYear})`,
                  percent: timeProgressPct,
                  color: '#10b981',
                });
                doc.fontSize(10).font('Helvetica').fillColor('#333');
              } else {
                doc.text('[Omission] No formal decarbonization targets have been set.');
                doc.fontSize(9).fillColor('#666');
                doc.text('The organization is evaluating Science Based Targets (SBTi) commitment options.');
              }

            // === Energy consumption (ESRS E1-5) ===
            } else if (disc.code.includes('E1-5')) {
              const totalQty = data.E1.activities.reduce((s, a) => s + (a.quantity || 0), 0);
              doc.text(`Total activity quantity: ${round(totalQty)} (various units)`);
              doc.text(`Activity records: ${data.E1.activities.length}`);

            } else {
              doc.text(`${discData.count} data records available for this disclosure.`);
            }
          } else if (topicKey === 'S1' && data.S1) {
            if (disc.code.includes('S1-6') || disc.code.includes('405-1')) {
              doc.text(`Total employees: ${data.S1.totalEmployees}`);
              Object.entries(data.S1.byGender).forEach(([g, c]) => { doc.text(`  ${g}: ${c}`, { indent: 15 }); });

              // ── VISUAL: Workforce composition
              doc.moveDown(0.5);
              pdfCharts.drawKpiRow(doc, {
                kpis: [
                  { label: 'Total Employees', value: (data.S1.totalEmployees || 0).toLocaleString(), unit: 'headcount', color: '#003700' },
                  { label: 'Gender Categories', value: Object.keys(data.S1.byGender).length, unit: 'reported', color: '#8b5cf6' },
                  { label: 'Org Units Covered', value: data.S1.comp.length, unit: 'records', color: '#0ea5e9' },
                ],
              });
              pdfCharts.drawHBarChart(doc, {
                title: 'Workforce Composition by Gender',
                data: Object.entries(data.S1.byGender).map(([label, value]) => ({ label, value })),
                unit: 'employees',
                color: '#8b5cf6',
                maxBars: 6,
              });
              doc.fontSize(10).font('Helvetica').fillColor('#333');
            } else if (disc.code.includes('S1-13') || disc.code.includes('404-1')) {
              const hours = data.S1.train.reduce((s, r) => s + r.trainingHours, 0);
              const trained = data.S1.train.reduce((s, r) => s + r.employeeCount, 0);
              doc.text(`Total training hours: ${hours.toLocaleString()}`);
              doc.text(`Employees trained: ${trained}`);
              doc.text(`Average hours per employee: ${trained > 0 ? (hours / trained).toFixed(1) : 'N/A'}`);

              // ── VISUAL: Training KPI cards
              doc.moveDown(0.5);
              pdfCharts.drawKpiRow(doc, {
                kpis: [
                  { label: 'Total Training Hours', value: hours.toLocaleString(), unit: 'hours', color: '#0ea5e9' },
                  { label: 'Employees Trained', value: trained.toLocaleString(), unit: 'headcount', color: '#10b981' },
                  { label: 'Avg / Employee', value: trained > 0 ? (hours / trained).toFixed(1) : '—', unit: 'hours', color: '#8b5cf6' },
                ],
              });
              doc.fontSize(10).font('Helvetica').fillColor('#333');
            } else if (disc.code.includes('S1-9') || disc.code.includes('S1-12')) {
              const disabled = data.S1.div.filter(r => r.disabilityStatus === 'Yes').reduce((s, r) => s + r.count, 0);
              const disabilityRate = data.S1.totalEmployees > 0 ? ((disabled / data.S1.totalEmployees) * 100) : 0;
              doc.text(`Employees with disclosed disability: ${disabled}`);
              doc.text(`Disability rate: ${disabilityRate.toFixed(1)}%`);

              // ── VISUAL: Diversity progress bar
              doc.moveDown(0.5);
              pdfCharts.drawProgressBar(doc, {
                title: 'Disability Inclusion Rate',
                label: `${disabled} of ${data.S1.totalEmployees} employees with disclosed disability`,
                percent: disabilityRate,
                color: '#8b5cf6',
              });
              doc.fontSize(10).font('Helvetica').fillColor('#333');
            } else if (disc.code.includes('S1-14') || disc.code.includes('403-9')) {
              const total = data.S1.inj.reduce((s, r) => s + r.count, 0);
              const fatal = data.S1.inj.filter(r => r.injuryStatus === 'Fatal').reduce((s, r) => s + r.count, 0);
              doc.text(`Total workplace incidents: ${total}`);
              doc.text(`Fatalities: ${fatal}`);

              // ── VISUAL: Health & safety KPI cards
              doc.moveDown(0.5);
              pdfCharts.drawKpiRow(doc, {
                kpis: [
                  { label: 'Total Incidents', value: total.toLocaleString(), unit: 'recorded', color: '#f59e0b' },
                  { label: 'Fatalities', value: fatal.toLocaleString(), unit: 'reporting period', color: '#ef4444' },
                  { label: 'Non-fatal', value: (total - fatal).toLocaleString(), unit: 'incidents', color: '#64748b' },
                ],
              });
              doc.fontSize(10).font('Helvetica').fillColor('#333');
            } else if (disc.code.includes('401-1')) {
              const vol = data.S1.turn.filter(r => r.turnoverType === 'Voluntary').reduce((s, r) => s + r.count, 0);
              const invol = data.S1.turn.filter(r => r.turnoverType === 'Involuntary').reduce((s, r) => s + r.count, 0);
              const turnoverRate = data.S1.totalEmployees > 0 ? (((vol + invol) / data.S1.totalEmployees) * 100) : 0;
              doc.text(`Voluntary turnover: ${vol}`);
              doc.text(`Involuntary turnover: ${invol}`);
              doc.text(`Turnover rate: ${turnoverRate.toFixed(1)}%`);

              // ── VISUAL: Turnover breakdown
              doc.moveDown(0.5);
              pdfCharts.drawHBarChart(doc, {
                title: 'Employee Turnover Breakdown',
                data: [
                  { label: 'Voluntary', value: vol },
                  { label: 'Involuntary', value: invol },
                ],
                unit: 'employees',
                color: '#f59e0b',
                maxBars: 4,
              });
              pdfCharts.drawProgressBar(doc, {
                title: 'Overall Turnover Rate',
                label: `${vol + invol} of ${data.S1.totalEmployees} employees`,
                percent: turnoverRate,
                color: '#f59e0b',
              });
              doc.fontSize(10).font('Helvetica').fillColor('#333');
            } else {
              doc.text(`${discData.count} data records available.`);
            }
          } else if (topicKey === 'G1' && data.G1) {
            if (disc.code.includes('G1-4') || disc.code.includes('205-3') || disc.code.includes('206-1')) {
              doc.text(`Total business-conduct incidents: ${data.G1.totalIncidents}`);
              doc.text(`Confirmed (substantiated) incidents: ${data.G1.confirmedIncidents}`);
              doc.text(`Monetary fines and penalties: $${data.G1.totalFines.toLocaleString()}`);

              doc.moveDown(0.5);
              pdfCharts.drawKpiRow(doc, {
                kpis: [
                  { label: 'Total Incidents', value: data.G1.totalIncidents.toLocaleString(), unit: 'cases', color: '#f59e0b' },
                  { label: 'Confirmed', value: data.G1.confirmedIncidents.toLocaleString(), unit: 'substantiated', color: '#ef4444' },
                  { label: 'Fines & Penalties', value: `$${data.G1.totalFines.toLocaleString()}`, unit: 'USD', color: '#64748b' },
                ],
              });
              const typeEntries = Object.entries(data.G1.incidentsByType);
              if (typeEntries.length > 0) {
                pdfCharts.drawHBarChart(doc, {
                  title: 'Incidents by Type',
                  data: typeEntries.map(([label, value]) => ({ label, value })),
                  unit: 'cases',
                  color: '#d97706',
                  maxBars: 7,
                });
              }
              doc.fontSize(10).font('Helvetica').fillColor('#333');
            } else if (disc.code.includes('G1-3') || disc.code.includes('205-2')) {
              const antiCorruption = data.G1.training
                .filter(r => r.topic === 'Anti-corruption')
                .reduce((s, r) => s + r.employeesTrained, 0);
              doc.text(`People who completed ethics/compliance training: ${data.G1.totalTrained.toLocaleString()}`);
              doc.text(`Of which anti-corruption training: ${antiCorruption.toLocaleString()}`);

              doc.moveDown(0.5);
              pdfCharts.drawKpiRow(doc, {
                kpis: [
                  { label: 'People Trained', value: data.G1.totalTrained.toLocaleString(), unit: 'headcount', color: '#0ea5e9' },
                  { label: 'Anti-corruption', value: antiCorruption.toLocaleString(), unit: 'headcount', color: '#10b981' },
                  { label: 'Training Records', value: data.G1.training.length, unit: 'entries', color: '#8b5cf6' },
                ],
              });
              doc.fontSize(10).font('Helvetica').fillColor('#333');
            } else if (disc.code.includes('G1-1')) {
              doc.text(`Governance policies in place: ${data.G1.policiesInPlace} of ${data.G1.policies.length} registered`);
              data.G1.policies.slice(0, 8).forEach(p => {
                doc.text(`  • ${p.policyName} (${p.policyArea}) — ${p.status}${p.boardApproved === 'Yes' ? ', board approved' : ''}`, { indent: 15 });
              });
            } else if (disc.code.includes('2-9') || disc.code.includes('GOV')) {
              const femaleBoard = data.G1.boardByGender['Female'] || 0;
              doc.text(`Board size: ${data.G1.boardSize} members`);
              doc.text(`Women on board: ${data.G1.boardSize > 0 ? Math.round((femaleBoard / data.G1.boardSize) * 100) : 0}%`);
              doc.text(`Independent members: ${data.G1.boardSize > 0 ? Math.round((data.G1.independentCount / data.G1.boardSize) * 100) : 0}%`);

              const genderEntries = Object.entries(data.G1.boardByGender);
              if (genderEntries.length > 0) {
                doc.moveDown(0.5);
                pdfCharts.drawHBarChart(doc, {
                  title: 'Board Composition by Gender',
                  data: genderEntries.map(([label, value]) => ({ label, value })),
                  unit: 'members',
                  color: '#d97706',
                  maxBars: 5,
                });
              }
              doc.fontSize(10).font('Helvetica').fillColor('#333');
            } else {
              doc.text(`${discData.count} data records available.`);
            }
          }
        } else if (disc.type === 'narrative') {
          const approvedDraft = approvedDrafts[disc.code];
          if (approvedDraft) {
            // ISO Bridge: human-approved narrative content replaces the placeholder
            const body = approvedDraft.editedText || approvedDraft.draftText;
            doc.fontSize(10).font('Helvetica').fillColor('#333');
            doc.text(body);
            const cites = Array.isArray(approvedDraft.citations) ? approvedDraft.citations : [];
            const citeText = cites.length > 0
              ? cites.map((c) => `ISO ${c.isoStandard} clause ${c.clause}${c.sourceFileName ? ` — ${c.sourceFileName}` : ''}`).join('; ')
              : 'ISO management-system documentation';
            doc.moveDown(0.2);
            doc.fontSize(8).font('Helvetica-Oblique').fillColor('#888');
            doc.text(`Source: ${citeText}. Drafted from ISO evidence via the ISO Bridge and approved by a human reviewer.`);
            doc.font('Helvetica');
          } else {
            doc.fontSize(10).font('Helvetica-Oblique').fillColor('#555');
            doc.text(`This disclosure requires qualitative narrative about: ${disc.name.toLowerCase()}.`);
            doc.moveDown(0.2);
            doc.fontSize(9).fillColor('#888');
            doc.text(`[To be completed: Provide details on policies, actions, targets, and governance related to ${disc.name.toLowerCase()}. Include context on why this topic is material, what measures are in place, and what outcomes have been achieved.]`);
          }
        } else {
          // Missing metric data — provide standard-compliant omission
          doc.fontSize(10).font('Helvetica').fillColor('#b45309');
          doc.text(`[Omission] Quantitative data for this disclosure is not available for the reporting period ${y}.`);
          doc.moveDown(0.2);
          doc.fontSize(9).fillColor('#888');
          doc.text(`Reason: Data collection processes for "${disc.name}" have not yet been established or the relevant data sources have not been connected. The organization intends to disclose this metric in future reporting periods as data systems mature.`);
        }

        doc.fillColor('#333').font('Helvetica'); // reset
        doc.moveDown(1);
      }

      sectionNum++;
    }

    // ═══════════════ STANDARD INDEX ═══════════════
    doc.addPage();
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#003700').text(`${sectionNum}. ${std.name} Index`);
    doc.moveDown(1);
    doc.fontSize(10).font('Helvetica').fillColor('#333');

    // Header
    doc.font('Helvetica-Bold');
    doc.text('Code', 50, doc.y, { width: 80, continued: false });

    doc.moveDown(0.5);
    doc.font('Helvetica');

    for (const topicKey of selectedTopics) {
      const topic = std.topics[topicKey];
      if (!topic) continue;

      doc.font('Helvetica-Bold').fillColor('#003700').text(`${topic.code} — ${topic.name}`);
      doc.moveDown(0.3);
      doc.font('Helvetica').fillColor('#333');

      for (const disc of topic.disclosures) {
        if (doc.y > 730) doc.addPage();
        const discResult = validation.topics.find(t => t.key === topicKey)?.disclosures.find(d => d.code === disc.code);
        const status = discResult?.hasData ? '✓ Reported' : disc.type === 'narrative' ? '○ Narrative pending' : '✗ No data';
        doc.text(`  ${disc.code}  —  ${disc.name}  —  ${status}`);
      }
      doc.moveDown(0.5);
    }

    // Footer
    doc.moveDown(2);
    doc.fontSize(8).fillColor('#999').text(`This report was generated by Triple I ESG Portal on ${new Date().toISOString().split('T')[0]}.`, { align: 'center' });

    doc.end();

    // ─── Deduct credits + record cost log entry ────────────────────────
    // Uses the same estimate as the up-front check, so the user is charged
    // exactly what they confirmed.  Runs after doc.end() so we don't deduct
    // if PDF assembly threw earlier.
    try {
      await deductCredits(
        req.user.companyId,
        req.user.id,
        reportEstimate.credits,
        'REPORT_GEN',
        `${standard} report for ${y} — ${reportEstimate.breakdown.topicsWithData} topic(s), ${reportEstimate.breakdown.disclosuresWithData} disclosures — ${reportEstimate.credits} credits`,
        null,
      );
      await logCost({
        companyId: req.user.companyId,
        userId: req.user.id,
        operation: 'REPORT_GEN',
        model: null,
        inputTokens: 0,
        outputTokens: 0,
        durationMs: null,
        relatedId: null,
        metadata: {
          standard,
          year: y,
          topics: selectedTopics,
          format: fmt,
          credits: reportEstimate.credits,
          breakdown: reportEstimate.breakdown,
        },
        estimatedCostOverride: reportEstimate.estimatedCostUSD,
      });
    } catch (creditErr) {
      // Don't fail the response — the PDF is already streamed to the client.
      console.error('[Report] post-generation credit/cost logging failed:', creditErr.message);
    }

    logActivity(req.user.id, req.user.companyId, 'GENERATE_REPORT',
      `Generated ${standard} report for ${y} with topics: ${selectedTopics.join(', ')} — ${reportEstimate.credits} credits`,
      { standard, year: y, topics: selectedTopics, format: fmt, credits: reportEstimate.credits }, req.ip
    );

  } catch (err) {
    console.error('Report generation error:', err);
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

module.exports = router;
