const router = require('express').Router();
const multer = require('multer');
const XLSX = require('xlsx');
const prisma = require('../config/prisma');
const { authenticate } = require('../middleware/auth');
const { deductCredits } = require('../middleware/credits');
const { mapSchema, cleanAndTransform, validateAndCoerce } = require('../services/aiEtl');
const { saveFile } = require('../utils/fileStore');
const { logActivity } = require('../utils/activityLog');
const estimator = require('../utils/estimator');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.use(authenticate);

// ─── Dashboard Stats ────────────────────────────────────────
// Serves both governance pages: Board & Leadership and Ethics & Compliance.

router.get('/dashboard', async (req, res) => {
  const { companyId } = req.user;
  const { orgUnits, year } = req.query;
  const y = year && year !== 'null' ? parseInt(year) : null;

  const orgList = orgUnits ? orgUnits.split(',').filter(Boolean) : [];
  const orgFilter = orgList.length > 0 ? { orgUnitId: { in: orgList } } : {};
  const where = { companyId, ...orgFilter };
  if (y) where.year = y;

  const [board, training, incidents, policies] = await Promise.all([
    prisma.fG1BoardComposition.findMany({ where }),
    prisma.fG1EthicsTraining.findMany({ where }),
    prisma.fG1GovernanceIncident.findMany({ where }),
    prisma.fG1PolicyRegister.findMany({ where }),
  ]);

  // ─── Board & Leadership KPIs ─────────────────────────────
  const boardSize = board.reduce((s, r) => s + r.count, 0);
  const boardByGender = {};
  board.forEach((r) => { boardByGender[r.gender] = (boardByGender[r.gender] || 0) + r.count; });
  const femaleBoard = boardByGender['Female'] || 0;
  const femaleBoardPct = boardSize > 0 ? Math.round((femaleBoard / boardSize) * 100) : 0;

  const independentCount = board.filter((r) => r.independence === 'Independent').reduce((s, r) => s + r.count, 0);
  const independencePct = boardSize > 0 ? Math.round((independentCount / boardSize) * 100) : 0;

  const nonExecCount = board.filter((r) => ['Non-executive', 'Chair', 'Vice-chair'].includes(r.role)).reduce((s, r) => s + r.count, 0);
  const nonExecPct = boardSize > 0 ? Math.round((nonExecCount / boardSize) * 100) : 0;

  const tenureRows = board.filter((r) => r.tenureYears != null);
  const tenureWeight = tenureRows.reduce((s, r) => s + r.count, 0);
  const avgTenure = tenureWeight > 0
    ? Math.round((tenureRows.reduce((s, r) => s + r.tenureYears * r.count, 0) / tenureWeight) * 10) / 10
    : null;

  const boardByRole = {};
  board.forEach((r) => { boardByRole[r.role] = (boardByRole[r.role] || 0) + r.count; });
  const boardByAge = {};
  board.forEach((r) => { if (r.ageBand) boardByAge[r.ageBand] = (boardByAge[r.ageBand] || 0) + r.count; });
  const boardByIndependence = {};
  board.forEach((r) => { boardByIndependence[r.independence] = (boardByIndependence[r.independence] || 0) + r.count; });

  // ─── Ethics & Compliance KPIs ────────────────────────────
  const totalTrained = training.reduce((s, r) => s + r.employeesTrained, 0);
  // Weighted average completion rate: prefer explicit rate, else derive from counts
  const ratedRows = training.filter((r) => r.completionRate != null || (r.totalHeadcount || 0) > 0);
  const ratedWeight = ratedRows.reduce((s, r) => s + (r.totalHeadcount || r.employeesTrained), 0);
  const avgCompletionRate = ratedWeight > 0
    ? Math.round(ratedRows.reduce((s, r) => {
        const rate = r.completionRate != null ? r.completionRate : (r.employeesTrained / r.totalHeadcount) * 100;
        return s + rate * (r.totalHeadcount || r.employeesTrained);
      }, 0) / ratedWeight)
    : null;

  const trainingByTopic = {};
  training.forEach((r) => { trainingByTopic[r.topic] = (trainingByTopic[r.topic] || 0) + r.employeesTrained; });

  const totalIncidents = incidents.reduce((s, r) => s + r.count, 0);
  const confirmedIncidents = incidents.filter((r) => r.status === 'Substantiated').reduce((s, r) => s + r.count, 0);
  const openIncidents = incidents.filter((r) => ['Open', 'Under investigation'].includes(r.status)).reduce((s, r) => s + r.count, 0);
  const corruptionIncidents = incidents.filter((r) => ['Corruption', 'Bribery'].includes(r.incidentType)).reduce((s, r) => s + r.count, 0);
  const totalFines = Math.round(incidents.reduce((s, r) => s + (r.finesAmount || 0), 0) * 100) / 100;

  const incidentsByType = {};
  incidents.forEach((r) => { incidentsByType[r.incidentType] = (incidentsByType[r.incidentType] || 0) + r.count; });
  const incidentsByStatus = {};
  incidents.forEach((r) => { incidentsByStatus[r.status] = (incidentsByStatus[r.status] || 0) + r.count; });
  const incidentsByQuarter = {};
  incidents.forEach((r) => {
    const key = r.quarter ? `Q${r.quarter}` : 'Annual';
    incidentsByQuarter[key] = (incidentsByQuarter[key] || 0) + r.count;
  });

  const policiesInPlace = policies.filter((r) => r.status === 'In place').length;
  const policiesTotal = policies.length;
  const policyCoveragePct = policiesTotal > 0 ? Math.round((policiesInPlace / policiesTotal) * 100) : null;
  const boardApprovedPolicies = policies.filter((r) => r.boardApproved === 'Yes').length;

  res.json({
    stats: {
      // Board & Leadership
      boardSize,
      femaleBoard,
      femaleBoardPct,
      independentCount,
      independencePct,
      nonExecCount,
      nonExecPct,
      avgTenure,
      // Ethics & Compliance
      totalTrained,
      avgCompletionRate,
      totalIncidents,
      confirmedIncidents,
      openIncidents,
      corruptionIncidents,
      totalFines,
      policiesInPlace,
      policiesTotal,
      policyCoveragePct,
      boardApprovedPolicies,
    },
    charts: {
      boardByGender: Object.entries(boardByGender).map(([gender, count]) => ({ gender, count })),
      boardByRole: Object.entries(boardByRole).map(([role, count]) => ({ role, count })),
      boardByAge: Object.entries(boardByAge).map(([band, count]) => ({ band, count })),
      boardByIndependence: Object.entries(boardByIndependence).map(([independence, count]) => ({ independence, count })),
      trainingByTopic: Object.entries(trainingByTopic).map(([topic, trained]) => ({ topic, trained })),
      incidentsByType: Object.entries(incidentsByType).map(([type, count]) => ({ type, count })),
      incidentsByStatus: Object.entries(incidentsByStatus).map(([status, count]) => ({ status, count })),
      incidentsByQuarter: Object.entries(incidentsByQuarter).map(([quarter, count]) => ({ quarter, count })),
    },
    raw: { board, training, incidents, policies },
  });
});

// ─── Upload (AI-Powered ETL) ────────────────────────────────

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
        companyId: req.user.companyId,
        userId: req.user.id,
        fileName: req.file.originalname,
        fileType: 'G1',
        orgUnit: orgUnit.name, orgUnitId,
        status: 'PROCESSING',
        ...stored,
      },
    });

    processG1WithAI(workbook, req.user, orgUnitId, uploadRecord.id, year).catch((err) => {
      console.error('G1 AI processing error:', err);
      prisma.uploadHistory.update({
        where: { id: uploadRecord.id },
        data: { status: 'FAILED', errorMessage: err.message },
      });
    });

    logActivity(req.user.id, req.user.companyId, 'UPLOAD_G1', `Uploaded ${req.file.originalname} for ${orgUnit.name} (${year})`, { fileName: req.file.originalname, orgUnit: orgUnit.name, year }, req.ip);
    res.status(202).json({ message: 'AI processing started', uploadId: uploadRecord.id });
  } catch (err) {
    console.error('G1 upload error:', err);
    const { status, error } = require('../utils/errors').formatError(err);
    res.status(status).json({ error });
  }
});

async function processG1WithAI(workbook, user, orgUnitId, uploadId, reportingYear) {
  let totalRows = 0;
  let processedRows = 0;
  let insertedRows = 0;

  // Collect all data from all sheets
  const allSheetData = [];
  for (const sheetName of workbook.SheetNames) {
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });
    if (data.length > 0) {
      allSheetData.push({ sheetName, data });
      totalRows += data.length;
    }
  }

  if (totalRows === 0) {
    await prisma.uploadHistory.update({
      where: { id: uploadId },
      data: { status: 'FAILED', errorMessage: 'No data found in file' },
    });
    return;
  }

  // Estimator-based credit cost — scales with row count & number of sheets.
  const estimate = estimator.estimateExcelETL({ rowCount: totalRows, sheetCount: allSheetData.length });
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

  // Process each sheet through the AI ETL pipeline
  for (const { sheetName, data } of allSheetData) {
    try {
      const columns = Object.keys(data[0] || {});

      // Step 1: AI Schema Mapping
      const costCtx = { companyId: user.companyId, userId: user.id, relatedId: uploadId, metadata: { sheet: sheetName } };
      const mappingResult = await mapSchema(data, columns, 'G1', costCtx);

      // Step 2+3: For each mapping, clean and ingest
      for (const mapping of mappingResult.mappings) {
        if (mapping.confidence < 0.3) continue; // skip very low confidence mappings

        // Step 2: AI Data Cleaning
        const cleanedRows = await cleanAndTransform(data, mapping, 'G1', costCtx);

        // Step 3: Validation
        const { valid, invalid } = validateAndCoerce(cleanedRows, mapping.targetTable, 'G1');

        if (invalid.length > 0) {
          console.warn(`G1 ${sheetName}: ${invalid.length} rows failed validation`);
        }

        console.log(`[G1 ETL] Table: ${mapping.targetTable}, confidence: ${mapping.confidence}, cleaned: ${cleanedRows.length}, valid: ${valid.length}, invalid: ${invalid.length}`);

        // Step 4: Ingest into correct table
        for (const row of valid) {
          try {
            const base = { companyId: user.companyId, orgUnitId };

            switch (mapping.targetTable) {
              case 'board_composition':
                await prisma.fG1BoardComposition.create({
                  data: {
                    ...base,
                    year: reportingYear, quarter: row.quarter || null,
                    gender: row.gender || 'Not disclosed',
                    role: row.role || 'Non-executive',
                    independence: row.independence || 'Not disclosed',
                    ageBand: row.ageBand || null,
                    tenureYears: row.tenureYears != null ? parseFloat(row.tenureYears) : null,
                    count: parseInt(row.count) || 1,
                  },
                });
                break;

              case 'ethics_training':
                await prisma.fG1EthicsTraining.create({
                  data: {
                    ...base,
                    year: reportingYear, quarter: row.quarter || null,
                    topic: row.topic || 'Other',
                    audience: row.audience || 'Employees',
                    employeesTrained: parseInt(row.employeesTrained) || 0,
                    totalHeadcount: row.totalHeadcount != null ? parseInt(row.totalHeadcount) : null,
                    completionRate: row.completionRate != null ? parseFloat(row.completionRate) : null,
                  },
                });
                break;

              case 'governance_incidents':
                await prisma.fG1GovernanceIncident.create({
                  data: {
                    ...base,
                    year: reportingYear, quarter: row.quarter || null,
                    incidentType: row.incidentType || 'Other',
                    status: row.status || 'Open',
                    actionTaken: row.actionTaken || null,
                    finesAmount: row.finesAmount != null ? parseFloat(row.finesAmount) : null,
                    count: parseInt(row.count) || 1,
                  },
                });
                break;

              case 'policy_register':
                await prisma.fG1PolicyRegister.create({
                  data: {
                    ...base,
                    year: reportingYear,
                    policyName: row.policyName || 'Unnamed policy',
                    policyArea: row.policyArea || 'Other',
                    status: row.status || 'Not in place',
                    boardApproved: row.boardApproved || null,
                    lastReviewed: row.lastReviewed != null ? parseInt(row.lastReviewed) : null,
                    coverage: row.coverage || null,
                  },
                });
                break;
            }

            insertedRows++;
          } catch (err) {
            console.error('Row insert error:', err.message);
          }

          processedRows++;
          if (processedRows % 25 === 0) {
            await prisma.uploadHistory.update({ where: { id: uploadId }, data: { processedRows } });
          }
        }

        // Count skipped rows towards processed
        processedRows += invalid.length;
      }
    } catch (err) {
      console.error(`Sheet "${sheetName}" processing error:`, err.message);
      processedRows += data.length;
    }
  }

  console.log(`[G1 ETL] Complete: ${insertedRows} rows inserted from ${totalRows} raw rows for year ${reportingYear}`);

  const finalEstimate = estimator.estimateExcelETL({ rowCount: totalRows, sheetCount: allSheetData.length });
  await deductCredits(
    user.companyId,
    user.id,
    finalEstimate.credits,
    'EXCEL_G1',
    `G1 AI ETL: ${insertedRows} rows ingested from ${totalRows} raw rows — ${finalEstimate.credits} credits`,
    uploadId,
  );

  await prisma.uploadHistory.update({
    where: { id: uploadId },
    data: { status: 'COMPLETED', processedRows: totalRows, completedAt: new Date() },
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

module.exports = router;
