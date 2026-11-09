'use strict';

/**
 * Water Engine — E3 Water Resources analytics
 *
 * Computes aggregations, water-stress exposure, and KPIs for the Water
 * Resources module (ESRS E3 / GRI 303).  All quantities are stored and
 * returned in m³ unless otherwise stated.
 */

const prisma = require('../config/prisma');

// ─── Unit conversion helpers ────────────────────────────────────────────────

const CONVERSION_TO_M3 = {
  m3: 1,
  litres: 0.001,
  liters: 0.001,
  l: 0.001,
  ml: 1,           // megalitres
  ML: 1000,        // megalitres (uppercase)
  gallons: 0.00378541,
  'ft3': 0.0283168,
};

function toM3(value, unit) {
  const factor = CONVERSION_TO_M3[unit] || CONVERSION_TO_M3[unit?.toLowerCase()] || 1;
  return value * factor;
}

function fromM3(valueM3, targetUnit) {
  const factor = CONVERSION_TO_M3[targetUnit] || CONVERSION_TO_M3[targetUnit?.toLowerCase()] || 1;
  return valueM3 / factor;
}

// ─── Aggregation ────────────────────────────────────────────────────────────

/**
 * Compute total withdrawal, discharge, and consumption by source, site,
 * and org unit for a company in a given year.
 */
async function aggregateWater(companyId, year) {
  const activities = await prisma.waterActivity.findMany({
    where: { companyId, year: parseInt(year) },
    include: { site: { select: { id: true, name: true, orgUnitId: true, waterStress: true } } },
  });

  const bySource = {};
  const bySite = {};
  const byOrgUnit = {};
  const totals = { withdrawal: 0, discharge: 0, consumption: 0 };

  for (const a of activities) {
    const qty = toM3(a.quantity, a.unit);
    const ft = a.flowType; // withdrawal | discharge | consumption

    // Totals by flow type
    if (totals[ft] !== undefined) totals[ft] += qty;

    // By source
    if (!bySource[a.source]) bySource[a.source] = { withdrawal: 0, discharge: 0, consumption: 0 };
    if (bySource[a.source][ft] !== undefined) bySource[a.source][ft] += qty;

    // By site
    const siteKey = a.site.id;
    if (!bySite[siteKey]) bySite[siteKey] = { siteId: a.site.id, siteName: a.site.name, waterStress: a.site.waterStress, withdrawal: 0, discharge: 0, consumption: 0 };
    if (bySite[siteKey][ft] !== undefined) bySite[siteKey][ft] += qty;

    // By org unit
    const ouKey = a.site.orgUnitId || '_unassigned';
    if (!byOrgUnit[ouKey]) byOrgUnit[ouKey] = { orgUnitId: a.site.orgUnitId, withdrawal: 0, discharge: 0, consumption: 0 };
    if (byOrgUnit[ouKey][ft] !== undefined) byOrgUnit[ouKey][ft] += qty;
  }

  // Compute consumption as withdrawal - discharge if not explicitly recorded
  const computedConsumption = totals.withdrawal - totals.discharge;

  return {
    year: parseInt(year),
    totals: {
      withdrawal: Math.round(totals.withdrawal * 100) / 100,
      discharge: Math.round(totals.discharge * 100) / 100,
      consumption: Math.round(Math.max(totals.consumption, computedConsumption) * 100) / 100,
    },
    bySource,
    bySite: Object.values(bySite),
    byOrgUnit: Object.values(byOrgUnit),
    recordCount: activities.length,
  };
}

// ─── Water-Stress Exposure ──────────────────────────────────────────────────

const HIGH_STRESS_LEVELS = ['High', 'Extremely High'];

/**
 * Compute % of withdrawal/consumption from water-stressed sites.
 */
async function computeWaterStressExposure(companyId, year) {
  const activities = await prisma.waterActivity.findMany({
    where: { companyId, year: parseInt(year) },
    include: { site: { select: { id: true, name: true, waterStress: true } } },
  });

  let totalWithdrawal = 0;
  let stressedWithdrawal = 0;
  let totalConsumption = 0;
  let stressedConsumption = 0;

  const stressedSites = new Set();

  for (const a of activities) {
    const qty = toM3(a.quantity, a.unit);
    const isStressed = HIGH_STRESS_LEVELS.includes(a.site.waterStress);

    if (a.flowType === 'withdrawal') {
      totalWithdrawal += qty;
      if (isStressed) {
        stressedWithdrawal += qty;
        stressedSites.add(a.site.id);
      }
    }
    if (a.flowType === 'consumption') {
      totalConsumption += qty;
      if (isStressed) stressedConsumption += qty;
    }
  }

  return {
    year: parseInt(year),
    totalWithdrawalM3: Math.round(totalWithdrawal * 100) / 100,
    stressedWithdrawalM3: Math.round(stressedWithdrawal * 100) / 100,
    withdrawalStressPct: totalWithdrawal > 0 ? Math.round((stressedWithdrawal / totalWithdrawal) * 10000) / 100 : 0,
    totalConsumptionM3: Math.round(totalConsumption * 100) / 100,
    stressedConsumptionM3: Math.round(stressedConsumption * 100) / 100,
    consumptionStressPct: totalConsumption > 0 ? Math.round((stressedConsumption / totalConsumption) * 10000) / 100 : 0,
    stressedSiteCount: stressedSites.size,
  };
}

// ─── KPIs ───────────────────────────────────────────────────────────────────

/**
 * Compute key water KPIs for a company in a given year.
 */
async function computeWaterKpis(companyId, year) {
  const agg = await aggregateWater(companyId, year);

  // Get employee count for intensity calculation (from workforce composition)
  const workforce = await prisma.fS1WorkforceComposition.findMany({
    where: { companyId, year: parseInt(year) },
  });
  const totalEmployees = workforce.reduce((sum, w) => sum + w.employeeCount, 0);

  // Recycled / reused quantity
  const recycledActivities = await prisma.waterActivity.findMany({
    where: { companyId, year: parseInt(year), recycledReused: true },
  });
  const recycledM3 = recycledActivities.reduce((sum, a) => sum + toM3(a.quantity, a.unit), 0);

  // Withdrawal by source breakdown (as percentages)
  const withdrawalBySource = {};
  for (const [source, vals] of Object.entries(agg.bySource)) {
    if (vals.withdrawal > 0 && agg.totals.withdrawal > 0) {
      withdrawalBySource[source] = {
        m3: Math.round(vals.withdrawal * 100) / 100,
        pct: Math.round((vals.withdrawal / agg.totals.withdrawal) * 10000) / 100,
      };
    }
  }

  return {
    year: parseInt(year),
    totalWithdrawalM3: agg.totals.withdrawal,
    totalDischargeM3: agg.totals.discharge,
    totalConsumptionM3: agg.totals.consumption,
    recycledReusedM3: Math.round(recycledM3 * 100) / 100,
    recycledReusedPct: agg.totals.withdrawal > 0
      ? Math.round((recycledM3 / agg.totals.withdrawal) * 10000) / 100
      : 0,
    waterIntensityPerEmployee: totalEmployees > 0
      ? Math.round((agg.totals.consumption / totalEmployees) * 100) / 100
      : null,
    employeeCount: totalEmployees || null,
    withdrawalBySource,
    siteCount: agg.bySite.length,
  };
}

module.exports = {
  aggregateWater,
  computeWaterStressExposure,
  computeWaterKpis,
  toM3,
  fromM3,
};
