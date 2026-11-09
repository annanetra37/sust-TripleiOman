'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// benchmarkEngine.js — anonymous benchmark cohort infrastructure (PCF-08)
//
// Aggregates opted-in companies' data into per-sector × KPI × region cohort
// statistics (p25 / p50 / p75) with two privacy guarantees:
//
//   1. k-anonymity (K_MIN = 10)
//      A cohort row is only emitted when at least K_MIN distinct companies
//      contribute.  The UI never sees anything smaller.
//
//   2. Differential privacy (Laplace, ε = 1.0) on p50
//      When cohortSize < 50, we add Laplace-distributed noise to the median
//      so a single outlier contributor can't leak identifiable information.
//
// The engine recomputes cohorts from the authoritative source tables
// (PcfCalculation, FE1EmissionActivityData, FS1WorkforceComposition) on
// each invocation.  It's idempotent — safe to re-run.
//
// Current KPIs seeded:
//   - PCF_TOTAL        (kgCO2e, from latest PcfCalculation per product)
//   - PCF_PRIMARY_PCT  (%, from latest PcfCalculation)
//   - E1_TOTAL_TCO2E   (tCO2e, rolled up across all org units)
//   - E1_INTENSITY     (tCO2e / employee)
//
// More KPIs can be added by pushing to the KPI_REGISTRY below — no code
// changes elsewhere.
// ─────────────────────────────────────────────────────────────────────────────

const prisma = require('../config/prisma');

const K_MIN = 10;              // k-anonymity threshold
const DP_EPSILON = 1.0;         // differential privacy budget
const DP_THRESHOLD = 50;        // add noise when cohortSize < this

// Laplace noise sample — used to fuzz p50 for small cohorts.
function laplaceNoise(scale) {
  const u = Math.random() - 0.5;
  return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
}

function percentile(sortedVals, p) {
  if (sortedVals.length === 0) return 0;
  const idx = (p / 100) * (sortedVals.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedVals[lo];
  return sortedVals[lo] + (sortedVals[hi] - sortedVals[lo]) * (idx - lo);
}

// Apply privacy transforms — returns { p25, p50, p75 } post-processing.
function finalise({ values, sensitivity }) {
  const sorted = [...values].sort((a, b) => a - b);
  const p25 = percentile(sorted, 25);
  let p50 = percentile(sorted, 50);
  const p75 = percentile(sorted, 75);

  // Add Laplace noise to p50 when the cohort is small (privacy guard).
  if (values.length < DP_THRESHOLD && sensitivity > 0) {
    const scale = sensitivity / DP_EPSILON;
    p50 = Math.max(0, p50 + laplaceNoise(scale));
  }

  return {
    p25: Math.round(p25 * 10000) / 10000,
    p50: Math.round(p50 * 10000) / 10000,
    p75: Math.round(p75 * 10000) / 10000,
  };
}

// ─── KPI registry ───────────────────────────────────────────────────────────
// Each entry computes a single numeric value per opted-in company.  Returns
// null if the company has no data to contribute for this KPI.
const KPI_REGISTRY = [
  {
    code: 'PCF_TOTAL',
    unit: 'kgCO2e',
    scope: 'product',           // one value per product (not per company)
    perProduct: true,
    compute: async (companyId) => {
      // Grab the latest PcfCalculation per product for this company.
      const products = await prisma.product.findMany({
        where: { companyId },
        include: {
          calculations: { orderBy: { runAt: 'desc' }, take: 1, select: { totalKgCo2e: true } },
        },
      });
      const vals = products
        .filter((p) => p.calculations[0])
        .map((p) => ({ key: p.sector, value: p.calculations[0].totalKgCo2e }));
      return vals;
    },
  },
  {
    code: 'PCF_PRIMARY_PCT',
    unit: '%',
    scope: 'product',
    perProduct: true,
    compute: async (companyId) => {
      const products = await prisma.product.findMany({
        where: { companyId },
        include: {
          calculations: { orderBy: { runAt: 'desc' }, take: 1, select: { primaryDataPct: true } },
        },
      });
      return products
        .filter((p) => p.calculations[0])
        .map((p) => ({ key: p.sector, value: p.calculations[0].primaryDataPct * 100 }));
    },
  },
  {
    code: 'E1_TOTAL_TCO2E',
    unit: 'tCO2e',
    scope: 'company',
    perProduct: false,
    compute: async (companyId) => {
      const agg = await prisma.fE1EmissionActivityData.aggregate({
        where: { companyId },
        _sum: { totalEmissions: true },
      });
      const total = agg._sum.totalEmissions || 0;
      if (total <= 0) return [];
      return [{ key: 'ALL', value: total }];
    },
  },
  {
    code: 'E1_INTENSITY',
    unit: 'tCO2e/employee',
    scope: 'company',
    perProduct: false,
    compute: async (companyId) => {
      const [emAgg, empAgg] = await Promise.all([
        prisma.fE1EmissionActivityData.aggregate({ where: { companyId }, _sum: { totalEmissions: true } }),
        prisma.fS1WorkforceComposition.aggregate({ where: { companyId }, _sum: { employeeCount: true } }),
      ]);
      const em = emAgg._sum.totalEmissions || 0;
      const emp = empAgg._sum.employeeCount || 0;
      if (em <= 0 || emp <= 0) return [];
      return [{ key: 'ALL', value: em / emp }];
    },
  },
];

// ─── Recompute all cohorts ──────────────────────────────────────────────────
// Reads every opted-in company, evaluates each KPI, groups values by
// (sectorKey, kpiCode, region), filters by K_MIN, and upserts the resulting
// statistics.  Also deletes cohorts that no longer meet the threshold.
async function recomputeCohorts() {
  const companies = await prisma.company.findMany({
    where: { benchmarkOptIn: true },
    select: { id: true, country: true, regionsOfOp: true, sectorSelection: { select: { sectorKey: true } } },
  });

  // Group values by (sectorKey || 'generic', kpiCode, region).
  // Each entry collects one value per contributing company — never more
  // than one so a single company can't skew the cohort.
  const groups = new Map();

  for (const kpi of KPI_REGISTRY) {
    for (const company of companies) {
      const sectorKey = company.sectorSelection?.sectorKey || 'generic';
      const regions = [company.country || 'GLO', 'GLO']; // always bucket into GLO too
      const values = await kpi.compute(company.id);
      if (!values || values.length === 0) continue;

      // If the KPI is per-product, aggregate to a single value per company
      // (we use the median across that company's products to avoid one
      // company with 50 SKUs dominating the cohort).
      const companyValue = kpi.perProduct
        ? medianOf(values.map((v) => v.value))
        : values[0].value;

      for (const region of regions) {
        const key = `${sectorKey}::${kpi.code}::${region}`;
        if (!groups.has(key)) groups.set(key, { sectorKey, kpiCode: kpi.code, region, unit: kpi.unit, values: [], companies: new Set() });
        const g = groups.get(key);
        if (!g.companies.has(company.id)) {
          g.companies.add(company.id);
          g.values.push(companyValue);
        }
      }
    }
  }

  // Emit cohort rows for groups meeting K_MIN.
  const updates = [];
  const kept = new Set();
  for (const [, g] of groups) {
    if (g.values.length < K_MIN) continue;
    const sensitivity = Math.max(...g.values) - Math.min(...g.values);
    const stats = finalise({ values: g.values, sensitivity });
    kept.add(`${g.sectorKey}::${g.kpiCode}::${g.region}`);
    updates.push(
      prisma.benchmarkCohort.upsert({
        where: { sectorKey_kpiCode_region: { sectorKey: g.sectorKey, kpiCode: g.kpiCode, region: g.region } },
        create: { sectorKey: g.sectorKey, kpiCode: g.kpiCode, region: g.region, cohortSize: g.values.length, unit: g.unit, ...stats },
        update: { cohortSize: g.values.length, unit: g.unit, ...stats, lastUpdatedAt: new Date() },
      }),
    );
  }
  await Promise.all(updates);

  // Delete any previously-stored cohort that no longer meets K_MIN.
  const existing = await prisma.benchmarkCohort.findMany({ select: { sectorKey: true, kpiCode: true, region: true } });
  const stale = existing.filter((c) => !kept.has(`${c.sectorKey}::${c.kpiCode}::${c.region}`));
  if (stale.length > 0) {
    await prisma.benchmarkCohort.deleteMany({
      where: { OR: stale.map((c) => ({ sectorKey: c.sectorKey, kpiCode: c.kpiCode, region: c.region })) },
    });
  }

  return {
    contributingCompanies: companies.length,
    kpisEvaluated: KPI_REGISTRY.length,
    cohortsEmitted: kept.size,
    cohortsRemoved: stale.length,
  };
}

function medianOf(arr) {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

// ─── Percentile-rank lookup for a specific company value ────────────────────
// Returns { percentile, cohortSize, p25, p50, p75 } or null if:
//   - company is not opted-in (not allowed to see benchmarks), or
//   - the cohort doesn't exist or is below K_MIN
async function peerPercentile({ companyId, sectorKey, kpiCode, region, value }) {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { benchmarkOptIn: true } });
  if (!company?.benchmarkOptIn) return null;

  const cohort = await prisma.benchmarkCohort.findUnique({
    where: { sectorKey_kpiCode_region: { sectorKey, kpiCode, region: region || 'GLO' } },
  });
  if (!cohort || cohort.cohortSize < K_MIN) return null;

  // Rough percentile from the quartile anchors — we don't store the raw
  // distribution for privacy.  Linear interpolation between anchors.
  const { p25, p50, p75 } = cohort;
  let pct;
  if (value <= p25) pct = (value / Math.max(p25, 1e-9)) * 25;
  else if (value <= p50) pct = 25 + ((value - p25) / Math.max(p50 - p25, 1e-9)) * 25;
  else if (value <= p75) pct = 50 + ((value - p50) / Math.max(p75 - p50, 1e-9)) * 25;
  else pct = 75 + Math.min(25, ((value - p75) / Math.max(p75, 1e-9)) * 25);
  pct = Math.max(0, Math.min(100, pct));

  return {
    percentile: Math.round(pct),
    cohortSize: cohort.cohortSize,
    p25, p50, p75,
    unit: cohort.unit,
    lastUpdatedAt: cohort.lastUpdatedAt,
  };
}

module.exports = {
  recomputeCohorts,
  peerPercentile,
  KPI_REGISTRY,
  K_MIN,
  DP_EPSILON,
  DP_THRESHOLD,
};
