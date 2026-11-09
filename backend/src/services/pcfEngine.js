'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// pcfEngine.js — LCA calculation engine with Monte Carlo uncertainty (PCF-03)
//
// Pure-Node compute service.  Takes a Product + its BOM + ProcessSteps and
// returns a PcfCalculation.  Lite version uses a cradle-to-gate boundary
// (stages A1–A3).
//
// Monte Carlo: 1,000 iterations.  Each factor value is resampled from
// N(mean, std) where std = EmissionFactor.uncertaintyStd (falls back to
// 10% of mean if null).  Output: p5 / p50 / p95.
//
// Performance budget: < 2 s for a 100-row BOM (all in-process, no DB
// round-trip per BOM item — batch factor lookups).
// ─────────────────────────────────────────────────────────────────────────────

const prisma = require('../config/prisma');

const ENGINE_VERSION = '1.0.0';
const MONTE_CARLO_ITERATIONS = 1000;

// Box-Muller transform — generate a normally-distributed random number.
function normalRandom(mean, std) {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(0, mean + z * std);
}

// Percentile from a sorted array.
function percentile(sorted, p) {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Run the LCA calculation for a product.
 *
 * @param {string} productId — UUID
 * @param {object} [overrides] — optional scenario overrides for simulation.
 *   When present, the engine re-reads the product but applies these changes
 *   in-memory before computing.  Nothing is persisted.
 *
 *   overrides = {
 *     factorSwaps:     [{ bomId, newFactorId }],
 *     materialSwaps:   [{ bomId, newMaterialClass }],
 *     scrapRateChanges:[{ bomId, newScrapRatePct }],
 *     processOverrides:[{ processId, emissionsKg }],
 *     regionSwap:      { fromRegion, toRegion }      // global region swap
 *   }
 *
 * @returns {object} PcfCalculation-shaped result (not yet persisted)
 */
async function calculatePcf(productId, overrides = null) {
  // ─── 1. Load product + BOM + components + process steps ───────
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      boms: { include: { component: true } },
      processes: true,
    },
  });

  if (!product) throw new Error('Product not found.');
  if (product.boms.length === 0) throw new Error('Product has no BOM items. Upload a BOM first.');

  // ─── 2. Batch-load all needed emission factors ────────────────
  // Start with every factor already chosen on the BOM, plus any extra
  // factors referenced by the scenario overrides.
  const overrideFactorIds = (overrides?.factorSwaps || []).map((s) => s.newFactorId).filter(Boolean);
  const factorIds = [...new Set([
    ...product.boms.map((b) => b.chosenFactorId).filter(Boolean),
    ...overrideFactorIds,
  ])];
  const factors = factorIds.length > 0
    ? await prisma.emissionFactor.findMany({ where: { id: { in: factorIds } } })
    : [];
  const factorMap = new Map(factors.map((f) => [f.id, f]));

  // Index factors by materialClass so we can resolve material swaps and
  // fallbacks for items without a chosen factor in one map lookup.
  const byClass = new Map();
  for (const f of factors) {
    if (f.materialClass && !byClass.has(f.materialClass)) byClass.set(f.materialClass, f);
  }

  // For BOM items without a chosen factor, try a materialClass lookup.
  // Also pre-load any new material classes referenced in overrides.
  const classesNeeded = new Set([
    ...product.boms
      .filter((b) => !b.chosenFactorId || !factorMap.has(b.chosenFactorId))
      .map((b) => b.component?.materialClass)
      .filter(Boolean),
    ...(overrides?.materialSwaps || []).map((s) => s.newMaterialClass).filter(Boolean),
  ]);

  if (classesNeeded.size > 0) {
    const fallbacks = await prisma.emissionFactor.findMany({
      where: { materialClass: { in: [...classesNeeded] } },
      orderBy: { vintage: 'desc' },
    });
    for (const fb of fallbacks) {
      if (!byClass.has(fb.materialClass)) byClass.set(fb.materialClass, fb);
      if (!factorMap.has(fb.id)) factorMap.set(fb.id, fb);
      // Also index by class so a chosenFactorId miss can fall back here.
      if (!factorMap.has(fb.materialClass)) factorMap.set(fb.materialClass, fb);
    }
  }

  // If a regionSwap is requested, pre-load the toRegion variants for every
  // material class in play (lets us re-run assembly "in Vietnam vs the EU").
  if (overrides?.regionSwap?.toRegion) {
    const classList = [...byClass.keys()];
    if (classList.length > 0) {
      const regionFactors = await prisma.emissionFactor.findMany({
        where: { materialClass: { in: classList }, region: overrides.regionSwap.toRegion },
        orderBy: { vintage: 'desc' },
      });
      for (const rf of regionFactors) {
        const key = `${rf.materialClass}::${rf.region}`;
        if (!factorMap.has(key)) factorMap.set(key, rf);
      }
    }
  }

  // ─── 3. Build per-item factor assignments ─────────────────────
  // Index overrides by bomId for O(1) lookup.
  const factorSwapByBom = new Map((overrides?.factorSwaps || []).map((s) => [s.bomId, s.newFactorId]));
  const materialSwapByBom = new Map((overrides?.materialSwaps || []).map((s) => [s.bomId, s.newMaterialClass]));
  const scrapSwapByBom = new Map((overrides?.scrapRateChanges || []).map((s) => [s.bomId, parseFloat(s.newScrapRatePct)]));
  const regionSwap = overrides?.regionSwap || null;

  const items = product.boms.map((bom) => {
    // Resolve effective material class (may be overridden).
    const effMaterialClass = materialSwapByBom.has(bom.id)
      ? materialSwapByBom.get(bom.id)
      : (bom.component?.materialClass || null);

    // Resolve effective factor in priority order:
    //   1. explicit factor swap (newFactorId)
    //   2. region swap lookup (<materialClass>::<toRegion>)
    //   3. material swap or original material class
    //   4. bom.chosenFactorId
    let factor = null;
    if (factorSwapByBom.has(bom.id)) {
      factor = factorMap.get(factorSwapByBom.get(bom.id));
    }
    if (!factor && regionSwap?.toRegion && effMaterialClass) {
      factor = factorMap.get(`${effMaterialClass}::${regionSwap.toRegion}`);
    }
    if (!factor && materialSwapByBom.has(bom.id)) {
      factor = byClass.get(effMaterialClass) || null;
    }
    if (!factor && bom.chosenFactorId) {
      factor = factorMap.get(bom.chosenFactorId) || null;
    }
    if (!factor && effMaterialClass) {
      factor = factorMap.get(effMaterialClass) || byClass.get(effMaterialClass) || null;
    }

    return {
      bomId: bom.id,
      componentId: bom.componentId,
      componentName: bom.component?.name || '?',
      materialClass: effMaterialClass || '?',
      isPrimary: bom.component?.primaryDataFlag || false,
      quantity: bom.quantity || 0,
      scrapRatePct: scrapSwapByBom.has(bom.id) ? scrapSwapByBom.get(bom.id) : (bom.scrapRatePct || 0),
      lifecycleStage: bom.lifecycleStage || 'A1',
      factorId: factor?.id || null,
      factorValue: factor?.value || 0,
      factorStd: factor?.uncertaintyStd || (factor?.value ? factor.value * 0.10 : 0),
      factorUnit: factor?.unit || '?',
      factorSource: factor?.source || '?',
    };
  });

  // ─── 4. Add process-step emissions ────────────────────────────
  // ProcessSteps represent site-level energy/waste/water inputs that
  // aren't captured via the BOM (e.g., assembly energy at A3).  Simulations
  // may override individual process emissionsKg values.
  const processOverrideById = new Map(
    (overrides?.processOverrides || []).map((p) => [p.processId, parseFloat(p.emissionsKg) || 0]),
  );
  const processEmissions = {};
  for (const ps of product.processes) {
    const stage = ps.lifecycleStage || 'A3';
    const kg = processOverrideById.has(ps.id) ? processOverrideById.get(ps.id) : (ps.emissionsKg || 0);
    processEmissions[stage] = (processEmissions[stage] || 0) + kg;
  }

  // ─── 5. Deterministic (p50) calculation ───────────────────────
  const byStage = {};
  const byComponent = [];
  let totalKgCo2e = 0;
  let primaryWeightedSum = 0;
  let totalWeight = 0;

  for (const item of items) {
    const effectiveQty = item.quantity * (1 + item.scrapRatePct / 100);
    const kgCo2e = effectiveQty * item.factorValue;
    const stage = item.lifecycleStage;

    byStage[stage] = (byStage[stage] || 0) + kgCo2e;
    byComponent.push({
      componentId: item.componentId,
      name: item.componentName,
      materialClass: item.materialClass,
      kgCo2e: Math.round(kgCo2e * 10000) / 10000,
      pct: 0, // filled below
    });
    totalKgCo2e += kgCo2e;
    totalWeight += item.quantity;
    if (item.isPrimary) primaryWeightedSum += item.quantity;
  }

  // Add process-step emissions to stage totals.
  for (const [stage, kg] of Object.entries(processEmissions)) {
    byStage[stage] = (byStage[stage] || 0) + kg;
    totalKgCo2e += kg;
  }

  // Compute percentages.
  for (const entry of byComponent) {
    entry.pct = totalKgCo2e > 0 ? Math.round((entry.kgCo2e / totalKgCo2e) * 10000) / 100 : 0;
  }
  byComponent.sort((a, b) => b.kgCo2e - a.kgCo2e);

  const primaryDataPct = totalWeight > 0 ? primaryWeightedSum / totalWeight : 0;

  // Round stage values.
  for (const key of Object.keys(byStage)) {
    byStage[key] = Math.round(byStage[key] * 10000) / 10000;
  }

  // ─── 6. Monte Carlo uncertainty ───────────────────────────────
  const trialTotals = new Float64Array(MONTE_CARLO_ITERATIONS);

  for (let t = 0; t < MONTE_CARLO_ITERATIONS; t++) {
    let trialTotal = 0;
    for (const item of items) {
      const effectiveQty = item.quantity * (1 + item.scrapRatePct / 100);
      const sampledFactor = normalRandom(item.factorValue, item.factorStd);
      trialTotal += effectiveQty * sampledFactor;
    }
    // Add process emissions (treated as deterministic for now).
    for (const kg of Object.values(processEmissions)) {
      trialTotal += kg;
    }
    trialTotals[t] = trialTotal;
  }

  // Sort for percentile extraction.
  trialTotals.sort();
  const p5  = Math.round(percentile(trialTotals, 5)  * 10000) / 10000;
  const p50 = Math.round(percentile(trialTotals, 50) * 10000) / 10000;
  const p95 = Math.round(percentile(trialTotals, 95) * 10000) / 10000;

  // ─── 7. Factor snapshot (for reproducibility) ─────────────────
  const factorSnapshot = items
    .filter((i) => i.factorId)
    .map((i) => ({
      bomId: i.bomId,
      factorId: i.factorId,
      value: i.factorValue,
      std: i.factorStd,
      source: i.factorSource,
    }));

  return {
    productId,
    engineVersion: ENGINE_VERSION,
    totalKgCo2e: Math.round(p50 * 10000) / 10000,
    uncertaintyLow: p5,
    uncertaintyHigh: p95,
    primaryDataPct: Math.round(primaryDataPct * 10000) / 10000,
    breakdownByStage: byStage,
    breakdownByComp: byComponent.slice(0, 50),
    factorSnapshot,
    status: 'draft',
  };
}

/**
 * Run + persist the calculation.
 */
async function runAndSave(productId) {
  const result = await calculatePcf(productId);
  const saved = await prisma.pcfCalculation.create({ data: result });
  return saved;
}

/**
 * Stateless what-if simulator — runs the engine twice (baseline + scenario)
 * in memory and returns a diff.  Never persists.
 *
 * @param {string} productId
 * @param {object} overrides — scenario shape (see calculatePcf)
 * @returns {object} { baseline, scenario, delta }
 */
async function simulatePcf(productId, overrides) {
  // Baseline: run with no overrides (captures the current stored state).
  const baseline = await calculatePcf(productId);
  const scenario = await calculatePcf(productId, overrides);

  const deltaKg = scenario.totalKgCo2e - baseline.totalKgCo2e;
  const deltaPct = baseline.totalKgCo2e > 0
    ? (deltaKg / baseline.totalKgCo2e) * 100
    : 0;

  return {
    baseline: {
      totalKgCo2e: baseline.totalKgCo2e,
      uncertaintyLow: baseline.uncertaintyLow,
      uncertaintyHigh: baseline.uncertaintyHigh,
      primaryDataPct: baseline.primaryDataPct,
      breakdownByStage: baseline.breakdownByStage,
      breakdownByComp: baseline.breakdownByComp,
    },
    scenario: {
      totalKgCo2e: scenario.totalKgCo2e,
      uncertaintyLow: scenario.uncertaintyLow,
      uncertaintyHigh: scenario.uncertaintyHigh,
      primaryDataPct: scenario.primaryDataPct,
      breakdownByStage: scenario.breakdownByStage,
      breakdownByComp: scenario.breakdownByComp,
    },
    delta: {
      kgCo2e: Math.round(deltaKg * 10000) / 10000,
      pct: Math.round(deltaPct * 100) / 100,
      direction: deltaKg < 0 ? 'reduction' : deltaKg > 0 ? 'increase' : 'none',
    },
    overrides,
  };
}

module.exports = { calculatePcf, runAndSave, simulatePcf, ENGINE_VERSION };
