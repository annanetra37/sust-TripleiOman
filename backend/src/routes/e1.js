const router = require('express').Router();
const multer = require('multer');
const XLSX = require('xlsx');
const prisma = require('../config/prisma');
const { authenticate } = require('../middleware/auth');
const { deductCredits } = require('../middleware/credits');
const { requireFeature } = require('../middleware/tier');
const { mapSchema, cleanAndTransform, validateAndCoerce, extractDocumentWithAI } = require('../services/aiEtl');
const { extractText } = require('../services/docExtract');
const { saveFile, saveFiles } = require('../utils/fileStore');
const { logActivity } = require('../utils/activityLog');
const estimator = require('../utils/estimator');
const { logCost } = require('../utils/costTracker');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const docUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 20 },
  fileFilter: (_, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'application/zip'];
    cb(null, allowed.includes(file.mimetype));
  },
});

router.use(authenticate);

// ─── Dashboard ──────────────────────────────────────────────

router.get('/dashboard', async (req, res) => {
  const { companyId } = req.user;
  const { orgUnits, year } = req.query;
  const y = year && year !== 'null' ? parseInt(year) : null;

  const orgList = orgUnits ? orgUnits.split(',').filter(Boolean) : [];
  const orgFilter = orgList.length > 0 ? { orgUnitId: { in: orgList } } : {};
  const where = { companyId, ...orgFilter };
  if (y) where.year = y;

  console.log('[E1 Dashboard] Query:', JSON.stringify({ companyId, year: y, orgList: orgList.length || 'ALL' }));

  const [activities, inventory, targets, allActivities] = await Promise.all([
    prisma.fE1EmissionActivityData.findMany({ where }),
    prisma.fE1GHGInventory.findMany({ where }),
    prisma.sBTiTarget.findMany({ where: { companyId } }),
    prisma.fE1EmissionActivityData.findMany({ where: { companyId, ...orgFilter }, orderBy: { year: 'asc' } }),
  ]);

  console.log('[E1 Dashboard] Results:', { activitiesForYear: activities.length, allActivities: allActivities.length, years: [...new Set(allActivities.map(a => a.year))] });
  if (activities.length > 0) {
    console.log('[E1 Dashboard] Sample activity:', JSON.stringify({ year: activities[0].year, scope: activities[0].scope, totalEmissions: activities[0].totalEmissions, category: activities[0].activityCategory }));
  }

  // Compute stats from activity data (source of truth)
  const totalEmissions = activities.reduce((s, r) => s + (r.totalEmissions || 0), 0);

  // Get employee count from S1 workforce data for the same year (for intensity calculation)
  const s1Where = { companyId, ...orgFilter };
  if (y) s1Where.year = y;
  const s1Composition = await prisma.fS1WorkforceComposition.findMany({ where: s1Where });
  const totalEmployees = s1Composition.reduce((s, r) => s + (r.employeeCount || 0), 0);
  const intensity = totalEmployees > 0 ? (totalEmissions / totalEmployees).toFixed(4) : 0;

  // By scope — from activity data
  const byScope = {};
  activities.forEach((r) => {
    const scope = r.scope || 'Scope 3';
    byScope[scope] = (byScope[scope] || 0) + (r.totalEmissions || 0);
  });

  // By activity category
  const byActivity = {};
  activities.forEach((r) => {
    const cat = r.activityCategory || 'Other';
    byActivity[cat] = (byActivity[cat] || 0) + (r.totalEmissions || 0);
  });

  // By org unit — from activity data
  const byOrgUnit = {};
  activities.forEach((r) => {
    if (!byOrgUnit[r.orgUnitId]) byOrgUnit[r.orgUnitId] = {};
    const scope = r.scope || 'Scope 3';
    byOrgUnit[r.orgUnitId][scope] = (byOrgUnit[r.orgUnitId][scope] || 0) + (r.totalEmissions || 0);
  });

  // Emissions trend — from all activity data across all years
  const emissionsTrend = {};
  allActivities.forEach((r) => {
    if (!emissionsTrend[r.year]) emissionsTrend[r.year] = 0;
    emissionsTrend[r.year] += r.totalEmissions || 0;
  });

  // Total energy consumption — convert ALL sources to kWh then to MWh
  // Conversion factors to kWh:
  const ENERGY_CONVERSIONS = {
    'kwh': 1, 'kw.h': 1, 'kilowatt': 1,
    'mwh': 1000, 'megawatt': 1000,
    'gj': 277.78, 'gigajoule': 277.78,
    'litre': 10.0, 'liter': 10.0, 'litres': 10.0, 'liters': 10.0, 'ltr': 10.0, 'l': 10.0,
    'gallon': 37.85, 'gallons': 37.85,
    'm3': 10.55, 'm³': 10.55, 'cubic': 10.55,
    'therm': 29.3, 'therms': 29.3,
    'km': 0.6, 'kilometer': 0.6, // ~0.6 kWh per km for vehicles
    'passenger-km': 0.4,
    'night': 15.0, 'nights': 15.0, 'room-night': 15.0, // ~15 kWh per hotel night
  };

  let totalEnergyKwh = 0;
  const energyBySource = {}; // grouped by meaningful source name

  activities.forEach((r) => {
    if (!r.quantity || r.quantity <= 0) return;
    const unit = (r.unit || '').toLowerCase().trim();
    const cat = (r.activityCategory || '');
    const sub = (r.activitySubcat || '');

    // Find conversion factor
    let factor = 0;
    for (const [key, val] of Object.entries(ENERGY_CONVERSIONS)) {
      if (unit.includes(key)) { factor = val; break; }
    }
    if (factor === 0) return; // can't convert this unit

    // Refine factor for specific fuel types
    if (unit.includes('litre') || unit.includes('liter') || unit.includes('ltr')) {
      if (sub.toLowerCase().includes('diesel')) factor = 10.0;      // diesel: 10 kWh/litre
      else if (sub.toLowerCase().includes('petrol') || sub.toLowerCase().includes('gasoline')) factor = 9.1;
      else if (sub.toLowerCase().includes('lpg')) factor = 7.1;
      else if (sub.toLowerCase().includes('heating oil')) factor = 10.35;
      else factor = 10.0; // default fuel
    }

    const kwh = r.quantity * factor;
    totalEnergyKwh += kwh;

    // Group by meaningful source name
    let sourceName;
    if (cat.toLowerCase().includes('electric') || sub.toLowerCase().includes('electric') || sub.toLowerCase().includes('grid')) {
      sourceName = 'Electricity';
    } else if (sub.toLowerCase().includes('heating') || sub.toLowerCase().includes('fernwärme') || sub.toLowerCase().includes('district')) {
      sourceName = 'District Heating';
    } else if (sub.toLowerCase().includes('gas') || sub.toLowerCase().includes('natural')) {
      sourceName = 'Natural Gas';
    } else if (sub.toLowerCase().includes('diesel')) {
      sourceName = 'Diesel';
    } else if (sub.toLowerCase().includes('petrol') || sub.toLowerCase().includes('gasoline')) {
      sourceName = 'Petrol/Gasoline';
    } else if (cat.toLowerCase().includes('mobile') || sub.toLowerCase().includes('vehicle') || sub.toLowerCase().includes('service')) {
      sourceName = 'Vehicle Fuel';
    } else if (cat.toLowerCase().includes('travel') || sub.toLowerCase().includes('flight') || sub.toLowerCase().includes('train')) {
      sourceName = 'Business Travel';
    } else if (sub.toLowerCase().includes('hotel') || sub.toLowerCase().includes('stay')) {
      sourceName = 'Accommodation';
    } else {
      sourceName = sub || cat || 'Other';
    }

    energyBySource[sourceName] = (energyBySource[sourceName] || 0) + kwh;
  });

  const totalEnergyMwh = totalEnergyKwh / 1000;

  let sbtiProgress = null;
  if (targets.length > 0) {
    const target = targets[0];
    const baseYearEmissions = allActivities
      .filter((r) => r.year === target.baseYear)
      .reduce((s, r) => s + (r.totalEmissions || 0), 0);
    const currentEmissions = totalEmissions;
    const targetEmissions = target.reductionPct
      ? baseYearEmissions * (1 - target.reductionPct / 100)
      : target.absoluteTarget || 0;
    const progress = baseYearEmissions > 0
      ? (((baseYearEmissions - currentEmissions) / (baseYearEmissions - targetEmissions)) * 100).toFixed(1)
      : 0;

    sbtiProgress = {
      ...target, baseYearEmissions, currentEmissions, targetEmissions,
      progress: Math.min(100, Math.max(0, parseFloat(progress))),
      onTrack: parseFloat(progress) >= 50,
    };
  }

  const round4 = (n) => Math.round(n * 10000) / 10000;

  // Scope breakdown
  const scope1 = round4(byScope['Scope 1'] || 0);
  const scope2 = round4(byScope['Scope 2'] || 0);
  const scope3 = round4(byScope['Scope 3'] || 0);

  // Year-over-year change
  const prevYearActivities = allActivities.filter((a) => a.year === y - 1);
  const prevYearEmissions = prevYearActivities.reduce((s, r) => s + (r.totalEmissions || 0), 0);
  const yoyChange = prevYearEmissions > 0
    ? round4(((totalEmissions - prevYearEmissions) / prevYearEmissions) * 100)
    : null;

  // Top emission sources (top 5 subcategories)
  const bySubcat = {};
  activities.forEach((r) => {
    const key = r.activitySubcat || 'Other';
    bySubcat[key] = (bySubcat[key] || 0) + (r.totalEmissions || 0);
  });
  const topSources = Object.entries(bySubcat)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([source, value]) => ({ source, value: round4(value) }));

  // Monthly distribution for the selected year
  const byMonth = {};
  activities.forEach((r) => {
    if (r.month) {
      byMonth[r.month] = (byMonth[r.month] || 0) + (r.totalEmissions || 0);
    }
  });

  // Calculation method split
  const consumptionBased = activities.filter((r) => r.calcMethod === 'consumption').length;
  const expenditureBased = activities.filter((r) => r.calcMethod === 'expenditure').length;

  // Total spend
  const totalSpend = round4(activities.reduce((s, r) => s + (r.amount || 0), 0));

  // Emission factor coverage (% of records with non-zero EF)
  const withEF = activities.filter((r) => r.emissionFactor && r.emissionFactor > 0).length;
  const efCoverage = activities.length > 0 ? Math.round((withEF / activities.length) * 100) : 0;

  res.json({
    stats: {
      totalEmissions: round4(totalEmissions),
      scope1,
      scope2,
      scope3,
      intensity: round4(parseFloat(intensity)),
      totalEmployees,
      activityCount: activities.length,
      yoyChange,
      prevYearEmissions: round4(prevYearEmissions),
      totalSpend,
      efCoverage,
      consumptionBased,
      expenditureBased,
      sbtiProgress,
      totalEnergyKwh: round4(totalEnergyKwh),
      totalEnergyMwh: round4(totalEnergyMwh),
    },
    charts: {
      byScope: Object.entries(byScope).map(([scope, value]) => ({ scope, value: round4(value) })),
      byActivity: Object.entries(byActivity).map(([activity, value]) => ({ activity, value: round4(value) })),
      byOrgUnit,
      emissionsTrend: Object.entries(emissionsTrend).map(([year, value]) => ({ year: parseInt(year), value: round4(value) })),
      topSources,
      byMonth: Object.entries(byMonth).map(([month, value]) => ({ month: parseInt(month), value: round4(value) })).sort((a, b) => a.month - b.month),
      energyBySource: Object.entries(energyBySource).map(([source, kwh]) => ({ source, mwh: round4(kwh / 1000), kwh: round4(kwh) })).sort((a, b) => b.kwh - a.kwh),
    },
    raw: { activities, inventory },
  });
});

// ─── Upload Excel (AI-Powered ETL) ──────────────────────────

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });

    const { orgUnitId, reportingYear } = req.body;
    if (!orgUnitId) return res.status(400).json({ error: 'Org unit required' });
    const year = parseInt(reportingYear) || new Date().getFullYear();

    const orgUnit = await prisma.orgUnit.findFirst({ where: { id: orgUnitId, companyId: req.user.companyId } });
    if (!orgUnit) return res.status(404).json({ error: 'Org unit not found' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });

    // Store original file
    const stored = saveFile(req.file, req.user.companyId);

    const uploadRecord = await prisma.uploadHistory.create({
      data: {
        companyId: req.user.companyId, userId: req.user.id,
        fileName: req.file.originalname, fileType: 'E1',
        orgUnit: orgUnit.name, orgUnitId, status: 'PROCESSING',
        ...stored,
      },
    });

    processE1WithAI(workbook, req.user, orgUnitId, uploadRecord.id, year)
      .catch((err) => {
        console.error('E1 AI processing error:', err);
        prisma.uploadHistory.update({
          where: { id: uploadRecord.id },
          data: { status: 'FAILED', errorMessage: err.message },
        });
      });

    logActivity(req.user.id, req.user.companyId, 'UPLOAD_E1', `Uploaded ${req.file.originalname} for ${orgUnit.name} (${year})`, { fileName: req.file.originalname, year }, req.ip);
    res.status(202).json({ message: 'AI processing started', uploadId: uploadRecord.id });
  } catch (err) {
    console.error('E1 upload error:', err);
    const { status, error } = require('../utils/errors').formatError(err);
    res.status(status).json({ error });
  }
});

async function processE1WithAI(workbook, user, orgUnitId, uploadId, reportingYear) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { defval: null });
  const totalRows = data.length;

  if (totalRows === 0) {
    await prisma.uploadHistory.update({
      where: { id: uploadId },
      data: { status: 'FAILED', errorMessage: 'No data found in file' },
    });
    return;
  }

  // Estimator-based credit cost — scales with number of rows (batches × tokens
  // for Claude clean/transform + one schema-map call).
  const estimate = estimator.estimateExcelETL({ rowCount: totalRows, sheetCount: 1 });
  const creditCost = estimate.credits;
  const company = await prisma.company.findUnique({ where: { id: user.companyId } });
  if (company.creditBalance < creditCost) {
    await prisma.uploadHistory.update({
      where: { id: uploadId },
      data: { status: 'FAILED', errorMessage: `Insufficient credits. Need ${creditCost}, have ${company.creditBalance}` },
    });
    return;
  }

  await prisma.uploadHistory.update({ where: { id: uploadId }, data: { totalRows } });

  const columns = Object.keys(data[0] || {});

  // Step 1: AI Schema Mapping
  const costCtx = { companyId: user.companyId, userId: user.id, relatedId: uploadId };
  const mappingResult = await mapSchema(data, columns, 'E1', costCtx);

  let insertedRows = 0;
  let processedRows = 0;

  for (const mapping of mappingResult.mappings) {
    if (mapping.confidence < 0.3) continue;

    // Step 2: AI Data Cleaning
    const cleanedRows = await cleanAndTransform(data, mapping, 'E1', costCtx);

    // Step 3: Validation
    const { valid, invalid } = validateAndCoerce(cleanedRows, mapping.targetTable, 'E1');

    // Step 4: Ingest
    for (const row of valid) {
      try {
        // Look up emission factor from DB if not provided
        let emissionFactor = row.emissionFactor || 0;
        let totalEmissions = row.totalEmissions || 0;

        if (!emissionFactor && row.activitySubcat) {
          const subcat = await prisma.activitySubcategory.findFirst({
            where: { name: { contains: row.activitySubcat, mode: 'insensitive' } },
          });
          if (subcat?.emissionFactor) emissionFactor = subcat.emissionFactor;
        }

        if (!totalEmissions && emissionFactor && row.quantity) {
          totalEmissions = (row.quantity * emissionFactor) / 1000; // kg to tonnes
        }

        await prisma.fE1EmissionActivityData.create({
          data: {
            companyId: user.companyId, orgUnitId,
            year: reportingYear, month: row.month || null,
            activityCategory: row.activityCategory || 'Other',
            activitySubcat: row.activitySubcat || 'Other',
            calcMethod: row.calcMethod || 'consumption',
            quantity: row.quantity || 0,
            unit: row.unit || 'kWh',
            emissionFactor,
            totalEmissions,
            scope: row.scope || 'Scope 1',
            currency: row.currency || null,
            amount: row.amount || null,
          },
        });

        insertedRows++;
      } catch (err) {
        console.error('E1 row insert error:', err.message);
      }

      processedRows++;
      if (processedRows % 25 === 0) {
        await prisma.uploadHistory.update({ where: { id: uploadId }, data: { processedRows } });
      }
    }

    processedRows += invalid.length;
  }

  await aggregateGHGInventory(user.companyId, orgUnitId);
  // Re-estimate with the actual row count so deduction matches reality even
  // if the initial estimate used a different count.
  const finalEstimate = estimator.estimateExcelETL({ rowCount: totalRows, sheetCount: 1 });
  await deductCredits(
    user.companyId,
    user.id,
    finalEstimate.credits,
    'EXCEL_E1',
    `E1 AI ETL: ${insertedRows} rows ingested from ${totalRows} raw rows — ${finalEstimate.credits} credits`,
    uploadId,
  );

  await prisma.uploadHistory.update({
    where: { id: uploadId },
    data: { status: 'COMPLETED', processedRows: totalRows, completedAt: new Date() },
  });
}

async function aggregateGHGInventory(companyId, orgUnitId) {
  const activities = await prisma.fE1EmissionActivityData.findMany({
    where: { companyId, orgUnitId },
  });

  const aggregated = {};
  activities.forEach((a) => {
    const key = `${a.year}-${a.scope}`;
    if (!aggregated[key]) aggregated[key] = { year: a.year, scope: a.scope, total: 0 };
    aggregated[key].total += a.totalEmissions || 0;
  });

  for (const item of Object.values(aggregated)) {
    await prisma.fE1GHGInventory.upsert({
      where: { companyId_orgUnitId_year_scope: { companyId, orgUnitId, year: item.year, scope: item.scope } },
      update: { totalEmissions: item.total },
      create: { companyId, orgUnitId, year: item.year, scope: item.scope, totalEmissions: item.total },
    });
  }
}

// ─── Document Extract (AI-Powered) ──────────────────────────

router.post('/doc-extract', requireFeature('ai_doc_extract'), docUpload.array('files', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files provided' });

    const { mode, orgUnitId, reportingYear: reqYear } = req.body;
    const docYear = parseInt(reqYear) || new Date().getFullYear();
    if (!mode) return res.status(400).json({ error: 'Extraction mode required (Travel, Stay, Energy, Company Vehicle)' });

    const validModes = ['Travel', 'Stay', 'Energy', 'Company Vehicle'];
    if (!validModes.includes(mode)) {
      return res.status(400).json({ error: `Invalid mode. Supported: ${validModes.join(', ')}` });
    }

    const docCount = req.files.length;
    // Estimator-based cost (USD × 400 = credits).  The actual deduction below
    // uses the same figure so the user is charged exactly what they confirmed.
    const estimate = estimator.estimateDocExtract({ fileCount: docCount, assumeVision: true });
    const creditCost = estimate.credits;

    const company = await prisma.company.findUnique({ where: { id: req.user.companyId } });
    if (company.creditBalance < creditCost) {
      return res.status(403).json({
        error: 'Insufficient credits',
        required: creditCost,
        available: company.creditBalance,
        documents: docCount,
      });
    }

    // Resolve org unit name for display
    const orgUnit = orgUnitId ? await prisma.orgUnit.findUnique({ where: { id: orgUnitId } }) : null;

    // Store original files
    const storedFiles = saveFiles(req.files, req.user.companyId);
    // Store first file path in upload record; individual file paths are in storedFiles
    const firstFile = storedFiles[0] || {};

    const uploadRecord = await prisma.uploadHistory.create({
      data: {
        companyId: req.user.companyId, userId: req.user.id,
        fileName: `AI Doc Extract — ${mode} (${docCount} files)`,
        fileType: 'E1', orgUnit: orgUnit ? orgUnit.name : orgUnitId, orgUnitId,
        status: 'PROCESSING', totalRows: docCount,
        storedFilePath: storedFiles.map((f) => `${f.originalName}::${f.storedFilePath}`).join('||'),
        storedFileSize: storedFiles.reduce((s, f) => s + (f.storedFileSize || 0), 0),
        storedFileMime: firstFile.storedFileMime,
      },
    });

    processDocumentsWithAI(req.files, req.user, orgUnitId, mode, uploadRecord.id, docYear, estimate)
      .catch((err) => {
        console.error('AI doc extract error:', err);
        prisma.uploadHistory.update({
          where: { id: uploadRecord.id },
          data: { status: 'FAILED', errorMessage: err.message },
        });
      });

    logActivity(req.user.id, req.user.companyId, 'DOC_EXTRACT', `Extracted ${docCount} document(s) — ${mode} for ${orgUnit ? orgUnit.name : orgUnitId} (${docYear})`, { mode, docCount, year: docYear, estimatedCredits: creditCost }, req.ip);
    res.status(202).json({
      message: 'AI document extraction started',
      uploadId: uploadRecord.id,
      documents: docCount,
      estimatedCredits: creditCost,
    });
  } catch (err) {
    console.error('Doc extract upload error:', err);
    const { status, error } = require('../utils/errors').formatError(err);
    res.status(status).json({ error });
  }
});

async function processDocumentsWithAI(files, user, orgUnitId, mode, uploadId, reportingYear, estimate) {
  const MAX_CONCURRENT = 3;
  let processed = 0;
  let succeeded = 0;
  const yearWarnings = [];
  const docErrors = [];
  // Per-file status array — saved to UploadHistory so the UI can show
  // exactly which file succeeded, which failed, and why.
  const perFileStatus = [];

  for (let i = 0; i < files.length; i += MAX_CONCURRENT) {
    const batch = files.slice(i, i + MAX_CONCURRENT);
    const batchResults = await Promise.allSettled(
      batch.map(async (file) => {
        console.log(`[Doc Extract] Starting extraction for: ${file.originalname}`);
        const costCtx = { companyId: user.companyId, userId: user.id, relatedId: uploadId, metadata: { file: file.originalname, mode } };

        // Step 1: Try text extraction
        const result = await extractText(file);

        // Step 2: If text found, use text-based AI extraction
        if (result.text && result.text.length >= 10) {
          console.log(`[Doc Extract] Using text mode: ${result.text.length} chars`);
          return { ...await extractDocumentWithAI(result.text, mode, costCtx, false), sourceFile: file.originalname };
        }

        // Step 3: No text — use Claude Vision API with raw file buffer
        console.log(`[Doc Extract] No text found — using Claude Vision API for: ${file.originalname}`);
        const buffer = result.buffer || file.buffer;
        // Infer mime from extension if not provided — never default to application/pdf for images
        const ext = (file.originalname || '').split('.').pop()?.toLowerCase();
        const extMime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', tiff: 'image/tiff', bmp: 'image/bmp', pdf: 'application/pdf' };
        const mime = result.mime || file.mimetype || extMime[ext] || 'image/jpeg';
        return { ...await extractDocumentWithAI(buffer, mode, costCtx, true, mime), sourceFile: file.originalname };
      })
    );

    for (const result of batchResults) {
      processed++;

      if (result.status === 'fulfilled' && result.value) {
        const extraction = result.value;
        console.log('[Doc Extract] Extraction result:', JSON.stringify({
          file: extraction.sourceFile,
          itemCount: extraction.items?.length || 0,
          confidence: extraction.confidence,
          notes: extraction.notes,
        }));

        if (!extraction.items || extraction.items.length === 0) {
          console.warn('[Doc Extract] No items extracted from:', extraction.sourceFile, '— Notes:', extraction.notes);
          perFileStatus.push({
            file: extraction.sourceFile || 'Unknown',
            status: 'failed',
            records: 0,
            confidence: extraction.confidence || 0,
            reason: extraction.notes || 'AI could not extract structured data from this document.',
          });
        }

        let fileRecords = 0;
        for (const item of (extraction.items || [])) {
          // Accept any item that has meaningful data
          const qty = parseFloat(item.quantity) || 0;
          const amt = parseFloat(item.amount) || 0;
          const ef = parseFloat(item.emissionFactor) || 0;
          // AI may return emissions as 'emissions', 'totalEmissions', or 'tCO2e'
          let ems = parseFloat(item.emissions || item.totalEmissions || item.tCO2e) || 0;
          // If AI didn't calculate emissions but provided quantity + factor, calculate it
          if (ems === 0 && qty > 0 && ef > 0) {
            ems = (qty * ef) / 1000; // kg to tonnes
          }

          console.log('[Doc Extract] Item:', JSON.stringify({ subType: item.subType, qty, ef, ems, amt, scope: item.scope, unit: item.unit }));

          if (qty > 0 || amt > 0 || ems > 0) {
            const itemDate = item.date ? new Date(item.date) : null;
            const itemMonth = itemDate ? itemDate.getMonth() + 1 : null;
            const docYear = itemDate ? itemDate.getFullYear() : null;

            // Track year mismatches for warnings
            if (docYear && docYear !== reportingYear) {
              yearWarnings.push({ file: extraction.sourceFile, docDate: item.date, docYear, reportingYear });
            }

            // Enforce standard ESG category names for specific modes
            let category = item.activityCategory || mode;
            let subcat = item.subType || mode;
            if (mode === 'Energy') {
              // Map energy types to standard categories
              const sub = (item.subType || '').toLowerCase();
              if (sub.includes('electric') || sub.includes('grid') || sub.includes('power')) {
                category = 'Purchased Electricity';
                subcat = item.subType || 'Grid Electricity';
              } else if (sub.includes('gas') || sub.includes('natural')) {
                category = 'Stationary Combustion';
                subcat = item.subType || 'Natural Gas';
              } else if (sub.includes('diesel') || sub.includes('heating') || sub.includes('oil') || sub.includes('fuel')) {
                category = 'Stationary Combustion';
                subcat = item.subType || 'Heating Oil';
              } else {
                category = item.activityCategory || 'Purchased Electricity';
                subcat = item.subType || 'Grid Electricity';
              }
            } else if (mode === 'Company Vehicle') {
              category = 'Mobile Combustion';
              subcat = item.subType || 'Service Vehicles';
              // Ensure subcat includes "Service Vehicles" if AI used a different name
              if (!subcat.toLowerCase().includes('service') && !subcat.toLowerCase().includes('mobile')) {
                subcat = 'Service Vehicles';
              }
            }

            await prisma.fE1EmissionActivityData.create({
              data: {
                companyId: user.companyId,
                orgUnitId,
                year: reportingYear,
                month: itemMonth,
                activityCategory: category,
                activitySubcat: subcat,
                calcMethod: 'consumption',
                quantity: qty,
                unit: item.unit || (mode === 'Stay' ? 'nights' : mode === 'Energy' ? 'kWh' : 'km'),
                emissionFactor: parseFloat(item.emissionFactor) || 0,
                totalEmissions: ems,
                scope: item.scope || 'Scope 3',
                currency: item.currency || null,
                amount: amt || null,
                sourceDoc: extraction.sourceFile || null,
              },
            });
            succeeded++;
            fileRecords++;
          }
        }

        // Record per-file status for files that had items (even if some were filtered)
        if (extraction.items && extraction.items.length > 0) {
          perFileStatus.push({
            file: extraction.sourceFile || 'Unknown',
            status: fileRecords > 0 ? 'success' : 'failed',
            records: fileRecords,
            confidence: extraction.confidence || 0,
            reason: fileRecords > 0
              ? `${fileRecords} record(s) extracted`
              : `AI extracted ${extraction.items.length} item(s) but all were filtered (no quantity, amount, or emissions).`,
          });
        }
      } else if (result.status === 'rejected') {
        const rawErr = result.reason;
        const errMsg = rawErr?.message || rawErr?.error?.message || (typeof rawErr === 'string' ? rawErr : 'Document processing failed');
        console.error(`[Doc Extract] FAILED:`, rawErr);
        docErrors.push(errMsg);
        perFileStatus.push({
          file: batch[batchResults.indexOf(result)]?.originalname || 'Unknown',
          status: 'error',
          records: 0,
          confidence: 0,
          reason: errMsg,
        });
      } else if (result.status === 'fulfilled' && (!result.value || !result.value.items?.length)) {
        const notes = result.value?.notes || 'No data extracted';
        console.warn('[Doc Extract] No items from:', result.value?.sourceFile, '—', notes);
        docErrors.push(`${result.value?.sourceFile || 'Unknown file'}: ${notes}`);
      }

      await prisma.uploadHistory.update({ where: { id: uploadId }, data: { processedRows: processed } });
    }
  }

  // Deduct the same cost that was previewed / checked up-front.
  const creditsToDeduct = (estimate && estimate.credits) || estimator.estimateDocExtract({ fileCount: files.length }).credits;
  await deductCredits(
    user.companyId,
    user.id,
    creditsToDeduct,
    'DOC_EXTRACT_E1',
    `AI Doc Extract (${mode}): ${files.length} files, ${succeeded} records — ${creditsToDeduct} credits`,
    uploadId,
  );

  if (orgUnitId) {
    await aggregateGHGInventory(user.companyId, orgUnitId);
  }

  // Build status message with warnings and errors
  const messages = [];

  if (docErrors.length > 0) {
    messages.push(`${docErrors.length} document(s) could not be processed:\n${docErrors.join('\n')}`);
  }

  if (yearWarnings.length > 0) {
    const uniqueFiles = [...new Set(yearWarnings.map((w) => w.file))];
    const uniqueYears = [...new Set(yearWarnings.map((w) => w.docYear))];
    messages.push(`${uniqueFiles.length} document(s) contain dates from year(s) ${uniqueYears.join(', ')}, mapped to reporting year ${reportingYear}.`);
  }

  // Determine final status
  const finalStatus = succeeded === 0 && files.length > 0 ? 'FAILED' : 'COMPLETED';
  const errorMessage = messages.length > 0 ? messages.join('\n\n') : null;

  // Encode per-file status so the frontend can show a breakdown.
  // Format: human-readable message, then a <!--FILESTATUS:json--> block.
  const fileStatusTag = perFileStatus.length > 0
    ? `\n<!--FILESTATUS:${JSON.stringify(perFileStatus)}-->`
    : '';
  const fullErrorMessage = (errorMessage || '') + fileStatusTag || null;

  console.log(`[Doc Extract] Final: ${succeeded} records from ${files.length} files. Status: ${finalStatus}. Errors: ${docErrors.length}`);

  await prisma.uploadHistory.update({
    where: { id: uploadId },
    data: {
      status: finalStatus,
      processedRows: processed,
      completedAt: new Date(),
      errorMessage: fullErrorMessage,
    },
  });
}

// ─── Upload Progress ────────────────────────────────────────

router.get('/upload/:id/progress', async (req, res) => {
  const record = await prisma.uploadHistory.findFirst({
    where: { id: req.params.id, companyId: req.user.companyId },
  });
  if (!record) return res.status(404).json({ error: 'Upload not found' });

  res.json({
    status: record.status,
    totalRows: record.totalRows,
    processedRows: record.processedRows,
    progress: record.totalRows ? Math.round((record.processedRows / record.totalRows) * 100) : 0,
    error: record.errorMessage,
  });
});

// ─── SBTi Targets ───────────────────────────────────────────

router.get('/sbti', async (req, res) => {
  const targets = await prisma.sBTiTarget.findMany({
    where: { companyId: req.user.companyId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(targets);
});

router.post('/sbti', async (req, res) => {
  const { baseYear, targetYear, method, reductionPct, absoluteTarget, scope, description } = req.body;
  if (!baseYear || !targetYear || !method) {
    return res.status(400).json({ error: 'Base year, target year, and method required' });
  }

  const target = await prisma.sBTiTarget.create({
    data: {
      companyId: req.user.companyId,
      baseYear: parseInt(baseYear), targetYear: parseInt(targetYear),
      method, reductionPct: reductionPct ? parseFloat(reductionPct) : null,
      absoluteTarget: absoluteTarget ? parseFloat(absoluteTarget) : null,
      scope: scope || 'All', description,
    },
  });
  res.status(201).json(target);
});

router.delete('/sbti/:id', async (req, res) => {
  await prisma.sBTiTarget.deleteMany({ where: { id: req.params.id, companyId: req.user.companyId } });
  res.json({ message: 'Target deleted' });
});

// ─── Activity Categories ────────────────────────────────────

router.get('/categories', async (_, res) => {
  const categories = await prisma.activityCategory.findMany({ include: { subcategories: true } });
  res.json(categories);
});

// ─── Debug: Show all raw activity data ──────────────────────

router.get('/debug/data', async (req, res) => {
  const { companyId } = req.user;
  const all = await prisma.fE1EmissionActivityData.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const summary = {
    totalRecords: all.length,
    years: [...new Set(all.map((a) => a.year))],
    orgUnits: [...new Set(all.map((a) => a.orgUnitId))],
    scopes: [...new Set(all.map((a) => a.scope))],
    totalEmissions: all.reduce((s, r) => s + (r.totalEmissions || 0), 0),
    records: all.map((r) => ({
      id: r.id,
      year: r.year,
      month: r.month,
      category: r.activityCategory,
      subcat: r.activitySubcat,
      scope: r.scope,
      qty: r.quantity,
      unit: r.unit,
      ef: r.emissionFactor,
      emissions: r.totalEmissions,
      orgUnit: r.orgUnitId,
      created: r.createdAt,
    })),
  };
  res.json(summary);
});

module.exports = router;
