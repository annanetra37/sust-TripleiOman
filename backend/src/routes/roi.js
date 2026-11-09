'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// roi.js — Sustainability ROI module
//
// Gated to PROFESSIONAL + ENTERPRISE via requireFeature('sustainability_roi').
//
// Exposes four pillars that translate the company's ESG data into USD impact:
//
//   1. Energy cost savings        — energy spend reduction vs. a baseline year
//   2. Carbon tax avoidance       — avoided liability from emission reductions
//   3. Contract eligibility       — revenue protected / unlocked by ESG cert
//   4. HR & talent ROI            — recruiting cost avoided via retention
//
// All calculations read from existing fact tables (FE1EmissionActivityData,
// FS1WorkforceComposition, FS1EmployeeTurnover, FS1EmployeeTraining) and the
// CompanyFinancials assumptions row.  The route never mutates ESG data; it
// only reads and derives.
// ─────────────────────────────────────────────────────────────────────────────

const router = require('express').Router();
const prisma = require('../config/prisma');
const { authenticate } = require('../middleware/auth');
const { requireFeature } = require('../middleware/tier');
const { formatError } = require('../utils/errors');
const buildingEnergy = require('../services/buildingEnergy');

router.use(authenticate);
router.use(requireFeature('sustainability_roi'));

// ─── Helpers ────────────────────────────────────────────────────────────────

const round = (n, p = 2) => {
  if (n == null || !isFinite(n)) return 0;
  const m = Math.pow(10, p);
  return Math.round(n * m) / m;
};

// Default assumptions fall back to the Prisma defaults if the row doesn't
// exist yet — first-time visitors to the ROI page still see meaningful
// numbers before they open the "financial data" form.
const DEFAULTS = {
  electricityPricePerKwh:   0.15,
  carbonTaxPerTco2e:        85,
  avgRecruitingCostPerHire: 4700,
  annualRevenue:            null,
  esgDependentRevenueShare: 0.35,
  currency:                 'USD',
};

async function getFinancials(companyId) {
  const row = await prisma.companyFinancials.findUnique({ where: { companyId } });
  return { ...DEFAULTS, ...(row || {}) };
}

// Convert an activity record's energy quantity → kWh via the shared building
// energy module, so ROI, CRREM and the Building Energy page agree.  Volumes in
// m³ are only treated as natural gas when the row says so (m³ can be water).
function toKwh(row) {
  const unit = String(row.unit || '').toLowerCase();
  if (unit.includes('m3') || unit.includes('m³')) {
    const text = `${row.activityCategory || ''} ${row.activitySubcat || ''}`.toLowerCase();
    if (!text.includes('gas')) return 0;
  }
  return buildingEnergy.unitToKwh(row.quantity, row.unit);
}

// Detect whether an activity record represents energy consumption (vs. a
// non-energy Scope 3 category like business travel).  We keep this permissive
// because upstream categorisation varies by connector.
function isEnergyActivity(a) {
  const cat = String(a.activityCategory || '').toLowerCase();
  const sub = String(a.activitySubcat || '').toLowerCase();
  const unit = String(a.unit || '').toLowerCase();
  if (unit.includes('kwh') || unit.includes('mwh') || unit.includes('gj')) return true;
  if (cat.includes('electric') || cat.includes('energy') || cat.includes('fuel') ||
      cat.includes('combustion') || cat.includes('heating')) return true;
  if (sub.includes('electric') || sub.includes('grid') || sub.includes('heating') ||
      sub.includes('diesel') || sub.includes('petrol') || sub.includes('gas')) return true;
  return false;
}

// ─── Years available ─────────────────────────────────────────────────────────
async function getAvailableYears(companyId) {
  const [emYears, s1Years] = await Promise.all([
    prisma.fE1EmissionActivityData.findMany({
      where: { companyId },
      select: { year: true },
      distinct: ['year'],
      orderBy: { year: 'asc' },
    }),
    prisma.fS1WorkforceComposition.findMany({
      where: { companyId },
      select: { year: true },
      distinct: ['year'],
      orderBy: { year: 'asc' },
    }),
  ]);
  const set = new Set([...emYears.map((r) => r.year), ...s1Years.map((r) => r.year)]);
  return [...set].sort((a, b) => a - b);
}

// ─── Pillar 1: Energy cost savings ──────────────────────────────────────────
async function energyCostSavings(companyId, baselineYear, currentYear, fin) {
  const [baselineRows, currentRows] = await Promise.all([
    prisma.fE1EmissionActivityData.findMany({ where: { companyId, year: baselineYear } }),
    prisma.fE1EmissionActivityData.findMany({ where: { companyId, year: currentYear } }),
  ]);

  const sumKwh = (rows) =>
    rows.filter(isEnergyActivity).reduce((s, r) => s + toKwh(r), 0);

  const baselineKwh = sumKwh(baselineRows);
  const currentKwh = sumKwh(currentRows);
  const avoidedKwh = Math.max(0, baselineKwh - currentKwh);
  const savingsUsd = avoidedKwh * fin.electricityPricePerKwh;

  // Payback is meaningful only if the user reports efficiency capex.  We
  // don't track that today, so report the avoided spend + a placeholder.
  // NOTE: once capex tracking lands the CFO view can compute NPV from this.
  const baselineSpendUsd = baselineKwh * fin.electricityPricePerKwh;
  const reductionPct = baselineKwh > 0 ? ((baselineKwh - currentKwh) / baselineKwh) * 100 : 0;

  return {
    baselineYear,
    currentYear,
    baselineKwh: round(baselineKwh),
    currentKwh: round(currentKwh),
    avoidedKwh: round(avoidedKwh),
    baselineSpendUsd: round(baselineSpendUsd),
    currentSpendUsd: round(currentKwh * fin.electricityPricePerKwh),
    savingsUsd: round(savingsUsd),
    reductionPct: round(reductionPct, 1),
    electricityPricePerKwh: fin.electricityPricePerKwh,
  };
}

// ─── Pillar 2: Carbon tax avoidance ─────────────────────────────────────────
async function carbonTaxAvoidance(companyId, baselineYear, currentYear, fin) {
  const [baselineRows, currentRows] = await Promise.all([
    prisma.fE1EmissionActivityData.findMany({ where: { companyId, year: baselineYear } }),
    prisma.fE1EmissionActivityData.findMany({ where: { companyId, year: currentYear } }),
  ]);

  const sumCo2 = (rows) => rows.reduce((s, r) => s + (r.totalEmissions || 0), 0);
  const baselineTco2 = sumCo2(baselineRows);
  const currentTco2 = sumCo2(currentRows);
  const avoidedTco2 = Math.max(0, baselineTco2 - currentTco2);
  const avoidedLiabilityUsd = avoidedTco2 * fin.carbonTaxPerTco2e;

  const currentLiabilityUsd = currentTco2 * fin.carbonTaxPerTco2e;
  const reductionPct = baselineTco2 > 0 ? ((baselineTco2 - currentTco2) / baselineTco2) * 100 : 0;

  return {
    baselineYear,
    currentYear,
    baselineTco2: round(baselineTco2),
    currentTco2: round(currentTco2),
    avoidedTco2: round(avoidedTco2),
    avoidedLiabilityUsd: round(avoidedLiabilityUsd),
    currentLiabilityUsd: round(currentLiabilityUsd),
    reductionPct: round(reductionPct, 1),
    carbonTaxPerTco2e: fin.carbonTaxPerTco2e,
  };
}

// ─── Pillar 3: Contract eligibility ─────────────────────────────────────────
// We don't model individual OEM contracts (yet) — this pillar instead
// quantifies the share of revenue that depends on holding an ESG certification
// at all.  The user supplies `annualRevenue` + `esgDependentRevenueShare` in
// the financials form; the calculation is a straightforward multiplication
// but framed so the CFO sees what's on the line.
async function contractEligibility(companyId, currentYear, fin) {
  const targets = await prisma.sBTiTarget.findMany({ where: { companyId } });
  const hasSbti = targets.length > 0;

  // How many distinct reporting standards have been populated with data?
  // (A rough proxy for "certification readiness" — the more standards
  // covered, the more OEM contracts the company can qualify for.)
  const rawActivities = await prisma.fE1EmissionActivityData.count({
    where: { companyId, year: currentYear },
  });
  const rawWorkforce = await prisma.fS1WorkforceComposition.count({
    where: { companyId, year: currentYear },
  });
  const coverageScore = Math.min(
    100,
    (rawActivities > 0 ? 40 : 0) +
      (rawWorkforce > 0 ? 30 : 0) +
      (hasSbti ? 30 : 0),
  );

  const revenue = Number(fin.annualRevenue) || 0;
  const share = Math.max(0, Math.min(1, Number(fin.esgDependentRevenueShare) || 0));
  const atRiskRevenueUsd = revenue * share;
  // Readiness scales how much of the at-risk pool is currently "defended"
  // by the data we actually have on hand.
  const protectedRevenueUsd = atRiskRevenueUsd * (coverageScore / 100);
  const gapRevenueUsd = Math.max(0, atRiskRevenueUsd - protectedRevenueUsd);

  return {
    revenueKnown: revenue > 0,
    annualRevenue: round(revenue),
    esgDependentRevenueShare: round(share * 100, 1),
    atRiskRevenueUsd: round(atRiskRevenueUsd),
    protectedRevenueUsd: round(protectedRevenueUsd),
    gapRevenueUsd: round(gapRevenueUsd),
    coverageScore,
    hasSbti,
    emissionRecords: rawActivities,
    workforceRecords: rawWorkforce,
  };
}

// ─── Pillar 4: HR & talent ROI ──────────────────────────────────────────────
async function hrTalentRoi(companyId, baselineYear, currentYear, fin) {
  const [baselineTurnover, currentTurnover, currentComp, currentDiv, currentTrain] = await Promise.all([
    prisma.fS1EmployeeTurnover.findMany({ where: { companyId, year: baselineYear } }),
    prisma.fS1EmployeeTurnover.findMany({ where: { companyId, year: currentYear } }),
    prisma.fS1WorkforceComposition.findMany({ where: { companyId, year: currentYear } }),
    prisma.fS1WorkforceDiversity.findMany({ where: { companyId, year: currentYear } }),
    prisma.fS1EmployeeTraining.findMany({ where: { companyId, year: currentYear } }),
  ]);

  const totalEmployees = currentComp.reduce((s, r) => s + r.employeeCount, 0);
  const baselineLeavers = baselineTurnover.reduce((s, r) => s + r.count, 0);
  const currentLeavers = currentTurnover.reduce((s, r) => s + r.count, 0);
  const avoidedLeavers = Math.max(0, baselineLeavers - currentLeavers);
  const recruitingCostAvoidedUsd = avoidedLeavers * fin.avgRecruitingCostPerHire;

  // Diversity index — how many distinct gender categories are represented,
  // capped at 3 (Male / Female / Other).  Rough but usable as a ROI signal.
  const genderCats = new Set(currentDiv.map((r) => r.gender || 'Unknown'));
  const diversityScore = Math.min(100, (genderCats.size / 3) * 100);

  // Training investment — total hours as a proxy for upskilling.
  const trainingHours = currentTrain.reduce((s, r) => s + (r.trainingHours || 0), 0);
  const trainedHeadcount = currentTrain.reduce((s, r) => s + (r.employeeCount || 0), 0);
  const avgHoursPerEmployee = trainedHeadcount > 0 ? trainingHours / trainedHeadcount : 0;

  const baselineTurnoverRate = totalEmployees > 0 ? (baselineLeavers / totalEmployees) * 100 : 0;
  const currentTurnoverRate = totalEmployees > 0 ? (currentLeavers / totalEmployees) * 100 : 0;

  return {
    baselineYear,
    currentYear,
    totalEmployees,
    baselineLeavers,
    currentLeavers,
    avoidedLeavers,
    baselineTurnoverRate: round(baselineTurnoverRate, 1),
    currentTurnoverRate: round(currentTurnoverRate, 1),
    recruitingCostAvoidedUsd: round(recruitingCostAvoidedUsd),
    avgRecruitingCostPerHire: fin.avgRecruitingCostPerHire,
    diversityScore: round(diversityScore),
    trainingHours: round(trainingHours),
    avgHoursPerEmployee: round(avgHoursPerEmployee, 1),
  };
}

// ─── Endpoints ──────────────────────────────────────────────────────────────

// Snapshot used by the dashboard to render all four cards.
router.get('/summary', async (req, res) => {
  try {
    const companyId = req.user.companyId;
    const years = await getAvailableYears(companyId);
    if (years.length === 0) {
      return res.json({
        hasData: false,
        years: [],
        baselineYear: null,
        currentYear: null,
        financials: await getFinancials(companyId),
        pillars: null,
      });
    }

    const currentYear = parseInt(req.query.currentYear) || years[years.length - 1];
    const defaultBaseline = years.find((y) => y < currentYear) ?? years[0];
    const baselineYear = parseInt(req.query.baselineYear) || defaultBaseline;

    const financials = await getFinancials(companyId);

    const [energy, carbon, contract, hr] = await Promise.all([
      energyCostSavings(companyId, baselineYear, currentYear, financials),
      carbonTaxAvoidance(companyId, baselineYear, currentYear, financials),
      contractEligibility(companyId, currentYear, financials),
      hrTalentRoi(companyId, baselineYear, currentYear, financials),
    ]);

    const totalRoiUsd =
      energy.savingsUsd +
      carbon.avoidedLiabilityUsd +
      contract.protectedRevenueUsd +
      hr.recruitingCostAvoidedUsd;

    res.json({
      hasData: true,
      years,
      baselineYear,
      currentYear,
      financials,
      totalRoiUsd: round(totalRoiUsd),
      pillars: {
        energy,
        carbon,
        contract,
        hr,
      },
    });
  } catch (err) {
    console.error('[roi] summary error:', err);
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// Read the company's saved financial assumptions (defaults if missing).
router.get('/financials', async (req, res) => {
  try {
    const fin = await getFinancials(req.user.companyId);
    res.json(fin);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// Upsert the company's financial assumptions.  Admin-only — CFO data is
// sensitive and we don't want custom-role users reshaping the ROI model
// without oversight.
router.put('/financials', async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin role required to edit financial assumptions.' });
    }
    const {
      electricityPricePerKwh,
      carbonTaxPerTco2e,
      avgRecruitingCostPerHire,
      annualRevenue,
      esgDependentRevenueShare,
      currency,
    } = req.body || {};

    // Validate — refuse negative numbers, reject revenue share outside [0, 1].
    const nonNeg = (v, name) => {
      if (v == null) return null;
      const n = Number(v);
      if (!isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative number.`);
      return n;
    };
    const pct = (v) => {
      if (v == null) return null;
      const n = Number(v);
      if (!isFinite(n) || n < 0 || n > 1) {
        throw new Error('esgDependentRevenueShare must be between 0 and 1.');
      }
      return n;
    };

    const data = {};
    const e = nonNeg(electricityPricePerKwh, 'electricityPricePerKwh'); if (e != null) data.electricityPricePerKwh = e;
    const c = nonNeg(carbonTaxPerTco2e, 'carbonTaxPerTco2e');           if (c != null) data.carbonTaxPerTco2e = c;
    const r = nonNeg(avgRecruitingCostPerHire, 'avgRecruitingCostPerHire'); if (r != null) data.avgRecruitingCostPerHire = r;
    const rev = nonNeg(annualRevenue, 'annualRevenue');                 if (rev != null) data.annualRevenue = rev;
    const s = pct(esgDependentRevenueShare);                             if (s != null) data.esgDependentRevenueShare = s;
    if (currency && typeof currency === 'string') data.currency = currency.slice(0, 8);

    const saved = await prisma.companyFinancials.upsert({
      where: { companyId: req.user.companyId },
      create: { companyId: req.user.companyId, ...data },
      update: data,
    });
    res.json(saved);
  } catch (err) {
    if (err.message && err.message.includes('must be')) {
      return res.status(400).json({ error: err.message });
    }
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

module.exports = router;
