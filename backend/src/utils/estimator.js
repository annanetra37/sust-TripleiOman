'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// estimator.js
// Centralised estimator that predicts the USD cost of a user action and
// converts it to credits.  Single source of truth for "how many credits will
// this cost" — used by both the preview endpoints (shown to the user before
// they confirm) and the actual deduction path (after an action runs).
//
//   credits = ceil(estimatedCostUSD × CREDIT_MULTIPLIER)
//
// The multiplier is fixed at 400 per product spec: $0.10 ⇒ 40 credits.
// ─────────────────────────────────────────────────────────────────────────────

const { MODEL_PRICING } = require('./costTracker');

const CREDIT_MULTIPLIER = 400;
const DEFAULT_MODEL = 'claude-sonnet-5';

// Per-action token assumptions, tuned against real Claude usage in aiEtl.js
// and the doc-extract pipeline.  These drive the estimate that users see
// before they confirm an action.
const DOC_EXTRACT_TOKENS = {
  // Vision mode: PDF/image sent to Claude as base64.  Dominated by input.
  vision: { input: 25000, output: 2000 },
  // Text mode: locally-extracted text sent as plain prompt.  Much cheaper.
  text:   { input: 4000,  output: 1500 },
};

const EXCEL_ETL_TOKENS = {
  schemaMap:  { input: 3500, output: 1500 }, // once per sheet
  cleanBatch: { input: 5000, output: 2500 }, // per batch of 50 rows
  batchSize:  50,
};

// ISO Bridge actions (spec §10).  Coverage computation is pure registry
// math (no model call) and is deliberately kept free.
const ISO_BRIDGE_TOKENS = {
  certExtract:     { input: 25000, output: 800 },  // vision-mode certificate PDF
  disclosureDraft: { input: 9000,  output: 1200 }, // per disclosure drafted (text mode)
  reverseExport:   { input: 7000,  output: 1800 }, // per theme pack (text mode)
};

// Report generation is pure PDFKit (no AI) — charged as a flat base plus
// small increments per topic / disclosure to reflect rendering cost.
const REPORT_COSTS = {
  base:                   0.010,  // USD — cover page, TOC, methodology
  perTopicWithData:       0.005,  // per selected topic with any data
  perDisclosureWithData:  0.002,  // per disclosure that will render metrics
  perDisclosureMissing:   0.0005, // per disclosure rendered as an omission
  perNarrative:           0.001,  // per narrative section
};

function tokenCostUSD(model, inputTokens, outputTokens) {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING[DEFAULT_MODEL];
  const inUsd  = ((inputTokens  || 0) / 1_000_000) * pricing.input;
  const outUsd = ((outputTokens || 0) / 1_000_000) * pricing.output;
  return inUsd + outUsd;
}

function usdToCredits(usd) {
  if (!usd || usd <= 0) return 0;
  return Math.max(1, Math.ceil(usd * CREDIT_MULTIPLIER));
}

function round6(n) { return Math.round((Number(n) || 0) * 1_000_000) / 1_000_000; }

// ─── Doc extract (vision-heavy) ──────────────────────────────────────────────
//  params: { fileCount, assumeVision = true }
//  TOTALS across files — the point of this helper is that multi-doc actions
//  are charged as a sum of per-doc estimates.
function estimateDocExtract({ fileCount = 1, assumeVision = true } = {}) {
  const n = Math.max(1, parseInt(fileCount, 10) || 1);
  const tok = assumeVision ? DOC_EXTRACT_TOKENS.vision : DOC_EXTRACT_TOKENS.text;
  const perDocUsd = tokenCostUSD(DEFAULT_MODEL, tok.input, tok.output);
  const totalUsd = perDocUsd * n;
  return {
    estimatedCostUSD: round6(totalUsd),
    credits: usdToCredits(totalUsd),
    breakdown: {
      fileCount: n,
      perDocumentUSD: round6(perDocUsd),
      perDocumentCredits: usdToCredits(perDocUsd),
      mode: assumeVision ? 'vision' : 'text',
      model: DEFAULT_MODEL,
    },
  };
}

// ─── Excel AI ETL (schema-map + clean-in-batches) ────────────────────────────
//  params: { rowCount, sheetCount = 1 }
//  If rowCount is unknown, callers may pass { fileSizeBytes } and we fall back
//  to a heuristic (~200 bytes per row for typical ESG workbooks).
function estimateExcelETL({ rowCount, sheetCount = 1, fileSizeBytes } = {}) {
  let rows = parseInt(rowCount, 10);
  if (!(rows > 0)) {
    if (fileSizeBytes > 0) rows = Math.max(1, Math.ceil(fileSizeBytes / 200));
    else rows = 1;
  }
  const sheets = Math.max(1, parseInt(sheetCount, 10) || 1);

  const schemaUsd = tokenCostUSD(
    DEFAULT_MODEL,
    EXCEL_ETL_TOKENS.schemaMap.input,
    EXCEL_ETL_TOKENS.schemaMap.output,
  ) * sheets;

  const batches = Math.ceil(rows / EXCEL_ETL_TOKENS.batchSize);
  const cleanUsd = tokenCostUSD(
    DEFAULT_MODEL,
    EXCEL_ETL_TOKENS.cleanBatch.input,
    EXCEL_ETL_TOKENS.cleanBatch.output,
  ) * batches;

  const totalUsd = schemaUsd + cleanUsd;
  return {
    estimatedCostUSD: round6(totalUsd),
    credits: usdToCredits(totalUsd),
    breakdown: {
      rowCount: rows,
      sheetCount: sheets,
      batches,
      schemaMapUSD: round6(schemaUsd),
      cleanUSD: round6(cleanUsd),
      rowsUsedHeuristic: !(parseInt(rowCount, 10) > 0),
      model: DEFAULT_MODEL,
    },
  };
}

// ─── Report generation ───────────────────────────────────────────────────────
//  params: { validation }  — the object returned by validateReportData()
//  The estimate scales with data availability (more data ⇒ bigger report ⇒
//  more to render) and with the number of selected topics.
function estimateReport({ validation } = {}) {
  let topicsWithData = 0;
  let disclosuresWithData = 0;
  let disclosuresMissing = 0;
  let narrativeCount = 0;

  const topics = (validation && validation.topics) || [];
  for (const t of topics) {
    let anyData = false;
    for (const d of (t.disclosures || [])) {
      if (d.isNarrative) narrativeCount++;
      else if (d.hasData) { disclosuresWithData++; anyData = true; }
      else disclosuresMissing++;
    }
    if (anyData) topicsWithData++;
  }

  const usd =
    REPORT_COSTS.base +
    REPORT_COSTS.perTopicWithData      * topicsWithData +
    REPORT_COSTS.perDisclosureWithData * disclosuresWithData +
    REPORT_COSTS.perDisclosureMissing  * disclosuresMissing +
    REPORT_COSTS.perNarrative          * narrativeCount;

  return {
    estimatedCostUSD: round6(usd),
    credits: usdToCredits(usd),
    breakdown: {
      topicCount: topics.length,
      topicsWithData,
      disclosuresWithData,
      disclosuresMissing,
      narrativeCount,
      baseUSD: REPORT_COSTS.base,
    },
  };
}

// ─── ISO Bridge actions (spec §10) ───────────────────────────────────────────
//  CERT_EXTRACT — vision-mode per certificate; DISCLOSURE_DRAFT — text-mode per
//  disclosure; REVERSE_EXPORT — text-mode per theme pack.  Coverage is free.
function estimateCertExtract({ fileCount = 1 } = {}) {
  const n = Math.max(1, parseInt(fileCount, 10) || 1);
  const tok = ISO_BRIDGE_TOKENS.certExtract;
  const perDocUsd = tokenCostUSD(DEFAULT_MODEL, tok.input, tok.output);
  const totalUsd = perDocUsd * n;
  return {
    estimatedCostUSD: round6(totalUsd),
    credits: usdToCredits(totalUsd),
    breakdown: { fileCount: n, perDocumentUSD: round6(perDocUsd), perDocumentCredits: usdToCredits(perDocUsd), mode: 'vision', model: DEFAULT_MODEL },
  };
}

function estimateDisclosureDraft({ disclosureCount = 1 } = {}) {
  const n = Math.max(1, parseInt(disclosureCount, 10) || 1);
  const tok = ISO_BRIDGE_TOKENS.disclosureDraft;
  const perUsd = tokenCostUSD(DEFAULT_MODEL, tok.input, tok.output);
  const totalUsd = perUsd * n;
  return {
    estimatedCostUSD: round6(totalUsd),
    credits: usdToCredits(totalUsd),
    breakdown: { disclosureCount: n, perDisclosureUSD: round6(perUsd), perDisclosureCredits: usdToCredits(perUsd), mode: 'text', model: DEFAULT_MODEL },
  };
}

function estimateReverseExport({ themeCount = 1 } = {}) {
  const n = Math.max(1, parseInt(themeCount, 10) || 1);
  const tok = ISO_BRIDGE_TOKENS.reverseExport;
  const perUsd = tokenCostUSD(DEFAULT_MODEL, tok.input, tok.output);
  const totalUsd = perUsd * n;
  return {
    estimatedCostUSD: round6(totalUsd),
    credits: usdToCredits(totalUsd),
    breakdown: { themeCount: n, perThemeUSD: round6(perUsd), perThemeCredits: usdToCredits(perUsd), mode: 'text', model: DEFAULT_MODEL },
  };
}

module.exports = {
  CREDIT_MULTIPLIER,
  DEFAULT_MODEL,
  DOC_EXTRACT_TOKENS,
  EXCEL_ETL_TOKENS,
  ISO_BRIDGE_TOKENS,
  REPORT_COSTS,
  tokenCostUSD,
  usdToCredits,
  estimateDocExtract,
  estimateExcelETL,
  estimateReport,
  estimateCertExtract,
  estimateDisclosureDraft,
  estimateReverseExport,
};
