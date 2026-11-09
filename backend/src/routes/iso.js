/**
 * ISO-to-GRI / ESRS Bridge — API surface (spec §8).
 *
 * Entitlement gating (spec §11): Bridge capabilities are gated at the API
 * layer with a hard 403 — not just hidden in the UI. Credit top-ups never
 * unlock a gated capability: entitlement and credits are independent
 * checks. The single exception is POST /coverage, which serves a limited
 * "teaser" payload to non-entitled users as a sales surface.
 *
 * Guardrails (spec §4.1): output is DRAFT and human-reviewed; nothing here
 * certifies anything or auto-publishes into a report.
 */
const router = require('express').Router();
const multer = require('multer');
const XLSX = require('xlsx');
const prisma = require('../config/prisma');
const { authenticate } = require('../middleware/auth');
const { requireFeature, attachTier } = require('../middleware/tier');
const { hasFeature } = require('../services/tierFeatures');
const { deductCredits } = require('../middleware/credits');
const { extractText } = require('../services/docExtract');
const { saveFile } = require('../utils/fileStore');
const { logActivity } = require('../utils/activityLog');
const { formatError } = require('../utils/errors');
const estimator = require('../utils/estimator');
const { STANDARDS } = require('../services/standardRegistry');
const registry = require('../services/isoBridgeRegistry');
const engine = require('../services/isoBridgeEngine');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.use(authenticate);

const FEATURE = 'iso_bridge';

async function requireCredits(companyId, credits, res) {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { creditBalance: true } });
  if (company.creditBalance < credits) {
    res.status(402).json({ error: `Insufficient credits. This action needs ${credits}, you have ${company.creditBalance}.` });
    return false;
  }
  return true;
}

function visionInput(file) {
  // Text-layer gate first (cheap); fall back to vision for scans/images.
  return extractText(file).then((result) => {
    if (result.text && result.text.length >= 50) {
      return { input: result.text, useVision: false, mime: null };
    }
    const ext = (file.originalname.split('.').pop() || '').toLowerCase();
    const mime = file.mimetype === 'application/pdf' || ext === 'pdf'
      ? 'application/pdf'
      : file.mimetype || (ext === 'png' ? 'image/png' : 'image/jpeg');
    return { input: result.buffer || file.buffer, useVision: true, mime };
  });
}

// ─── Registry (crosswalk transparency) ──────────────────────────────────

router.get('/registry', requireFeature(FEATURE), (req, res) => {
  res.json({
    meta: registry.REGISTRY_META,
    recordTypes: registry.RECORD_TYPES,
    crosswalk: registry.CROSSWALK.map(({ draftingGuidance, extractionHint, ...row }) => row),
  });
});

// ─── C1: Certificate registry ───────────────────────────────────────────

router.post('/certificates', requireFeature(FEATURE), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No certificate file provided' });

    const estimate = estimator.estimateCertExtract({ fileCount: 1 });
    if (!(await requireCredits(req.user.companyId, estimate.credits, res))) return;

    const stored = saveFile(req.file, req.user.companyId);
    const { input, useVision, mime } = await visionInput(req.file);

    const costCtx = { companyId: req.user.companyId, userId: req.user.id, metadata: { fileName: req.file.originalname } };
    const extracted = await engine.extractCertificate(input, { mime, useVision }, costCtx);

    const edition = registry.normaliseEdition(extracted.isoEdition) === 'unknown' && extracted.isoEdition && extracted.isoEdition !== 'unknown'
      ? String(extracted.isoEdition) // non-14001 editions (e.g. 2018) stored verbatim
      : (extracted.isoEdition || 'unknown');

    const cert = await prisma.isoCertificate.create({
      data: {
        companyId: req.user.companyId,
        isoStandard: String(extracted.isoStandard || 'unknown').replace(/^ISO\s*/i, ''),
        isoEdition: edition || 'unknown',
        certNumber: extracted.certNumber || null,
        certBody: extracted.certBody || null,
        accreditationBody: extracted.accreditationBody || null,
        accredited: typeof extracted.accredited === 'boolean' ? extracted.accredited : null,
        scopeStatement: extracted.scopeStatement || null,
        sites: Array.isArray(extracted.sites) ? extracted.sites.filter(Boolean).map(String) : [],
        issueDate: extracted.issueDate ? new Date(extracted.issueDate) : null,
        expiryDate: extracted.expiryDate ? new Date(extracted.expiryDate) : null,
        nextSurveillanceDate: extracted.nextSurveillanceDate ? new Date(extracted.nextSurveillanceDate) : null,
        sourceFile: stored.storedFilePath,
        sourceFileName: req.file.originalname,
        extractionConfidence: typeof extracted.confidence === 'number' ? extracted.confidence : null,
      },
    });

    await deductCredits(req.user.companyId, req.user.id, estimate.credits, 'ISO_CERT_EXTRACT',
      `ISO Bridge: certificate extraction (${req.file.originalname}) — ${estimate.credits} credits`, cert.id);
    logActivity(req.user.id, req.user.companyId, 'ISO_CERT_UPLOAD',
      `Uploaded ISO ${cert.isoStandard}:${cert.isoEdition} certificate ${cert.certNumber || ''}`.trim(),
      { certificateId: cert.id, standard: cert.isoStandard, edition: cert.isoEdition }, req.ip);

    res.status(201).json({
      certificate: cert,
      warnings: [
        cert.isoEdition === 'unknown' ? 'Edition could not be read from the certificate — please confirm it. The edition selects the crosswalk version.' : null,
        cert.accredited === false ? 'No accreditation mark detected — unaccredited certificates are typically rejected by OEM procurement.' : null,
      ].filter(Boolean),
    });
  } catch (err) {
    console.error('ISO certificate upload error:', err);
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.get('/certificates', requireFeature(FEATURE), async (req, res) => {
  try {
    const certificates = await prisma.isoCertificate.findMany({
      where: { companyId: req.user.companyId },
      orderBy: { createdAt: 'desc' },
    });

    // Renewal / surveillance calendar: upcoming dates, soonest first
    const now = new Date();
    const calendar = certificates
      .flatMap((c) => [
        c.nextSurveillanceDate ? { certificateId: c.id, isoStandard: c.isoStandard, type: 'surveillance', date: c.nextSurveillanceDate } : null,
        c.expiryDate ? { certificateId: c.id, isoStandard: c.isoStandard, type: 'expiry', date: c.expiryDate } : null,
      ])
      .filter(Boolean)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map((e) => ({ ...e, overdue: new Date(e.date) < now }));

    res.json({ certificates, calendar });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// Manual edition correction — "unknown" editions must be resolvable by the user.
router.patch('/certificates/:id', requireFeature(FEATURE), async (req, res) => {
  try {
    const existing = await prisma.isoCertificate.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!existing) return res.status(404).json({ error: 'Certificate not found' });
    const allowed = {};
    if (req.body.isoEdition != null) allowed.isoEdition = String(req.body.isoEdition);
    if (req.body.isoStandard != null) allowed.isoStandard = String(req.body.isoStandard).replace(/^ISO\s*/i, '');
    const cert = await prisma.isoCertificate.update({ where: { id: existing.id }, data: allowed });
    logActivity(req.user.id, req.user.companyId, 'ISO_CERT_UPDATE', `Corrected certificate ${cert.id} (${JSON.stringify(allowed)})`, allowed, req.ip);
    res.json({ certificate: cert });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── C3: Evidence ingestion ─────────────────────────────────────────────

router.post('/evidence', requireFeature(FEATURE), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No document provided' });
    const { recordType, certificateId } = req.body;
    if (!recordType || !registry.RECORD_TYPES.includes(recordType)) {
      return res.status(400).json({ error: `recordType is required. One of: ${registry.RECORD_TYPES.join(', ')}` });
    }

    if (certificateId) {
      const cert = await prisma.isoCertificate.findFirst({ where: { id: certificateId, companyId: req.user.companyId } });
      if (!cert) return res.status(404).json({ error: 'Certificate not found' });
    }

    const ext = (req.file.originalname.split('.').pop() || '').toLowerCase();
    const isSpreadsheet = ['xlsx', 'xls', 'csv'].includes(ext);

    const estimate = isSpreadsheet
      ? estimator.estimateExcelETL({ fileSizeBytes: req.file.size })
      : estimator.estimateDocExtract({ fileCount: 1, assumeVision: true });
    if (!(await requireCredits(req.user.companyId, estimate.credits, res))) return;

    const stored = saveFile(req.file, req.user.companyId);
    const costCtx = { companyId: req.user.companyId, userId: req.user.id, metadata: { fileName: req.file.originalname, recordType } };

    let extracted;
    let sourceLocation = null;
    if (isSpreadsheet) {
      // Spreadsheet path: parse rows, then AI-normalise into the record structure
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheets = workbook.SheetNames.map((name) => ({
        name,
        rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: null }).slice(0, 500),
      })).filter((s) => s.rows.length > 0);
      if (sheets.length === 0) return res.status(400).json({ error: 'No data found in the spreadsheet' });
      sourceLocation = `sheets: ${sheets.map((s) => s.name).join(', ')}`;
      extracted = await engine.extractEvidence(JSON.stringify(sheets), { recordType, useVision: false }, costCtx);
    } else {
      const { input, useVision, mime } = await visionInput(req.file);
      extracted = await engine.extractEvidence(input, { recordType, mime, useVision }, costCtx);
    }

    if (!extracted) return res.status(422).json({ error: 'Could not extract structured content from this document.' });

    const record = await prisma.isoEvidenceRecord.create({
      data: {
        companyId: req.user.companyId,
        certificateId: certificateId || null,
        recordType,
        payload: extracted.payload,
        sourceFile: stored.storedFilePath,
        sourceFileName: req.file.originalname,
        sourceLocation: extracted.sourceLocation || sourceLocation,
        language: extracted.language || null,
      },
    });

    await deductCredits(req.user.companyId, req.user.id, estimate.credits, 'ISO_EVIDENCE_INGEST',
      `ISO Bridge: evidence ingestion (${recordType}, ${req.file.originalname}) — ${estimate.credits} credits`, record.id);
    logActivity(req.user.id, req.user.companyId, 'ISO_EVIDENCE_UPLOAD',
      `Ingested ${recordType} evidence from ${req.file.originalname}`, { recordId: record.id, recordType }, req.ip);

    res.status(201).json({ record, confidence: extracted.confidence ?? null });
  } catch (err) {
    console.error('ISO evidence upload error:', err);
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.get('/evidence', requireFeature(FEATURE), async (req, res) => {
  try {
    const records = await prisma.isoEvidenceRecord.findMany({
      where: { companyId: req.user.companyId },
      orderBy: { ingestedAt: 'desc' },
      select: { id: true, certificateId: true, recordType: true, sourceFileName: true, sourceLocation: true, language: true, ingestedAt: true },
    });
    res.json({ records });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── C5 + C6: Coverage & gap-to-action ──────────────────────────────────
// Free (pure registry math). Non-entitled users get a limited teaser —
// counts and framing only, no per-disclosure detail (spec §11).

router.post('/coverage', attachTier, async (req, res) => {
  try {
    const { standard, topics } = req.body;
    if (!standard || !STANDARDS[standard]) {
      return res.status(400).json({ error: `standard is required. One of: ${Object.keys(STANDARDS).join(', ')}` });
    }

    const certificates = await prisma.isoCertificate.findMany({
      where: { companyId: req.user.companyId },
      select: { id: true, isoStandard: true, isoEdition: true },
    });

    const coverage = registry.computeCoverage(certificates, standard, topics, STANDARDS);
    const entitled = hasFeature(req.tier, FEATURE);

    if (!entitled) {
      // Teaser: enough to sell, not enough to use
      return res.json({
        teaser: true,
        entitled: false,
        standard: coverage.standard,
        required: coverage.required,
        populated: coverage.populated,
        partial: coverage.partial,
        notAvailable: coverage.notAvailable,
        coveragePct: coverage.coveragePct,
        framing: coverage.framing,
        certificateCount: certificates.length,
      });
    }

    res.json({ teaser: false, entitled: true, certificateCount: certificates.length, ...coverage });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── C4: Drafting + review workflow ─────────────────────────────────────

router.post('/draft', requireFeature(FEATURE), async (req, res) => {
  try {
    const { disclosureCode, year, standard = 'GRI', language = 'en' } = req.body;
    if (!disclosureCode || !year) return res.status(400).json({ error: 'disclosureCode and year are required' });

    const certificates = await prisma.isoCertificate.findMany({
      where: { companyId: req.user.companyId },
      select: { id: true, isoStandard: true, isoEdition: true },
    });
    if (certificates.length === 0) return res.status(400).json({ error: 'Upload at least one ISO certificate first.' });

    // Crosswalk rows (from held certificates) that cover this disclosure
    const rows = registry.mappingsForCertificates(certificates)
      .filter((row) => row.mapsTo.some((t) => registry.targetCovers(t, disclosureCode)));
    if (rows.length === 0) {
      return res.status(422).json({ error: `No ISO crosswalk mapping covers ${disclosureCode} for your held certificates. See the gap list for the recommended action.` });
    }

    // Evidence matching the mapped record types
    const recordTypes = [...new Set(rows.map((r) => r.recordType))];
    const evidence = await prisma.isoEvidenceRecord.findMany({
      where: { companyId: req.user.companyId, recordType: { in: recordTypes } },
      orderBy: { ingestedAt: 'desc' },
      take: 12,
    });
    if (evidence.length === 0) {
      return res.status(422).json({
        error: `No ingested evidence for ${disclosureCode}. Upload one of: ${recordTypes.join(', ')}.`,
        neededRecordTypes: recordTypes,
      });
    }

    const estimate = estimator.estimateDisclosureDraft({ disclosureCount: 1 });
    if (!(await requireCredits(req.user.companyId, estimate.credits, res))) return;

    const company = await prisma.company.findUnique({ where: { id: req.user.companyId }, select: { name: true } });
    const costCtx = { companyId: req.user.companyId, userId: req.user.id, metadata: { disclosureCode, year } };

    const result = await engine.draftDisclosure({
      disclosureCode,
      standard,
      year: parseInt(year),
      mappings: rows,
      evidence,
      certificates,
      language,
      companyName: company?.name,
    }, costCtx);

    // Deduct on generation, not on review (spec §10) — even a rejected draft consumed tokens
    await deductCredits(req.user.companyId, req.user.id, estimate.credits, 'ISO_DISCLOSURE_DRAFT',
      `ISO Bridge: drafted ${disclosureCode} (${year}) — ${estimate.credits} credits`, null);

    if (!result.draftText) {
      return res.status(422).json({ error: result.notes || 'Evidence was insufficient to produce a sourced draft.' });
    }

    const draft = await prisma.disclosureDraft.create({
      data: {
        companyId: req.user.companyId,
        disclosureCode,
        standard,
        year: parseInt(year),
        draftText: result.draftText,
        citations: result.citations,
        confidence: result.confidence,
        modelVersion: result.modelVersion,
        promptVersion: result.promptVersion,
        status: 'DRAFT', // human-in-the-loop is mandatory — never auto-approved
        language,
      },
    });

    logActivity(req.user.id, req.user.companyId, 'ISO_DRAFT_GENERATED',
      `Drafted ${disclosureCode} (${standard} ${year}) from ISO evidence`, { draftId: draft.id, confidence: result.confidence }, req.ip);

    res.status(201).json({ draft, notes: result.notes });
  } catch (err) {
    console.error('ISO draft error:', err);
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.get('/drafts', requireFeature(FEATURE), async (req, res) => {
  try {
    const { year, standard, status } = req.query;
    const where = { companyId: req.user.companyId };
    if (year) where.year = parseInt(year);
    if (standard) where.standard = standard;
    if (status) where.status = status;
    const drafts = await prisma.disclosureDraft.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json({ drafts });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.post('/draft/:id/review', requireFeature(FEATURE), async (req, res) => {
  try {
    const { decision, editedText } = req.body;
    if (!['approve', 'reject'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be "approve" or "reject"' });
    }

    const draft = await prisma.disclosureDraft.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!draft) return res.status(404).json({ error: 'Draft not found' });

    const updated = await prisma.disclosureDraft.update({
      where: { id: draft.id },
      data: {
        status: decision === 'approve' ? 'APPROVED' : 'REJECTED',
        editedText: editedText && editedText.trim().length > 0 ? editedText.trim() : null,
        reviewerId: req.user.id,
        reviewedAt: new Date(),
      },
    });

    // Audit trail: reviewer identity + decision (spec §12)
    logActivity(req.user.id, req.user.companyId, 'ISO_DRAFT_REVIEW',
      `${decision === 'approve' ? 'Approved' : 'Rejected'} draft for ${draft.disclosureCode} (${draft.standard} ${draft.year})${editedText ? ' with edits' : ''}`,
      { draftId: draft.id, decision, edited: Boolean(editedText) }, req.ip);

    res.json({ draft: updated });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── C7: Reverse bridge — 14001:2026 transition export ──────────────────

router.post('/reverse-export', requireFeature(FEATURE), async (req, res) => {
  try {
    const { theme, year } = req.body;
    const themeMeta = registry.REVERSE_THEMES[theme];
    if (!themeMeta) return res.status(400).json({ error: `theme must be one of: ${Object.keys(registry.REVERSE_THEMES).join(', ')}` });
    const y = parseInt(year) || new Date().getFullYear();

    // Assemble platform data for the theme
    const companyId = req.user.companyId;
    let dataSummary = {};
    if (theme === 'climate') {
      const [activities, sites] = await Promise.all([
        prisma.fE1EmissionActivityData.findMany({ where: { companyId, year: y } }),
        prisma.site.findMany({ where: { companyId }, select: { name: true, country: true } }).catch(() => []),
      ]);
      const byScope = {};
      activities.forEach((r) => { byScope[r.scope || 'Scope 3'] = (byScope[r.scope || 'Scope 3'] || 0) + (r.totalEmissions || 0); });
      const energy = activities.filter((r) => (r.unit || '').toLowerCase().includes('wh'))
        .map((r) => ({ subcategory: r.activitySubcat, quantity: r.quantity, unit: r.unit }));
      dataSummary = { year: y, emissionsByScope: byScope, totalRecords: activities.length, energyRecords: energy.slice(0, 30), sites };
    } else if (theme === 'biodiversity') {
      const assessments = await prisma.biodiversityAssessment.findMany({ where: { companyId } }).catch(() => []);
      dataSummary = { year: y, assessments: assessments.slice(0, 20) };
    } else if (theme === 'resource' || theme === 'lifecycle') {
      const products = await prisma.product.findMany({
        where: { companyId },
        include: { calculations: { orderBy: { runAt: 'desc' }, take: 1 } },
      }).catch(() => []);
      dataSummary = {
        year: y,
        products: products.slice(0, 20).map((p) => ({
          sku: p.sku, name: p.name,
          latestPcf: p.calculations?.[0] ? { totalKgCo2e: p.calculations[0].totalKgCo2e ?? p.calculations[0].p50 ?? null } : null,
        })),
      };
    }

    const hasData = JSON.stringify(dataSummary).length > 60;
    if (!hasData) {
      return res.status(422).json({ error: `No platform data available for the "${themeMeta.label}" theme. Required: ${themeMeta.requiredData}.` });
    }

    const estimate = estimator.estimateReverseExport({ themeCount: 1 });
    if (!(await requireCredits(companyId, estimate.credits, res))) return;

    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
    const costCtx = { companyId, userId: req.user.id, metadata: { theme, year: y } };
    const result = await engine.generateReversePack({ theme, themeMeta, year: y, dataSummary, companyName: company?.name }, costCtx);
    if (!result) return res.status(422).json({ error: 'Could not generate the evidence pack from the available data.' });

    await deductCredits(companyId, req.user.id, estimate.credits, 'ISO_REVERSE_EXPORT',
      `ISO Bridge: 14001:2026 ${theme} evidence pack (${y}) — ${estimate.credits} credits`, null);

    const pack = await prisma.reverseExportPack.create({
      data: {
        companyId,
        theme,
        year: y,
        targetClauses: themeMeta.targetClauses,
        contentBlocks: { blocks: result.contentBlocks, notes: result.notes, disclaimer: result.disclaimer },
        disclaimerVersion: '1.0',
      },
    });

    logActivity(req.user.id, companyId, 'ISO_REVERSE_EXPORT',
      `Generated 14001:2026 ${themeMeta.label} evidence pack for ${y}`, { packId: pack.id, theme }, req.ip);

    res.status(201).json({ pack, disclaimer: result.disclaimer });
  } catch (err) {
    console.error('ISO reverse export error:', err);
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.get('/reverse-export', requireFeature(FEATURE), async (req, res) => {
  try {
    const packs = await prisma.reverseExportPack.findMany({
      where: { companyId: req.user.companyId },
      orderBy: { generatedAt: 'desc' },
    });
    res.json({ packs, themes: registry.REVERSE_THEMES, disclaimer: registry.NON_CERTIFICATION_DISCLAIMER });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

module.exports = router;
