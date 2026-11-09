'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// pcafEngine.js — PCAF Financed Emissions Calculator (FS-02)
//
// Implements the PCAF (Partnership for Carbon Accounting Financials)
// attribution formulas for each asset class.  Takes a FinancialExposure
// + counterparty emissions data and computes the financed share.
//
// PCAF Annex B formulas:
//   Listed equity / bonds:  financed = (investment / EVIC) × investee_emissions
//   Business loans:         financed = (outstanding / total_balance_sheet) × borrower_emissions
//   Project finance:        financed = (outstanding / total_project_cost) × project_emissions
//   Commercial real estate: financed = (outstanding / property_value) × building_emissions
//   Mortgages:              financed = (outstanding / property_value) × building_emissions
//   Motor vehicle loans:    financed = (outstanding / vehicle_value) × vehicle_emissions
//   Sovereign debt:         financed = (outstanding / GDP) × country_emissions
// ─────────────────────────────────────────────────────────────────────────────

const prisma = require('../config/prisma');

/**
 * Compute financed emissions for a single exposure.
 *
 * @param {object} exposure — FinancialExposure row
 * @param {object} counterpartyData — { scope1, scope2, scope3, propertyValue?, gdp?, projectCost?, vehicleValue? }
 * @returns {object} — financed emissions breakdown
 */
function computeAttribution(exposure, counterpartyData) {
  const s1 = counterpartyData.scope1 || 0;
  const s2 = counterpartyData.scope2 || 0;
  const s3 = counterpartyData.scope3 || 0;
  const outstanding = exposure.outstandingAmount || 0;

  let attributionFactor = 0;

  switch (exposure.assetClass) {
    case 'listed_equity':
    case 'corp_bonds': {
      const evic = exposure.evic || counterpartyData.evic || 1;
      attributionFactor = outstanding / evic;
      break;
    }
    case 'business_loans': {
      const bs = exposure.totalBalanceSheet || counterpartyData.totalBalanceSheet || 1;
      attributionFactor = outstanding / bs;
      break;
    }
    case 'project_finance': {
      const projectCost = counterpartyData.projectCost || outstanding;
      attributionFactor = outstanding / projectCost;
      break;
    }
    case 'commercial_re':
    case 'mortgages': {
      const propValue = counterpartyData.propertyValue || outstanding;
      attributionFactor = outstanding / propValue;
      break;
    }
    case 'motor_vehicle_loans': {
      const vehicleValue = counterpartyData.vehicleValue || outstanding;
      attributionFactor = outstanding / vehicleValue;
      break;
    }
    case 'sovereign': {
      const gdp = counterpartyData.gdp || 1;
      attributionFactor = outstanding / gdp;
      break;
    }
    default:
      attributionFactor = 0;
  }

  attributionFactor = Math.min(1, Math.max(0, attributionFactor));

  const financedScope1 = s1 * attributionFactor;
  const financedScope2 = s2 * attributionFactor;
  const financedScope3 = s3 * attributionFactor;
  const totalFinanced = financedScope1 + financedScope2 + financedScope3;

  // WACI = financed emissions / investment (tCO2e per EUR M)
  const waci = outstanding > 0 ? (totalFinanced / outstanding) * 1_000_000 : 0;

  return {
    attributionFactor: Math.round(attributionFactor * 10000) / 10000,
    counterpartyScope1: s1,
    counterpartyScope2: s2,
    counterpartyScope3: s3,
    financedScope1: Math.round(financedScope1 * 100) / 100,
    financedScope2: Math.round(financedScope2 * 100) / 100,
    financedScope3: Math.round(financedScope3 * 100) / 100,
    totalFinanced: Math.round(totalFinanced * 100) / 100,
    waci: Math.round(waci * 100) / 100,
  };
}

/**
 * Run PCAF calculation for a single exposure and persist the result.
 *
 * @param {string} exposureId
 * @param {object} counterpartyData — emissions + denominators
 */
async function calculateExposure(exposureId, counterpartyData) {
  const exposure = await prisma.financialExposure.findUnique({ where: { id: exposureId } });
  if (!exposure) throw new Error('Exposure not found.');

  const result = computeAttribution(exposure, counterpartyData);

  const saved = await prisma.financedEmissionsCalc.create({
    data: {
      exposureId,
      reportingYear: exposure.reportingYear,
      attributionFactor: result.attributionFactor,
      counterpartyScope1: result.counterpartyScope1,
      counterpartyScope2: result.counterpartyScope2,
      counterpartyScope3: result.counterpartyScope3,
      financedScope1: result.financedScope1,
      financedScope2: result.financedScope2,
      financedScope3: result.financedScope3,
      waci: result.waci,
      factorSnapshot: counterpartyData,
    },
  });

  return { ...saved, totalFinanced: result.totalFinanced };
}

/**
 * Compute portfolio-level aggregates for a company.
 */
async function portfolioSummary(companyId, reportingYear) {
  const exposures = await prisma.financialExposure.findMany({
    where: { companyId, reportingYear },
    include: {
      financedEmissions: { orderBy: { calcAt: 'desc' }, take: 1 },
    },
  });

  let totalFinancedS1 = 0;
  let totalFinancedS2 = 0;
  let totalFinancedS3 = 0;
  let totalOutstanding = 0;
  let coveredAum = 0;
  let qualitySum = 0;
  let qualityCount = 0;
  const byAssetClass = {};

  for (const exp of exposures) {
    totalOutstanding += exp.outstandingAmount;
    qualitySum += exp.dataQualityScore;
    qualityCount++;

    const calc = exp.financedEmissions[0];
    if (calc) {
      totalFinancedS1 += calc.financedScope1;
      totalFinancedS2 += calc.financedScope2;
      totalFinancedS3 += calc.financedScope3 || 0;
      coveredAum += exp.outstandingAmount;

      if (!byAssetClass[exp.assetClass]) byAssetClass[exp.assetClass] = { count: 0, financed: 0, outstanding: 0 };
      byAssetClass[exp.assetClass].count++;
      byAssetClass[exp.assetClass].financed += calc.financedScope1 + calc.financedScope2 + (calc.financedScope3 || 0);
      byAssetClass[exp.assetClass].outstanding += exp.outstandingAmount;
    }
  }

  const totalFinanced = totalFinancedS1 + totalFinancedS2 + totalFinancedS3;
  const waci = totalOutstanding > 0 ? (totalFinanced / totalOutstanding) * 1_000_000 : 0;
  const coveragePct = totalOutstanding > 0 ? (coveredAum / totalOutstanding) * 100 : 0;
  const avgQuality = qualityCount > 0 ? qualitySum / qualityCount : 5;

  return {
    totalExposures: exposures.length,
    totalOutstanding: Math.round(totalOutstanding),
    totalFinancedEmissions: Math.round(totalFinanced * 100) / 100,
    financedScope1: Math.round(totalFinancedS1 * 100) / 100,
    financedScope2: Math.round(totalFinancedS2 * 100) / 100,
    financedScope3: Math.round(totalFinancedS3 * 100) / 100,
    waci: Math.round(waci * 100) / 100,
    coveragePct: Math.round(coveragePct * 10) / 10,
    avgDataQualityScore: Math.round(avgQuality * 10) / 10,
    byAssetClass,
  };
}

module.exports = { computeAttribution, calculateExposure, portfolioSummary };
