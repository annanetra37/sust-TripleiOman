'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// sectors.js — Sector Pack API (PCF-05)
//
//   GET  /api/sectors                → list all installed packs
//   GET  /api/sectors/current        → the company's active pack + KPIs
//   POST /api/sectors/select         → { sectorKey } — set the active pack
//   POST /api/sectors/reload         → (admin) re-run the sector loader
//
// The loader (services/sectorLoader.js) runs once at server boot; this route
// is what the frontend uses to list installed sectors and to save the user's
// onboarding / settings selection.
// ─────────────────────────────────────────────────────────────────────────────

const router = require('express').Router();
const prisma = require('../config/prisma');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { formatError } = require('../utils/errors');
const { logActivity } = require('../utils/activityLog');
const sectorLoader = require('../services/sectorLoader');

router.use(authenticate);

// ─── Computed sector KPI values ─────────────────────────────────────────────
// Returns the company's active sector KPIs with live-computed values where
// possible.  KPIs that can't be auto-computed return value=null so the UI
// can render them as "Not yet reported" placeholders.
router.get('/kpis', async (req, res) => {
  try {
    const companyId = req.user.companyId;
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const selection = await prisma.companySectorSelection.findUnique({ where: { companyId } });
    if (!selection) return res.json({ selected: false, sectorKey: null, kpis: [] });

    const pack = await prisma.sectorPack.findUnique({
      where: { key: selection.sectorKey },
      include: { kpis: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!pack) return res.json({ selected: true, sectorKey: selection.sectorKey, kpis: [] });

    // Fetch data for computation
    const [emissions, workforce, products, training, turnover, targets] = await Promise.all([
      prisma.fE1EmissionActivityData.findMany({ where: { companyId, year } }),
      prisma.fS1WorkforceComposition.findMany({ where: { companyId, year } }),
      prisma.product.findMany({
        where: { companyId },
        include: { calculations: { orderBy: { runAt: 'desc' }, take: 1 } },
      }),
      prisma.fS1EmployeeTraining.findMany({ where: { companyId, year } }),
      prisma.fS1EmployeeTurnover.findMany({ where: { companyId, year } }),
      prisma.sBTiTarget.findMany({ where: { companyId } }),
    ]);

    // Pre-compute aggregates
    const totalEmissions = emissions.reduce((s, r) => s + (r.totalEmissions || 0), 0);
    const scope1 = emissions.filter(r => r.scope === 'Scope 1').reduce((s, r) => s + (r.totalEmissions || 0), 0);
    const scope2 = emissions.filter(r => r.scope === 'Scope 2').reduce((s, r) => s + (r.totalEmissions || 0), 0);
    const scope3 = emissions.filter(r => r.scope === 'Scope 3').reduce((s, r) => s + (r.totalEmissions || 0), 0);
    const totalEmployees = workforce.reduce((s, r) => s + r.employeeCount, 0);

    // Energy: sum kWh from energy-related activities
    const energyKwh = emissions
      .filter(r => {
        const u = (r.unit || '').toLowerCase();
        const c = (r.activityCategory || '').toLowerCase();
        return u.includes('kwh') || u.includes('mwh') || c.includes('electric') || c.includes('energy');
      })
      .reduce((s, r) => {
        const u = (r.unit || '').toLowerCase();
        if (u.includes('mwh')) return s + r.quantity * 1000;
        return s + r.quantity;
      }, 0);

    // PCF data
    const productsWithPcf = products.filter(p => p.calculations[0]);
    const pcfCoveragePct = products.length > 0 ? (productsWithPcf.length / products.length) * 100 : 0;
    const avgPrimaryDataPct = productsWithPcf.length > 0
      ? productsWithPcf.reduce((s, p) => s + (p.calculations[0].primaryDataPct || 0), 0) / productsWithPcf.length * 100
      : 0;

    // Training
    const trainingHours = training.reduce((s, r) => s + (r.trainingHours || 0), 0);

    // Turnover
    const turnoverCount = turnover.reduce((s, r) => s + r.count, 0);
    const turnoverRate = totalEmployees > 0 ? (turnoverCount / totalEmployees) * 100 : 0;

    // Auto-compute values by KPI code — works for both electronics + automotive packs
    const computeValue = async (code) => {
      switch (code) {
        // Electronics KPIs
        case 'TC-SC-110a.1': return totalEmissions > 0 ? { value: scope1, detail: `${scope1.toFixed(2)} tCO2e` } : null;
        case 'TC-SC-130a.1': return energyKwh > 0 ? { value: energyKwh * 0.0036, detail: `${(energyKwh * 0.0036).toFixed(1)} GJ (${energyKwh.toFixed(0)} kWh)` } : null;
        case 'E1-6-ELECT': return totalEmissions > 0 ? { value: totalEmissions, detail: `${totalEmissions.toFixed(2)} tCO2e total` } : null;
        case 'TC-HW-410a.1': return null;

        // Shared (electronics + automotive)
        case 'PCF-COVERAGE':
        case 'PCF-COVERAGE-AUTO':
          return products.length > 0 ? { value: pcfCoveragePct, detail: `${productsWithPcf.length} of ${products.length} products (${pcfCoveragePct.toFixed(0)}%)` } : null;
        case 'PCF-PRIMARY-DATA':
          return productsWithPcf.length > 0 ? { value: avgPrimaryDataPct, detail: `${avgPrimaryDataPct.toFixed(1)}% weighted avg` } : null;

        // Automotive KPIs
        case 'E1-TOTAL-AUTO':
          return totalEmissions > 0 ? { value: totalEmissions, detail: `${totalEmissions.toFixed(2)} tCO2e (Scope 1+2+3)` } : null;
        case 'SCOPE3-SUPPLY-CHAIN':
          return scope3 > 0 ? { value: scope3, detail: `${scope3.toFixed(2)} tCO2e (Scope 3 upstream)` } : null;
        case 'CATENA-X-READY': {
          const autoProducts = products.filter(p => p.sector === 'automotive');
          const cxReady = autoProducts.filter(p => p.calculations[0]).length;
          return autoProducts.length > 0 ? { value: cxReady, detail: `${cxReady} of ${autoProducts.length} automotive product(s)` } : null;
        }
        case 'TR-AU-310a.1':
          return totalEmployees > 0 ? { value: null, detail: 'Pending: collective bargaining data not yet collected' } : null;

        // Real estate KPIs
        case 'RE-EUI': {
          // Energy Use Intensity from real estate assets
          const assets = await prisma.realEstateAsset.findMany({ where: { companyId }, include: { energyRecords: { where: { year } } } });
          if (assets.length === 0) return null;
          let totalKwh = 0, totalM2 = 0;
          for (const a of assets) {
            const kwh = a.energyRecords.reduce((s, r) => s + (r.unit === 'MWh' ? r.quantity * 1000 : r.quantity), 0);
            totalKwh += kwh;
            totalM2 += a.grossFloorAreaM2;
          }
          if (totalM2 === 0) return null;
          const eui = totalKwh / totalM2;
          return { value: eui, detail: `${eui.toFixed(1)} kWh/m² across ${assets.length} asset(s)` };
        }
        case 'RE-GHG-INTENSITY': {
          const assets2 = await prisma.realEstateAsset.findMany({ where: { companyId }, include: { crremPathways: true } });
          if (assets2.length === 0) return null;
          const withData = assets2.filter(a => a.crremPathways.length > 0);
          if (withData.length === 0) return null;
          const avg = withData.reduce((s, a) => s + (a.crremPathways[0]?.currentKgCo2ePerM2 || 0), 0) / withData.length;
          return { value: avg, detail: `${avg.toFixed(1)} kgCO2e/m² avg across ${withData.length} asset(s)` };
        }
        case 'RE-ASSETS': {
          const count = await prisma.realEstateAsset.count({ where: { companyId } });
          return count > 0 ? { value: count, detail: `${count} asset(s) in portfolio` } : null;
        }

        // Financial services KPIs
        case 'PCAF-TOTAL-FINANCED': {
          const calcs = await prisma.financedEmissionsCalc.findMany({
            where: { exposure: { companyId } },
            select: { financedScope1: true, financedScope2: true, financedScope3: true },
          });
          if (calcs.length === 0) return null;
          const total = calcs.reduce((s, c) => s + c.financedScope1 + c.financedScope2 + (c.financedScope3 || 0), 0);
          return { value: total, detail: `${total.toFixed(1)} tCO2e across ${calcs.length} exposure(s)` };
        }
        case 'PCAF-EXPOSURES': {
          const expCount = await prisma.financialExposure.count({ where: { companyId } });
          return expCount > 0 ? { value: expCount, detail: `${expCount} exposure(s)` } : null;
        }

        default: return null;
      }
    };

    // Build enriched KPI list
    const kpis = [];
    for (const kpi of pack.kpis) {
      const computed = await computeValue(kpi.code);
      kpis.push({
        id: kpi.id,
        code: kpi.code,
        name: kpi.name,
        unit: kpi.unit,
        framework: kpi.framework,
        category: kpi.category,
        sortOrder: kpi.sortOrder,
        computed: computed !== null,
        value: computed?.value ?? null,
        detail: computed?.detail ?? null,
      });
    }

    // Summary stats for the sector header
    const summary = {
      totalKpis: kpis.length,
      computedKpis: kpis.filter(k => k.computed).length,
      pendingKpis: kpis.filter(k => !k.computed).length,
      totalEmissions,
      scope1, scope2, scope3,
      totalEmployees,
      pcfCoveragePct,
      avgPrimaryDataPct,
      productCount: products.length,
      hasSbti: targets.length > 0,
      energyGj: energyKwh * 0.0036,
      trainingHours,
      turnoverRate,
    };

    res.json({
      selected: true,
      sectorKey: selection.sectorKey,
      packName: pack.name,
      packVersion: pack.version,
      frameworks: pack.manifest?.frameworks || [],
      summary,
      kpis,
    });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── List all installed packs ───────────────────────────────────────────────
router.get('/', async (_req, res) => {
  try {
    const packs = await prisma.sectorPack.findMany({
      where: { enabled: true },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { kpis: true } },
      },
    });
    res.json(packs.map((p) => ({
      key: p.key,
      name: p.name,
      version: p.version,
      frameworks: p.manifest?.frameworks || [],
      description: p.manifest?.description || '',
      kpiCount: p._count.kpis,
      lifecycleStagesActive: p.manifest?.lifecycleStagesActive || [],
      functionalUnits: p.manifest?.functionalUnits || [],
    })));
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Current selection for the signed-in company ────────────────────────────
router.get('/current', async (req, res) => {
  try {
    const selection = await prisma.companySectorSelection.findUnique({
      where: { companyId: req.user.companyId },
    });
    if (!selection) {
      return res.json({ selected: false, sectorKey: null, pack: null, kpis: [] });
    }
    const pack = await prisma.sectorPack.findUnique({
      where: { key: selection.sectorKey },
      include: { kpis: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!pack) {
      return res.json({ selected: true, sectorKey: selection.sectorKey, pack: null, kpis: [] });
    }
    res.json({
      selected: true,
      sectorKey: selection.sectorKey,
      selectedAt: selection.selectedAt,
      pack: {
        key: pack.key,
        name: pack.name,
        version: pack.version,
        frameworks: pack.manifest?.frameworks || [],
        description: pack.manifest?.description || '',
        lifecycleStagesActive: pack.manifest?.lifecycleStagesActive || [],
        functionalUnits: pack.manifest?.functionalUnits || [],
        materialityStarters: pack.manifest?.materialityStarters || [],
      },
      kpis: pack.kpis,
    });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Set / change the active pack ───────────────────────────────────────────
// Admin-only because switching sectors changes which dashboards + report
// sections are active for the whole company.
router.post('/select', requireAdmin, async (req, res) => {
  try {
    const { sectorKey } = req.body || {};
    if (!sectorKey) return res.status(400).json({ error: 'sectorKey is required.' });

    const pack = await prisma.sectorPack.findUnique({ where: { key: sectorKey } });
    if (!pack || !pack.enabled) {
      return res.status(404).json({ error: `Sector pack "${sectorKey}" not found or disabled.` });
    }

    const existing = await prisma.companySectorSelection.findUnique({
      where: { companyId: req.user.companyId },
    });
    const saved = await prisma.companySectorSelection.upsert({
      where: { companyId: req.user.companyId },
      create: { companyId: req.user.companyId, sectorKey },
      update: { sectorKey },
    });

    logActivity(
      req.user.id, req.user.companyId,
      existing ? 'SECTOR_CHANGE' : 'SECTOR_SELECT',
      existing
        ? `Sector pack changed from ${existing.sectorKey} to ${sectorKey}`
        : `Sector pack selected: ${sectorKey}`,
      { from: existing?.sectorKey || null, to: sectorKey }, req.ip,
    );

    res.json(saved);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Admin: re-run the disk → DB loader ─────────────────────────────────────
router.post('/reload', requireAdmin, async (req, res) => {
  try {
    const result = await sectorLoader.loadAllPacks();
    logActivity(req.user.id, req.user.companyId, 'SECTOR_RELOAD',
      `Reloaded ${result.length} sector pack(s)`, { result }, req.ip);
    res.json({ result });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

module.exports = router;
