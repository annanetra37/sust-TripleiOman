/**
 * ISO → GRI Bridge Routes
 *
 * Mounted at /api/iso-gri in server.js
 *
 * Sprint 1:
 * GET  /rules             — list mapping rules (filter by isoStandard, griCode)
 * GET  /rules/summary     — aggregate coverage by GRI topic family
 * POST /upload            — upload ISO data (Excel/CSV)
 * POST /classify          — run classification + gap analysis
 * GET  /gaps              — gap analysis results
 * GET  /gaps/readiness    — readiness score
 * GET  /gaps/export       — export gap report as PDF
 *
 * Sprint 2 (platform connectors + drilldown):
 * GET  /platforms         — list available ISO platform connectors
 * POST /connect           — test a platform connection
 * POST /fetch             — fetch ISO data from a connected platform and ingest
 * GET  /gaps/:griCode     — per-disclosure drilldown (sources, rules, actions)
 */

const router = require('express').Router();
const multer = require('multer');
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');
const prisma = require('../config/prisma');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLog');
const {
  classifyIngestion,
  computeGapAnalysis,
  getReadinessScore,
  GRI_TOPIC_FAMILIES,
} = require('../services/isoGriEngine');
const {
  connectPlatform,
  fetchPlatformData,
  PLATFORMS,
} = require('../services/isoConnectors');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const { requireFeature } = require('../middleware/tier');

router.use(authenticate);
router.use(requireFeature('iso_gri_bridge'));

// ─── GET /rules — list all mapping rules ────────────────────────

router.get('/rules', async (req, res) => {
  try {
    const { isoStandard, griCode } = req.query;
    const where = {};
    if (isoStandard) where.isoStandard = isoStandard;
    if (griCode) where.griCode = { contains: griCode };

    const rules = await prisma.isoGriMappingRule.findMany({
      where,
      orderBy: [{ isoStandard: 'asc' }, { isoClause: 'asc' }],
    });

    res.json({ count: rules.length, rules });
  } catch (err) {
    console.error('[isoGri] GET /rules error:', err);
    res.status(500).json({ error: 'Failed to fetch mapping rules' });
  }
});

// ─── GET /rules/summary — aggregate by GRI topic family ────────

router.get('/rules/summary', async (req, res) => {
  try {
    const rules = await prisma.isoGriMappingRule.findMany();

    const summary = GRI_TOPIC_FAMILIES.map((family) => {
      const matching = rules.filter((r) => family.pattern.test(r.griCode));
      const full = matching.filter((r) => r.coverageLevel === 'FULL').length;
      const partial = matching.filter((r) => r.coverageLevel === 'PARTIAL').length;
      const supporting = matching.filter((r) => r.coverageLevel === 'SUPPORTING').length;

      // Unique ISO standards contributing
      const isoSources = [...new Set(matching.map((r) => r.isoStandard))];

      return {
        family: family.family,
        label: family.label,
        totalRules: matching.length,
        full,
        partial,
        supporting,
        isoSources,
        disclosureCount: family.disclosures.length,
      };
    });

    res.json({ summary });
  } catch (err) {
    console.error('[isoGri] GET /rules/summary error:', err);
    res.status(500).json({ error: 'Failed to compute rules summary' });
  }
});

// ─── POST /upload — upload ISO data (Excel/CSV) ────────────────

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const { companyId } = req.user;
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (data.length === 0) {
      return res.status(400).json({ error: 'No data found in file' });
    }

    // Expected columns: isoStandard, isoClause, dataDescription, dataValue, year
    const requiredCols = ['isoStandard', 'isoClause'];
    const cols = Object.keys(data[0]).map((c) => c.toLowerCase().replace(/[\s_-]/g, ''));
    const colMap = {};

    // Flexible column name matching
    for (const key of Object.keys(data[0])) {
      const norm = key.toLowerCase().replace(/[\s_-]/g, '');
      if (norm.includes('isostandard') || norm.includes('standard')) colMap.isoStandard = key;
      else if (norm.includes('isoclause') || norm.includes('clause')) colMap.isoClause = key;
      else if (norm.includes('description') || norm.includes('datacaptured')) colMap.dataDescription = key;
      else if (norm.includes('datavalue') || norm.includes('value')) colMap.dataValue = key;
      else if (norm === 'year') colMap.year = key;
    }

    if (!colMap.isoStandard || !colMap.isoClause) {
      return res.status(400).json({
        error: 'Missing required columns. Expected: isoStandard, isoClause (+ optional: dataDescription, dataValue, year)',
        foundColumns: Object.keys(data[0]),
      });
    }

    let created = 0;
    let skipped = 0;
    const defaultYear = new Date().getFullYear();

    for (const row of data) {
      const isoStandard = String(row[colMap.isoStandard] || '').trim();
      const isoClause = String(row[colMap.isoClause] || '').trim();

      if (!isoStandard || !isoClause) { skipped++; continue; }

      // Normalise ISO standard name: "ISO 14001" → "ISO_14001"
      const normStandard = isoStandard.replace(/\s+/g, '_').toUpperCase();

      await prisma.isoDataIngestion.create({
        data: {
          companyId,
          isoStandard: normStandard,
          isoClause,
          dataDescription: colMap.dataDescription ? String(row[colMap.dataDescription] || '') : null,
          dataValue: colMap.dataValue ? String(row[colMap.dataValue] || '') : null,
          sourceFile: req.file.originalname,
          year: colMap.year ? (parseInt(row[colMap.year]) || defaultYear) : defaultYear,
        },
      });
      created++;
    }

    logActivity(
      req.user.id, companyId, 'ISO_DATA_UPLOAD',
      `Uploaded ${req.file.originalname}: ${created} records ingested, ${skipped} skipped`,
      { fileName: req.file.originalname, created, skipped },
      req.ip
    );

    res.json({
      message: 'ISO data uploaded successfully',
      records: created,
      skipped,
      fileName: req.file.originalname,
    });
  } catch (err) {
    console.error('[isoGri] POST /upload error:', err);
    res.status(500).json({ error: 'Failed to process ISO data upload' });
  }
});

// ─── POST /classify — run classification + gap analysis ────────

router.post('/classify', async (req, res) => {
  try {
    const { companyId } = req.user;
    const year = parseInt(req.body.year) || new Date().getFullYear();

    // Step 1: Classify ingested data against mapping rules
    const classification = await classifyIngestion(companyId, year);

    // Step 2: Compute gap analysis
    const gaps = await computeGapAnalysis(companyId, year);

    // Step 3: Get readiness score
    const readiness = await getReadinessScore(companyId, year);

    logActivity(
      req.user.id, companyId, 'ISO_GRI_CLASSIFY',
      `Classification complete: ${classification.classified}/${classification.total} records classified, readiness ${readiness.overall}%`,
      { year, ...classification, readiness: readiness.overall },
      req.ip
    );

    res.json({
      classification,
      gapCount: gaps.length,
      readiness,
    });
  } catch (err) {
    console.error('[isoGri] POST /classify error:', err);
    res.status(500).json({ error: 'Classification failed' });
  }
});

// ─── GET /gaps — gap analysis results ───────────────────────────

router.get('/gaps', async (req, res) => {
  try {
    const { companyId } = req.user;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const { status, family } = req.query;

    const where = { companyId, year };
    if (status) where.status = status;
    if (family) where.griTopicFamily = family;

    const gaps = await prisma.griGapAnalysis.findMany({
      where,
      orderBy: [{ griTopicFamily: 'asc' }, { griCode: 'asc' }],
    });

    res.json({ year, count: gaps.length, gaps });
  } catch (err) {
    console.error('[isoGri] GET /gaps error:', err);
    res.status(500).json({ error: 'Failed to fetch gap analysis' });
  }
});

// ─── GET /gaps/readiness — readiness score ──────────────────────

router.get('/gaps/readiness', async (req, res) => {
  try {
    const { companyId } = req.user;
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const readiness = await getReadinessScore(companyId, year);
    res.json({ year, ...readiness });
  } catch (err) {
    console.error('[isoGri] GET /gaps/readiness error:', err);
    res.status(500).json({ error: 'Failed to compute readiness score' });
  }
});

// ─── GET /gaps/export — export gap report as PDF ────────────────

router.get('/gaps/export', async (req, res) => {
  try {
    const { companyId } = req.user;
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const [company, gaps, readiness] = await Promise.all([
      prisma.company.findUnique({ where: { id: companyId } }),
      prisma.griGapAnalysis.findMany({
        where: { companyId, year },
        orderBy: [{ griTopicFamily: 'asc' }, { griCode: 'asc' }],
      }),
      getReadinessScore(companyId, year),
    ]);

    if (gaps.length === 0) {
      return res.status(404).json({
        error: 'No gap analysis data found. Run /classify first.',
      });
    }

    // ── Generate PDF ────────────────────────────────────────────
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="ISO_GRI_Readiness_${company.name.replace(/\s/g, '_')}_${year}.pdf"`
    );
    doc.pipe(res);

    // ── Cover page ──────────────────────────────────────────────
    doc.moveDown(6);
    doc.fontSize(28).font('Helvetica-Bold').text('ISO → GRI', { align: 'center' });
    doc.fontSize(22).text('Readiness Assessment', { align: 'center' });
    doc.moveDown(2);
    doc.fontSize(16).font('Helvetica').text(company.name, { align: 'center' });
    doc.fontSize(12).text(`Reporting Year: ${year}`, { align: 'center' });
    doc.text(`Generated: ${new Date().toISOString().split('T')[0]}`, { align: 'center' });
    doc.moveDown(4);

    // Overall readiness — big number
    doc.fontSize(60).font('Helvetica-Bold').text(`${readiness.overall}%`, { align: 'center' });
    doc.fontSize(14).font('Helvetica').text('Overall GRI Readiness', { align: 'center' });
    doc.moveDown(1);
    doc.fontSize(11).text(
      `${readiness.covered} Covered | ${readiness.partial} Partial | ${readiness.gap} Gaps  (${readiness.totalDisclosures} total disclosures)`,
      { align: 'center' }
    );

    // ── Per-topic-family heatmap table ──────────────────────────
    doc.addPage();
    doc.fontSize(18).font('Helvetica-Bold').text('Coverage by GRI Topic Family', { underline: true });
    doc.moveDown(1);

    // Table header
    const tableTop = doc.y;
    const colX = { family: 50, status: 200, iso: 320, gaps: 430 };

    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('GRI Topic', colX.family, tableTop);
    doc.text('Readiness', colX.status, tableTop);
    doc.text('ISO Sources', colX.iso, tableTop);
    doc.text('Gaps', colX.gaps, tableTop);
    doc.moveDown(0.5);

    let rowY = doc.y;
    doc.moveTo(50, rowY).lineTo(545, rowY).stroke();
    rowY += 5;

    doc.font('Helvetica').fontSize(9);
    for (const f of readiness.byFamily) {
      if (rowY > 750) {
        doc.addPage();
        rowY = 50;
      }

      // Find ISO sources from the gaps data
      const familyGaps = gaps.filter((g) => g.griTopicFamily === f.family);
      const isoSources = new Set();
      familyGaps.forEach((g) => {
        if (g.coveringSources) {
          const sources = Array.isArray(g.coveringSources) ? g.coveringSources : [];
          sources.forEach((s) => isoSources.add(s.isoStandard));
        }
      });
      const gapCount = familyGaps.filter((g) => g.status === 'GAP').length;

      // Color-code readiness
      const readinessColor = f.readiness >= 70 ? '#2E7D32' : f.readiness >= 40 ? '#F57F17' : '#C62828';

      doc.fillColor('#000000').text(`${f.family} (${f.label})`, colX.family, rowY, { width: 145 });
      doc.fillColor(readinessColor).text(`${f.readiness}%`, colX.status, rowY, { width: 50 });
      doc.fillColor('#000000');
      doc.text(
        [...isoSources].map((s) => s.replace('ISO_', 'ISO ')).join(', ') || 'None',
        colX.iso, rowY, { width: 105 }
      );
      doc.text(`${gapCount}/${f.total}`, colX.gaps, rowY);

      rowY += 20;
    }

    // ── Detailed gap list by family ─────────────────────────────
    doc.addPage();
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#000000').text('Detailed Gap Analysis', { underline: true });
    doc.moveDown(1);

    // Group gaps by family
    const groupedGaps = {};
    for (const g of gaps) {
      if (!groupedGaps[g.griTopicFamily]) groupedGaps[g.griTopicFamily] = [];
      groupedGaps[g.griTopicFamily].push(g);
    }

    for (const [familyKey, familyGaps] of Object.entries(groupedGaps)) {
      const familyDef = GRI_TOPIC_FAMILIES.find((f) => f.family === familyKey);

      if (doc.y > 680) doc.addPage();

      doc.fontSize(13).font('Helvetica-Bold').text(`${familyKey} — ${familyDef ? familyDef.label : ''}`);
      doc.moveDown(0.3);

      doc.fontSize(8).font('Helvetica');
      for (const g of familyGaps) {
        if (doc.y > 740) doc.addPage();

        const statusIcon = g.status === 'COVERED' ? '[OK]' : g.status === 'PARTIAL' ? '[!!]' : '[--]';
        const statusColor = g.status === 'COVERED' ? '#2E7D32' : g.status === 'PARTIAL' ? '#F57F17' : '#C62828';

        doc.fillColor(statusColor).text(
          `  ${statusIcon} ${g.griCode} — ${g.griName}  (${g.status})`,
          { continued: false }
        );

        if (g.status !== 'COVERED' && g.recommendedAction) {
          doc.fillColor('#555555').text(`       Action: ${g.recommendedAction}`);
        }
      }
      doc.moveDown(0.5);
      doc.fillColor('#000000');
    }

    // ── Recommended actions section ─────────────────────────────
    const gapItems = gaps.filter((g) => g.status === 'GAP' && g.recommendedAction);
    if (gapItems.length > 0) {
      doc.addPage();
      doc.fontSize(18).font('Helvetica-Bold').text('Recommended Actions', { underline: true });
      doc.moveDown(1);

      doc.fontSize(10).font('Helvetica');
      // Deduplicate actions
      const seen = new Set();
      let actionNum = 1;
      for (const g of gapItems) {
        if (seen.has(g.recommendedAction)) continue;
        seen.add(g.recommendedAction);

        if (doc.y > 740) doc.addPage();
        doc.text(`${actionNum}. ${g.recommendedAction}`);
        doc.moveDown(0.3);
        actionNum++;
      }
    }

    // ── Footer ──────────────────────────────────────────────────
    doc.addPage();
    doc.moveDown(10);
    doc.fontSize(10).font('Helvetica').fillColor('#888888').text(
      'This report was generated by Triple I ESG Portal. ' +
      'The ISO → GRI mapping is based on the ISO-to-GRI Mapping Matrix v1.0. ' +
      'Coverage assessments are indicative and should be reviewed by a qualified sustainability professional.',
      { align: 'center' }
    );

    doc.end();

    logActivity(
      req.user.id, companyId, 'ISO_GRI_EXPORT',
      `Exported ISO → GRI readiness report (PDF) for ${year}`,
      { year, readiness: readiness.overall },
      req.ip
    );
  } catch (err) {
    console.error('[isoGri] GET /gaps/export error:', err);
    res.status(500).json({ error: 'Failed to generate gap report' });
  }
});

// ─── GET /platforms — list available platform connectors ────────

router.get('/platforms', async (req, res) => {
  try {
    res.json({ platforms: PLATFORMS });
  } catch (err) {
    console.error('[isoGri] GET /platforms error:', err);
    res.status(500).json({ error: 'Failed to list platforms' });
  }
});

// ─── POST /connect — test a platform connection ────────────────

router.post('/connect', async (req, res) => {
  try {
    const { platform, config } = req.body;

    if (!platform) {
      return res.status(400).json({ error: 'Missing required field: platform' });
    }

    const result = connectPlatform(platform, config);

    logActivity(
      req.user.id,
      req.user.companyId,
      'ISO_PLATFORM_CONNECT',
      `Platform connection test: ${platform} — ${result.success ? 'success' : 'failed'}`,
      { platform, success: result.success },
      req.ip
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (err) {
    console.error('[isoGri] POST /connect error:', err);
    res.status(500).json({ error: 'Platform connection test failed' });
  }
});

// ─── POST /fetch — fetch ISO data from a platform and ingest ───

router.post('/fetch', async (req, res) => {
  try {
    const { platform, config, year } = req.body;
    const { companyId } = req.user;

    if (!platform) {
      return res.status(400).json({ error: 'Missing required field: platform' });
    }

    const resolvedYear = parseInt(year) || new Date().getFullYear();

    // 1. Fetch normalised data from the platform connector
    const result = fetchPlatformData(platform, config, resolvedYear);

    if (!result.success) {
      return res.status(400).json(result);
    }

    if (!result.data || result.data.length === 0) {
      return res.status(200).json({
        message: 'Platform returned no data',
        platform,
        year: resolvedYear,
        ingested: 0,
      });
    }

    // 2. Ingest into IsoDataIngestion table
    let created = 0;
    for (const record of result.data) {
      await prisma.isoDataIngestion.create({
        data: {
          companyId,
          isoStandard: record.isoStandard,
          isoClause: record.isoClause,
          dataDescription: record.dataDescription || null,
          dataValue: record.dataValue || null,
          sourceFile: `platform:${platform}`,
          year: record.year || resolvedYear,
        },
      });
      created++;
    }

    logActivity(
      req.user.id,
      companyId,
      'ISO_PLATFORM_FETCH',
      `Fetched ${created} records from ${platform} for year ${resolvedYear}`,
      { platform, year: resolvedYear, created },
      req.ip
    );

    res.json({
      message: `Successfully ingested data from ${platform}`,
      platform,
      year: resolvedYear,
      ingested: created,
      note: result.note || null,
    });
  } catch (err) {
    console.error('[isoGri] POST /fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch and ingest platform data' });
  }
});

// ─── GET /gaps/:griCode — per-disclosure drilldown ─────────────

router.get('/gaps/:griCode', async (req, res) => {
  try {
    const { companyId } = req.user;
    const griCode = decodeURIComponent(req.params.griCode).trim();
    const year = parseInt(req.query.year) || new Date().getFullYear();

    if (!griCode) {
      return res.status(400).json({ error: 'GRI disclosure code is required' });
    }

    // 1. Gap analysis row for this disclosure
    const gapRow = await prisma.griGapAnalysis.findUnique({
      where: {
        companyId_griCode_year: {
          companyId,
          griCode,
          year,
        },
      },
    });

    if (!gapRow) {
      return res.status(404).json({
        error: `No gap analysis data found for ${griCode} (year ${year}). Run /classify first.`,
      });
    }

    // 2. All IsoDataIngestion rows classified to this GRI code
    const ingestions = await prisma.isoDataIngestion.findMany({
      where: {
        companyId,
        year,
        classifiedGri: { contains: griCode.replace(/^GRI\s*/, '') },
      },
      orderBy: { createdAt: 'desc' },
    });

    // 3. Mapping rules that connect ISO data to this GRI code
    const rules = await prisma.isoGriMappingRule.findMany({
      where: {
        griCode: { contains: griCode.replace(/^GRI\s*/, '') },
      },
    });

    // 4. Build the paired sources array: each ingestion linked to its rule
    const sources = ingestions.map((ing) => {
      const matchingRule = rules.find(
        (r) => r.isoStandard === ing.isoStandard && r.isoClause === ing.isoClause
      );
      return {
        ingestion: {
          id: ing.id,
          isoStandard: ing.isoStandard,
          isoClause: ing.isoClause,
          dataDescription: ing.dataDescription,
          dataValue: ing.dataValue,
          sourceFile: ing.sourceFile,
          coverageLevel: ing.coverageLevel,
          createdAt: ing.createdAt,
        },
        rule: matchingRule
          ? {
              id: matchingRule.id,
              isoStandard: matchingRule.isoStandard,
              isoClause: matchingRule.isoClause,
              griCode: matchingRule.griCode,
              griDisclosure: matchingRule.griDisclosure,
              coverageLevel: matchingRule.coverageLevel,
              mappingNotes: matchingRule.mappingNotes,
              version: matchingRule.version,
            }
          : null,
      };
    });

    // 5. Determine recommended action
    let recommendedAction = gapRow.recommendedAction;
    if (!recommendedAction) {
      if (gapRow.status === 'COVERED') {
        recommendedAction = 'No action required — disclosure is fully covered by ISO data.';
      } else if (gapRow.status === 'PARTIAL') {
        recommendedAction = `Upgrade ${griCode} coverage from partial to full — supplement existing ISO data with additional records.`;
      } else {
        recommendedAction = `Collect data for ${griCode} (${gapRow.griName}) — no ISO source currently covers this disclosure.`;
      }
    }

    res.json({
      disclosure: {
        griCode: gapRow.griCode,
        griName: gapRow.griName,
        griTopicFamily: gapRow.griTopicFamily,
        year: gapRow.year,
      },
      status: gapRow.status,
      coveringSources: gapRow.coveringSources,
      sources,
      allRulesForDisclosure: rules.map((r) => ({
        id: r.id,
        isoStandard: r.isoStandard,
        isoClause: r.isoClause,
        coverageLevel: r.coverageLevel,
        mappingNotes: r.mappingNotes,
      })),
      recommendedAction,
      computedAt: gapRow.computedAt || gapRow.updatedAt,
    });
  } catch (err) {
    console.error('[isoGri] GET /gaps/:griCode error:', err);
    res.status(500).json({ error: 'Failed to fetch disclosure drilldown' });
  }
});

// ─── Sprint 3: Admin Rule CRUD ─────────────────────────────────

// ─── POST /rules — create a new mapping rule (admin only) ──────

router.post('/rules', requireAdmin, async (req, res) => {
  try {
    const { isoStandard, isoClause, isoDataCaptured, griCode, coverageLevel, notes, tripleIModule } = req.body;

    if (!isoStandard || !isoClause || !isoDataCaptured || !griCode || !coverageLevel) {
      return res.status(400).json({
        error: 'Missing required fields: isoStandard, isoClause, isoDataCaptured, griCode, coverageLevel',
      });
    }

    const validCoverage = ['FULL', 'PARTIAL', 'SUPPORTING'];
    if (!validCoverage.includes(coverageLevel)) {
      return res.status(400).json({
        error: `coverageLevel must be one of: ${validCoverage.join(', ')}`,
      });
    }

    const rule = await prisma.isoGriMappingRule.create({
      data: {
        isoStandard: isoStandard.replace(/\s+/g, '_').toUpperCase(),
        isoClause,
        isoDataCaptured,
        griCode,
        coverageLevel,
        notes: notes || null,
        tripleIModule: tripleIModule || null,
      },
    });

    logActivity(
      req.user.id, req.user.companyId, 'ISO_GRI_RULE_CREATE',
      `Created mapping rule: ${rule.isoStandard} ${rule.isoClause} → ${rule.griCode}`,
      { ruleId: rule.id },
      req.ip
    );

    res.status(201).json({ rule });
  } catch (err) {
    console.error('[isoGri] POST /rules error:', err);
    res.status(500).json({ error: 'Failed to create mapping rule' });
  }
});

// ─── PUT /rules/:id — update an existing rule (admin only) ─────

router.put('/rules/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { isoStandard, isoClause, isoDataCaptured, griCode, coverageLevel, notes, tripleIModule } = req.body;

    const existing = await prisma.isoGriMappingRule.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Mapping rule not found' });
    }

    if (coverageLevel) {
      const validCoverage = ['FULL', 'PARTIAL', 'SUPPORTING'];
      if (!validCoverage.includes(coverageLevel)) {
        return res.status(400).json({
          error: `coverageLevel must be one of: ${validCoverage.join(', ')}`,
        });
      }
    }

    const data = {};
    if (isoStandard !== undefined) data.isoStandard = isoStandard.replace(/\s+/g, '_').toUpperCase();
    if (isoClause !== undefined) data.isoClause = isoClause;
    if (isoDataCaptured !== undefined) data.isoDataCaptured = isoDataCaptured;
    if (griCode !== undefined) data.griCode = griCode;
    if (coverageLevel !== undefined) data.coverageLevel = coverageLevel;
    if (notes !== undefined) data.notes = notes || null;
    if (tripleIModule !== undefined) data.tripleIModule = tripleIModule || null;

    const rule = await prisma.isoGriMappingRule.update({ where: { id }, data });

    logActivity(
      req.user.id, req.user.companyId, 'ISO_GRI_RULE_UPDATE',
      `Updated mapping rule: ${rule.isoStandard} ${rule.isoClause} → ${rule.griCode}`,
      { ruleId: rule.id },
      req.ip
    );

    res.json({ rule });
  } catch (err) {
    console.error('[isoGri] PUT /rules/:id error:', err);
    res.status(500).json({ error: 'Failed to update mapping rule' });
  }
});

// ─── DELETE /rules/:id — delete a rule (admin only) ────────────

router.delete('/rules/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.isoGriMappingRule.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Mapping rule not found' });
    }

    await prisma.isoGriMappingRule.delete({ where: { id } });

    logActivity(
      req.user.id, req.user.companyId, 'ISO_GRI_RULE_DELETE',
      `Deleted mapping rule: ${existing.isoStandard} ${existing.isoClause} → ${existing.griCode}`,
      { ruleId: id },
      req.ip
    );

    res.json({ message: 'Rule deleted', id });
  } catch (err) {
    console.error('[isoGri] DELETE /rules/:id error:', err);
    res.status(500).json({ error: 'Failed to delete mapping rule' });
  }
});

// ─── POST /rules/publish — bump version on all rules (admin) ───

router.post('/rules/publish', requireAdmin, async (req, res) => {
  try {
    // Find the latest version across all rules
    const latestRule = await prisma.isoGriMappingRule.findFirst({
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    const currentVersion = latestRule ? latestRule.version : '1.0';
    const parts = currentVersion.split('.');
    const major = parseInt(parts[0]) || 1;
    const minor = parseInt(parts[1]) || 0;
    const newVersion = `${major}.${minor + 1}`;

    // Fetch all current rules at the latest version
    const currentRules = await prisma.isoGriMappingRule.findMany({
      where: { version: currentVersion },
    });

    if (currentRules.length === 0) {
      return res.status(400).json({ error: 'No rules found at the current version to publish' });
    }

    // Copy all current rules with the new version
    let created = 0;
    for (const rule of currentRules) {
      await prisma.isoGriMappingRule.create({
        data: {
          isoStandard: rule.isoStandard,
          isoClause: rule.isoClause,
          isoDataCaptured: rule.isoDataCaptured,
          griCode: rule.griCode,
          coverageLevel: rule.coverageLevel,
          notes: rule.notes,
          tripleIModule: rule.tripleIModule,
          version: newVersion,
        },
      });
      created++;
    }

    logActivity(
      req.user.id, req.user.companyId, 'ISO_GRI_RULES_PUBLISH',
      `Published mapping rules v${newVersion} (${created} rules copied from v${currentVersion})`,
      { previousVersion: currentVersion, newVersion, ruleCount: created },
      req.ip
    );

    res.json({
      message: `Published v${newVersion}`,
      previousVersion: currentVersion,
      newVersion,
      rulesCopied: created,
    });
  } catch (err) {
    console.error('[isoGri] POST /rules/publish error:', err);
    res.status(500).json({ error: 'Failed to publish rules' });
  }
});

module.exports = router;
