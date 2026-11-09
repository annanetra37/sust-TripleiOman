'use strict';

const router = require('express').Router();
const prisma = require('../config/prisma');
const { authenticate } = require('../middleware/auth');
const { requireFeature } = require('../middleware/tier');
const { formatError } = require('../utils/errors');
const { logActivity } = require('../utils/activityLog');
const crremEngine = require('../services/crremEngine');
const buildingEnergy = require('../services/buildingEnergy');

router.use(authenticate, requireFeature('building_energy'));

const ASSET_CLASSES = [
  'office', 'retail', 'residential', 'industrial', 'logistics', 'hotel', 'mixed',
  'school', 'kindergarten', 'public_admin', 'healthcare', 'residential_multi',
];
const MAX_BULK = 500;

const sendError = (res, err) => { const { status, error } = formatError(err); res.status(status).json({ error }); };

// ─── Validation helpers ─────────────────────────────────────────────────────

const num = (v) => (v === '' || v == null ? null : Number(v));
const int = (v) => (v === '' || v == null ? null : parseInt(v, 10));
const date = (v) => (v === '' || v == null ? null : new Date(v));
const isBadDate = (d) => d != null && isNaN(d.getTime());

// Parse and validate asset fields.  `partial` allows omitted fields (PUT).
function parseAsset(body, partial = false) {
  const errors = [];
  const data = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);

  for (const k of ['name', 'country', 'city']) {
    if (has(k)) data[k] = body[k] == null ? body[k] : String(body[k]).trim();
    if ((!partial || has(k)) && !data[k]) errors.push(`${k} is required.`);
  }
  if (data.country) data.country = data.country.toUpperCase();
  if (has('assetClass') || !partial) {
    if (!ASSET_CLASSES.includes(body.assetClass)) errors.push(`assetClass must be one of: ${ASSET_CLASSES.join(', ')}.`);
    else data.assetClass = body.assetClass;
  }
  if (has('tenure')) data.tenure = body.tenure || 'owned';
  else if (!partial) data.tenure = 'owned';

  for (const k of ['grossFloorAreaM2', 'netLeasableM2', 'heatedAreaM2', 'latitude', 'longitude', 'occupancyPct', 'retrofitCost']) {
    if (!has(k)) continue;
    const v = num(body[k]);
    if (v != null && !isFinite(v)) errors.push(`${k} must be a number.`);
    else if (v != null && v < 0 && !['latitude', 'longitude'].includes(k)) errors.push(`${k} must be positive.`);
    else data[k] = v;
  }
  if (!partial || has('grossFloorAreaM2')) {
    if (!(data.grossFloorAreaM2 > 0)) errors.push('grossFloorAreaM2 must be greater than 0.');
  }
  for (const k of ['yearBuilt', 'yearAcquired', 'tenantCount']) {
    if (has(k)) data[k] = int(body[k]);
  }
  if (has('certifications')) data.certifications = body.certifications || null;
  if (has('retrofitDate')) {
    data.retrofitDate = date(body.retrofitDate);
    if (isBadDate(data.retrofitDate)) errors.push('retrofitDate is not a valid date.');
  }
  if (has('retrofitDescription')) data.retrofitDescription = body.retrofitDescription || null;
  if (has('retrofitCurrency')) data.retrofitCurrency = body.retrofitCurrency || null;
  else if (!partial && data.retrofitCost != null) data.retrofitCurrency = 'AMD';
  return { data, errors };
}

// Parse and validate one energy record.  Returns { data, errors }.
function parseRecord(body, partial = false) {
  const errors = [];
  const data = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  const now = new Date();

  if (!partial || has('fuel')) {
    if (!buildingEnergy.isValidFuel(body.fuel)) errors.push(`fuel must be one of: ${Object.keys(buildingEnergy.FUELS).join(', ')}.`);
    else data.fuel = body.fuel;
  }
  if (!partial || has('unit')) {
    const unit = buildingEnergy.normaliseUnit(body.unit || (partial ? '' : 'kWh'));
    if (!unit) errors.push('unit is not recognised.');
    else data.unit = unit;
  }
  if (!partial || has('quantity')) {
    const q = num(body.quantity);
    if (q == null || !isFinite(q) || q <= 0) errors.push('quantity must be greater than 0.');
    else data.quantity = q;
  }
  if (!partial || has('year')) {
    const y = int(body.year);
    if (!y || y < 1900 || y > now.getUTCFullYear()) errors.push('year is required and cannot be in the future.');
    else data.year = y;
  }
  if (has('month')) {
    const m = int(body.month);
    if (m != null && (m < 1 || m > 12)) errors.push('month must be 1–12.');
    else data.month = m;
  }
  if (has('cost')) {
    const c = num(body.cost);
    if (c != null && (!isFinite(c) || c < 0)) errors.push('cost must be a positive number.');
    else data.cost = c;
  }
  if (has('currency')) data.currency = body.currency ? String(body.currency).toUpperCase() : null;
  if (!partial && data.cost != null && !data.currency) data.currency = 'AMD';
  if (has('sourceDoc')) data.sourceDoc = body.sourceDoc ? String(body.sourceDoc).slice(0, 500) : null;
  for (const k of ['periodStart', 'periodEnd']) {
    if (!has(k)) continue;
    data[k] = date(body[k]);
    if (isBadDate(data[k])) errors.push(`${k} is not a valid date.`);
    else if (data[k] && data[k] > now) errors.push(`${k} cannot be in the future.`);
  }
  if (data.periodStart && data.periodEnd && data.periodEnd < data.periodStart) errors.push('periodEnd must be on or after periodStart.');
  if (!partial && !!data.periodStart !== !!data.periodEnd) errors.push('periodStart and periodEnd must be given together.');
  if (data.year && data.month && !has('periodStart')) {
    const thisMonth = now.getUTCFullYear() * 12 + now.getUTCMonth() + 1;
    if (data.year * 12 + data.month > thisMonth) errors.push('Billing month cannot be in the future.');
  }
  return { data, errors };
}

// Fuel/unit pairing check after merging with the existing record (PUT).
function checkFuelUnit(rec) {
  return buildingEnergy.isValidUnit(rec.fuel, rec.unit)
    ? null
    : `Unit ${rec.unit} is not valid for ${buildingEnergy.FUELS[rec.fuel]?.label || rec.fuel}. Allowed: ${(buildingEnergy.FUELS[rec.fuel]?.units || []).join(', ')}.`;
}

async function findAsset(req) {
  return prisma.realEstateAsset.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
}

// ─── Reference data ─────────────────────────────────────────────────────────

router.get('/meta', (_req, res) => {
  res.json({
    assetClasses: ASSET_CLASSES,
    fuels: Object.entries(buildingEnergy.FUELS).map(([key, f]) => ({ key, label: f.label, units: f.units })),
    maxBulk: MAX_BULK,
  });
});

// ─── Asset CRUD ─────────────────────────────────────────────────────────────

router.post('/assets', async (req, res) => {
  try {
    const { data, errors } = parseAsset(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join(' '), errors });
    const asset = await prisma.realEstateAsset.create({ data: { ...data, companyId: req.user.companyId } });
    logActivity(req.user.id, req.user.companyId, 'RE_ASSET_CREATE', `Created asset ${asset.name}`, { assetId: asset.id }, req.ip);
    res.status(201).json(asset);
  } catch (err) { sendError(res, err); }
});

router.get('/assets', async (req, res) => {
  try {
    const assets = await prisma.realEstateAsset.findMany({
      where: { companyId: req.user.companyId },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { energyRecords: true } },
        crremPathways: true,
        energyRecords: true,
      },
    });
    const tariffs = await loadTariffs(req.user.companyId);
    const fx = buildingEnergy.fxRates();
    // Attach a compact intensity summary for the list view.
    const out = assets.map(({ energyRecords, ...a }) => {
      const s = buildingEnergy.computeIntensity(a, energyRecords, { tariffs, fx });
      return {
        ...a,
        summary: {
          latestKwhPerM2: (s.post && s.post.monthsCovered ? s.post : s.baseline)?.kwhPerM2 ?? null,
          changePct: s.change ? s.change.kwhPerM2Pct : null,
        },
      };
    });
    res.json(out);
  } catch (err) { sendError(res, err); }
});

router.get('/assets/:id', async (req, res) => {
  try {
    const asset = await prisma.realEstateAsset.findFirst({
      where: { id: req.params.id, companyId: req.user.companyId },
      include: { energyRecords: { orderBy: [{ year: 'desc' }, { month: 'desc' }, { fuel: 'asc' }, { createdAt: 'desc' }] }, crremPathways: true },
    });
    if (!asset) return res.status(404).json({ error: 'Asset not found.' });
    // Computed kWh per record for the records table — same conversion as everywhere else.
    asset.energyRecords = asset.energyRecords.map((r) => {
      const c = buildingEnergy.convertRecord(r, asset.country);
      return { ...r, kwh: c.kwh == null ? null : Math.round(c.kwh) };
    });
    res.json(asset);
  } catch (err) { sendError(res, err); }
});

router.put('/assets/:id', async (req, res) => {
  try {
    const asset = await findAsset(req);
    if (!asset) return res.status(404).json({ error: 'Asset not found.' });
    const { data, errors } = parseAsset(req.body, true);
    if (errors.length) return res.status(400).json({ error: errors.join(' '), errors });
    const updated = await prisma.realEstateAsset.update({ where: { id: asset.id }, data });
    logActivity(req.user.id, req.user.companyId, 'RE_ASSET_UPDATE', `Updated asset ${updated.name}`, { assetId: asset.id, fields: Object.keys(data) }, req.ip);
    res.json(updated);
  } catch (err) { sendError(res, err); }
});

router.delete('/assets/:id', async (req, res) => {
  try {
    const asset = await findAsset(req);
    if (!asset) return res.status(404).json({ error: 'Asset not found.' });
    await prisma.realEstateAsset.delete({ where: { id: asset.id } });
    logActivity(req.user.id, req.user.companyId, 'RE_ASSET_DELETE', `Deleted asset ${asset.name}`, { assetId: asset.id }, req.ip);
    res.json({ message: 'Asset deleted.' });
  } catch (err) { sendError(res, err); }
});

// ─── Energy records ─────────────────────────────────────────────────────────

router.post('/assets/:id/energy', async (req, res) => {
  try {
    const asset = await findAsset(req);
    if (!asset) return res.status(404).json({ error: 'Asset not found.' });
    const { data, errors } = parseRecord(req.body);
    const fu = !errors.length && checkFuelUnit(data);
    if (fu) errors.push(fu);
    if (errors.length) return res.status(400).json({ error: errors.join(' '), errors });
    const record = await prisma.assetEnergyRecord.create({ data: { ...data, assetId: asset.id } });
    logActivity(req.user.id, req.user.companyId, 'RE_ENERGY_CREATE', `Added ${data.fuel} record to ${asset.name}`, { assetId: asset.id, recordId: record.id }, req.ip);
    res.status(201).json(record);
  } catch (err) { sendError(res, err); }
});

// Bulk import (seeding and CSV) — all-or-nothing.
router.post('/assets/:id/energy/bulk', async (req, res) => {
  try {
    const asset = await findAsset(req);
    if (!asset) return res.status(404).json({ error: 'Asset not found.' });
    const rows = Array.isArray(req.body) ? req.body : req.body.records;
    if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'Send a non-empty array of records.' });
    if (rows.length > MAX_BULK) return res.status(400).json({ error: `At most ${MAX_BULK} records per import.` });

    const parsed = [];
    const rowErrors = [];
    rows.forEach((row, i) => {
      const { data, errors } = parseRecord(row || {});
      const fu = !errors.length && checkFuelUnit(data);
      if (fu) errors.push(fu);
      if (errors.length) rowErrors.push({ row: i + 1, errors });
      else parsed.push({ ...data, assetId: asset.id });
    });
    if (rowErrors.length) {
      return res.status(400).json({
        error: `${rowErrors.length} row(s) failed validation; nothing was imported. First: row ${rowErrors[0].row} — ${rowErrors[0].errors.join(' ')}`,
        rowErrors,
      });
    }
    const result = await prisma.$transaction(parsed.map((d) => prisma.assetEnergyRecord.create({ data: d })));
    logActivity(req.user.id, req.user.companyId, 'RE_ENERGY_BULK', `Imported ${result.length} energy records to ${asset.name}`, { assetId: asset.id, count: result.length }, req.ip);
    res.status(201).json({ imported: result.length });
  } catch (err) { sendError(res, err); }
});

async function findRecord(req, asset) {
  return prisma.assetEnergyRecord.findFirst({ where: { id: req.params.recordId, assetId: asset.id } });
}

router.put('/assets/:id/energy/:recordId', async (req, res) => {
  try {
    const asset = await findAsset(req);
    if (!asset) return res.status(404).json({ error: 'Asset not found.' });
    const record = await findRecord(req, asset);
    if (!record) return res.status(404).json({ error: 'Energy record not found.' });
    const { data, errors } = parseRecord(req.body, true);
    const merged = { ...record, ...data };
    const fu = !errors.length && checkFuelUnit(merged);
    if (fu) errors.push(fu);
    if (!!merged.periodStart !== !!merged.periodEnd) errors.push('periodStart and periodEnd must be given together.');
    else if (merged.periodStart && new Date(merged.periodEnd) < new Date(merged.periodStart)) errors.push('periodEnd must be on or after periodStart.');
    if (errors.length) return res.status(400).json({ error: errors.join(' '), errors });
    const updated = await prisma.assetEnergyRecord.update({ where: { id: record.id }, data });
    logActivity(req.user.id, req.user.companyId, 'RE_ENERGY_UPDATE', `Updated ${updated.fuel} record on ${asset.name}`, { assetId: asset.id, recordId: record.id, fields: Object.keys(data) }, req.ip);
    res.json(updated);
  } catch (err) { sendError(res, err); }
});

router.delete('/assets/:id/energy/:recordId', async (req, res) => {
  try {
    const asset = await findAsset(req);
    if (!asset) return res.status(404).json({ error: 'Asset not found.' });
    const record = await findRecord(req, asset);
    if (!record) return res.status(404).json({ error: 'Energy record not found.' });
    await prisma.assetEnergyRecord.delete({ where: { id: record.id } });
    logActivity(req.user.id, req.user.companyId, 'RE_ENERGY_DELETE', `Deleted ${record.fuel} record from ${asset.name}`, { assetId: asset.id, recordId: record.id, sourceDoc: record.sourceDoc }, req.ip);
    res.json({ message: 'Energy record deleted.' });
  } catch (err) { sendError(res, err); }
});

// ─── Intensity (before / after retrofit) ────────────────────────────────────

// Per-fuel tariffs for estimated cost savings.  CompanyFinancials only holds
// an electricity price today (stored in USD), so other fuels need bill costs.
async function loadTariffs(companyId) {
  const fin = await prisma.companyFinancials.findUnique({ where: { companyId } }).catch(() => null);
  const tariffs = {};
  if (fin && fin.electricityPricePerKwh > 0) tariffs.electricity = { price: fin.electricityPricePerKwh, currency: 'USD' };
  return tariffs;
}

router.get('/assets/:id/intensity', async (req, res) => {
  try {
    const asset = await prisma.realEstateAsset.findFirst({
      where: { id: req.params.id, companyId: req.user.companyId },
      include: { energyRecords: true },
    });
    if (!asset) return res.status(404).json({ error: 'Asset not found.' });
    const { energyRecords, ...a } = asset;
    const result = buildingEnergy.computeIntensity(a, energyRecords, {
      tariffs: await loadTariffs(req.user.companyId),
      fx: buildingEnergy.fxRates(),
    });
    res.json(result);
  } catch (err) { sendError(res, err); }
});

// ─── CRREM Analysis ─────────────────────────────────────────────────────────

router.post('/assets/:id/crrem', async (req, res) => {
  try {
    const asset = await findAsset(req);
    if (!asset) return res.status(404).json({ error: 'Asset not found.' });
    const scenario = req.body.scenario || '1.5C';
    const result = await crremEngine.analyseAsset(asset.id, scenario);
    res.json(result);
  } catch (err) {
    if (err.code === 'NO_COUNTRY_PATHWAY') return res.status(422).json({ error: err.message, code: err.code });
    sendError(res, err);
  }
});

router.get('/portfolio/crrem', async (req, res) => {
  try {
    const results = await crremEngine.analysePortfolio(req.user.companyId);
    res.json(results);
  } catch (err) { sendError(res, err); }
});

module.exports = router;
module.exports._test = { parseRecord, parseAsset };
