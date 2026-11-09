'use strict';

const router = require('express').Router();
const multer = require('multer');
const XLSX = require('xlsx');
const prisma = require('../config/prisma');
const { authenticate } = require('../middleware/auth');
const { requireFeature } = require('../middleware/tier');
const { formatError } = require('../utils/errors');
const { logActivity } = require('../utils/activityLog');
const geospatial = require('../services/geospatialService');
const waterEngine = require('../services/waterEngine');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.use(authenticate);
router.use(requireFeature('water_resources'));

// ═══════════════════════════════════════════════════════════════════════════
// Sites CRUD
// ═══════════════════════════════════════════════════════════════════════════

router.post('/sites', async (req, res) => {
  try {
    const { name, siteType, country, address, latitude, longitude, orgUnitId } = req.body;
    if (!name || !siteType || !country) {
      return res.status(400).json({ error: 'Name, siteType, and country are required.' });
    }

    const lat = latitude != null ? parseFloat(latitude) : null;
    const lng = longitude != null ? parseFloat(longitude) : null;

    // Auto-enrich with geospatial data
    const waterStress = geospatial.lookupWaterStress(lat, lng);
    const protectedArea = geospatial.lookupProtectedAreas(lat, lng);

    const site = await prisma.site.create({
      data: {
        companyId: req.user.companyId,
        orgUnitId: orgUnitId || null,
        name,
        siteType,
        country,
        address: address || null,
        latitude: lat,
        longitude: lng,
        waterStress,
        protectedArea,
      },
    });

    logActivity(req.user.id, req.user.companyId, 'SITE_CREATE', `Created site ${name}`, { siteId: site.id }, req.ip);
    res.status(201).json(site);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.get('/sites', async (req, res) => {
  try {
    const sites = await prisma.site.findMany({
      where: { companyId: req.user.companyId },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { waterActivities: true, biodiversityAssessments: true } },
      },
    });
    res.json(sites);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.put('/sites/:id', async (req, res) => {
  try {
    const existing = await prisma.site.findFirst({
      where: { id: req.params.id, companyId: req.user.companyId },
    });
    if (!existing) return res.status(404).json({ error: 'Site not found.' });

    const { name, siteType, country, address, latitude, longitude, orgUnitId } = req.body;
    const lat = latitude != null ? parseFloat(latitude) : existing.latitude;
    const lng = longitude != null ? parseFloat(longitude) : existing.longitude;

    // Re-enrich geospatial if coordinates changed
    const coordsChanged = lat !== existing.latitude || lng !== existing.longitude;
    const waterStress = coordsChanged ? geospatial.lookupWaterStress(lat, lng) : existing.waterStress;
    const protectedArea = coordsChanged ? geospatial.lookupProtectedAreas(lat, lng) : existing.protectedArea;

    const site = await prisma.site.update({
      where: { id: req.params.id },
      data: {
        name: name || existing.name,
        siteType: siteType || existing.siteType,
        country: country || existing.country,
        address: address !== undefined ? address : existing.address,
        latitude: lat,
        longitude: lng,
        orgUnitId: orgUnitId !== undefined ? (orgUnitId || null) : existing.orgUnitId,
        waterStress,
        protectedArea,
      },
    });

    logActivity(req.user.id, req.user.companyId, 'SITE_UPDATE', `Updated site ${site.name}`, { siteId: site.id }, req.ip);
    res.json(site);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.delete('/sites/:id', async (req, res) => {
  try {
    const site = await prisma.site.findFirst({
      where: { id: req.params.id, companyId: req.user.companyId },
    });
    if (!site) return res.status(404).json({ error: 'Site not found.' });
    await prisma.site.delete({ where: { id: req.params.id } });
    logActivity(req.user.id, req.user.companyId, 'SITE_DELETE', `Deleted site ${site.name}`, { siteId: site.id }, req.ip);
    res.json({ message: 'Site deleted.' });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Water Data — single record
// ═══════════════════════════════════════════════════════════════════════════

router.post('/data', async (req, res) => {
  try {
    const { siteId, year, month, source, flowType, quantity, unit, destination, quality, recycledReused, sourceDoc } = req.body;
    if (!siteId || !year || !source || !flowType || quantity == null) {
      return res.status(400).json({ error: 'siteId, year, source, flowType, and quantity are required.' });
    }

    // Verify site belongs to this company
    const site = await prisma.site.findFirst({ where: { id: siteId, companyId: req.user.companyId } });
    if (!site) return res.status(404).json({ error: 'Site not found.' });

    const record = await prisma.waterActivity.create({
      data: {
        companyId: req.user.companyId,
        siteId,
        year: parseInt(year),
        month: month ? parseInt(month) : null,
        source,
        flowType,
        quantity: parseFloat(quantity),
        unit: unit || 'm3',
        destination: destination || null,
        quality: quality || null,
        recycledReused: recycledReused === true || recycledReused === 'true',
        sourceDoc: sourceDoc || null,
      },
    });

    logActivity(req.user.id, req.user.companyId, 'WATER_DATA_CREATE', `Added water ${flowType} record for site ${site.name}`, { recordId: record.id, siteId }, req.ip);
    res.status(201).json(record);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.get('/data', async (req, res) => {
  try {
    const { year, siteId, flowType, source } = req.query;
    const where = { companyId: req.user.companyId };
    if (year) where.year = parseInt(year);
    if (siteId) where.siteId = siteId;
    if (flowType) where.flowType = flowType;
    if (source) where.source = source;

    const records = await prisma.waterActivity.findMany({
      where,
      include: { site: { select: { id: true, name: true, waterStress: true } } },
      orderBy: [{ year: 'desc' }, { month: 'asc' }],
    });
    res.json(records);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Water Data — bulk upload (Excel/CSV)
// ═══════════════════════════════════════════════════════════════════════════

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const { siteId } = req.body;
    if (!siteId) return res.status(400).json({ error: 'siteId is required.' });

    const site = await prisma.site.findFirst({ where: { id: siteId, companyId: req.user.companyId } });
    if (!site) return res.status(404).json({ error: 'Site not found.' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    if (!rows.length) return res.status(400).json({ error: 'No data rows found in file.' });

    const VALID_SOURCES = ['surface', 'ground', 'third_party', 'seawater', 'produced', 'rainwater'];
    const VALID_FLOW_TYPES = ['withdrawal', 'discharge', 'consumption'];

    const created = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const yr = parseInt(row.year || row.Year);
        const src = (row.source || row.Source || '').toLowerCase();
        const ft = (row.flowType || row.flow_type || row.FlowType || '').toLowerCase();
        const qty = parseFloat(row.quantity || row.Quantity || row.volume || row.Volume);

        if (!yr || isNaN(qty)) {
          errors.push({ row: i + 2, error: 'Missing year or quantity' });
          continue;
        }
        if (!VALID_SOURCES.includes(src)) {
          errors.push({ row: i + 2, error: `Invalid source: ${src}` });
          continue;
        }
        if (!VALID_FLOW_TYPES.includes(ft)) {
          errors.push({ row: i + 2, error: `Invalid flowType: ${ft}` });
          continue;
        }

        const record = await prisma.waterActivity.create({
          data: {
            companyId: req.user.companyId,
            siteId,
            year: yr,
            month: row.month || row.Month ? parseInt(row.month || row.Month) : null,
            source: src,
            flowType: ft,
            quantity: qty,
            unit: row.unit || row.Unit || 'm3',
            destination: row.destination || row.Destination || null,
            quality: row.quality || row.Quality || null,
            recycledReused: row.recycledReused === true || row.recycledReused === 'true' || row.recycled === true || row.recycled === 'true',
            sourceDoc: req.file.originalname,
          },
        });
        created.push(record.id);
      } catch (rowErr) {
        errors.push({ row: i + 2, error: rowErr.message });
      }
    }

    logActivity(req.user.id, req.user.companyId, 'WATER_UPLOAD', `Uploaded ${created.length} water records from ${req.file.originalname}`, { siteId, created: created.length, errors: errors.length }, req.ip);

    res.json({
      message: `Processed ${rows.length} rows: ${created.length} created, ${errors.length} errors.`,
      created: created.length,
      errors,
    });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// KPIs
// ═══════════════════════════════════════════════════════════════════════════

router.get('/kpis', async (req, res) => {
  try {
    const year = req.query.year || new Date().getFullYear();
    const kpis = await waterEngine.computeWaterKpis(req.user.companyId, year);
    res.json(kpis);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Water-Stress Exposure
// ═══════════════════════════════════════════════════════════════════════════

router.get('/stress-exposure', async (req, res) => {
  try {
    const year = req.query.year || new Date().getFullYear();
    const exposure = await waterEngine.computeWaterStressExposure(req.user.companyId, year);
    res.json(exposure);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Dashboard (aggregated view)
// ═══════════════════════════════════════════════════════════════════════════

router.get('/dashboard', async (req, res) => {
  try {
    const year = req.query.year || new Date().getFullYear();
    const [aggregation, stressExposure, kpis] = await Promise.all([
      waterEngine.aggregateWater(req.user.companyId, year),
      waterEngine.computeWaterStressExposure(req.user.companyId, year),
      waterEngine.computeWaterKpis(req.user.companyId, year),
    ]);

    res.json({
      year: parseInt(year),
      aggregation,
      stressExposure,
      kpis,
    });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

module.exports = router;
