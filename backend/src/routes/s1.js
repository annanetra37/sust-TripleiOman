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

router.get('/dashboard', async (req, res) => {
  const { companyId } = req.user;
  const { orgUnits, year } = req.query;
  const y = year && year !== 'null' ? parseInt(year) : null;

  const orgList = orgUnits ? orgUnits.split(',').filter(Boolean) : [];
  const orgFilter = orgList.length > 0 ? { orgUnitId: { in: orgList } } : {};
  const where = { companyId, ...orgFilter };
  if (y) where.year = y;

  console.log('[S1 Dashboard] Query:', JSON.stringify({ companyId, year: y, orgList: orgList.length || 'ALL' }));

  // Quick count to check if ANY data exists at all
  const totalAny = await prisma.fS1WorkforceComposition.count({ where: { companyId } });
  const totalForYear = await prisma.fS1WorkforceComposition.count({ where: { companyId, year: y } });
  const distinctYears = await prisma.fS1WorkforceComposition.findMany({ where: { companyId }, select: { year: true }, distinct: ['year'] });
  console.log('[S1 Dashboard] Data check:', { totalAny, totalForYear, years: distinctYears.map((d) => d.year) });

  const [composition, diversity, training, turnover, injuries] = await Promise.all([
    prisma.fS1WorkforceComposition.findMany({ where }),
    prisma.fS1WorkforceDiversity.findMany({ where }),
    prisma.fS1EmployeeTraining.findMany({ where }),
    prisma.fS1EmployeeTurnover.findMany({ where }),
    prisma.fS1WorkplaceInjuries.findMany({ where }),
  ]);

  const totalEmployees = composition.reduce((s, r) => s + r.employeeCount, 0);
  const byGender = {};
  composition.forEach((r) => { byGender[r.gender] = (byGender[r.gender] || 0) + r.employeeCount; });

  const totalTrainingHours = training.reduce((s, r) => s + r.trainingHours, 0);
  const totalTurnover = turnover.reduce((s, r) => s + r.count, 0);
  const turnoverRate = totalEmployees > 0 ? ((totalTurnover / totalEmployees) * 100).toFixed(1) : 0;
  const disabilityCount = diversity.filter((r) => r.disabilityStatus === 'Yes').reduce((s, r) => s + r.count, 0);

  const turnoverByOrgUnit = {};
  turnover.forEach((r) => {
    const key = r.orgUnitId;
    if (!turnoverByOrgUnit[key]) turnoverByOrgUnit[key] = { voluntary: 0, involuntary: 0 };
    turnoverByOrgUnit[key][r.turnoverType.toLowerCase()] += r.count;
  });

  const trainingByGender = {};
  training.forEach((r) => {
    trainingByGender[r.gender] = (trainingByGender[r.gender] || 0) + r.trainingHours;
  });

  const diversityByGender = {};
  diversity.forEach((r) => {
    if (!diversityByGender[r.gender]) diversityByGender[r.gender] = { withDisability: 0, without: 0 };
    if (r.disabilityStatus === 'Yes') diversityByGender[r.gender].withDisability += r.count;
    else diversityByGender[r.gender].without += r.count;
  });

  // ─── Additional KPIs ─────────────────────────────────────

  // Gender percentages
  const femaleCount = (byGender['Female'] || 0);
  const maleCount = (byGender['Male'] || 0);
  const femalePct = totalEmployees > 0 ? Math.round((femaleCount / totalEmployees) * 100) : 0;
  const genderDiversityRatio = totalEmployees > 0 ? Math.round(Math.min(femaleCount, maleCount) / Math.max(femaleCount, maleCount, 1) * 100) : 0;

  // Contract type breakdown
  const byContractType = {};
  composition.forEach((r) => { byContractType[r.contractType] = (byContractType[r.contractType] || 0) + r.employeeCount; });
  const permanentCount = byContractType['Permanent'] || byContractType['Full-time'] || 0;
  const temporaryCount = byContractType['Temporary'] || byContractType['Part-time'] || byContractType['Contract'] || 0;
  const permanentPct = totalEmployees > 0 ? Math.round((permanentCount / totalEmployees) * 100) : 0;

  // Average training hours per employee
  const trainedEmployees = training.reduce((s, r) => s + (r.employeeCount || 0), 0);
  const avgTrainingHours = trainedEmployees > 0 ? Math.round((totalTrainingHours / trainedEmployees) * 10) / 10 : 0;

  // Turnover split (voluntary vs involuntary)
  const voluntaryTurnover = turnover.filter((r) => r.turnoverType === 'Voluntary').reduce((s, r) => s + r.count, 0);
  const involuntaryTurnover = turnover.filter((r) => r.turnoverType === 'Involuntary').reduce((s, r) => s + r.count, 0);
  const voluntaryRate = totalEmployees > 0 ? Math.round((voluntaryTurnover / totalEmployees) * 1000) / 10 : 0;
  const involuntaryRate = totalEmployees > 0 ? Math.round((involuntaryTurnover / totalEmployees) * 1000) / 10 : 0;

  // Disability rate
  const disabilityRate = totalEmployees > 0 ? Math.round((disabilityCount / totalEmployees) * 1000) / 10 : 0;

  // Injury stats
  const totalInjuries = injuries.reduce((s, r) => s + r.count, 0);
  const fatalInjuries = injuries.filter((r) => r.injuryStatus === 'Fatal').reduce((s, r) => s + r.count, 0);
  const lostTimeInjuries = injuries.filter((r) => r.injuryStatus === 'Lost-time').reduce((s, r) => s + r.count, 0);
  // LTIR (Lost Time Injury Rate) per 200,000 hours (OSHA standard)
  const estimatedHours = totalEmployees * 2000; // ~2000 hours/employee/year
  const ltir = estimatedHours > 0 ? Math.round((lostTimeInjuries * 200000 / estimatedHours) * 100) / 100 : 0;

  // Country distribution
  const byCountry = {};
  composition.forEach((r) => { if (r.country) byCountry[r.country] = (byCountry[r.country] || 0) + r.employeeCount; });

  // Turnover by gender
  const turnoverByGender = {};
  turnover.forEach((r) => {
    if (!turnoverByGender[r.gender]) turnoverByGender[r.gender] = { voluntary: 0, involuntary: 0, total: 0 };
    turnoverByGender[r.gender][r.turnoverType.toLowerCase()] += r.count;
    turnoverByGender[r.gender].total += r.count;
  });

  res.json({
    stats: {
      totalEmployees,
      byGender,
      femalePct,
      genderDiversityRatio,
      totalTrainingHours,
      avgTrainingHours,
      trainedEmployees,
      totalTurnover,
      turnoverRate: parseFloat(turnoverRate),
      voluntaryTurnover,
      involuntaryTurnover,
      voluntaryRate,
      involuntaryRate,
      disabilityCount,
      disabilityRate,
      totalInjuries,
      fatalInjuries,
      lostTimeInjuries,
      ltir,
      permanentCount,
      temporaryCount,
      permanentPct,
    },
    charts: {
      employeesByGender: Object.entries(byGender).map(([gender, count]) => ({ gender, count })),
      byContractType: Object.entries(byContractType).map(([type, count]) => ({ type, count })),
      byCountry: Object.entries(byCountry).map(([country, count]) => ({ country, count })).sort((a, b) => b.count - a.count),
      turnoverByOrgUnit,
      turnoverByGender: Object.entries(turnoverByGender).map(([gender, data]) => ({ gender, ...data })),
      trainingByGender: Object.entries(trainingByGender).map(([gender, hours]) => ({ gender, hours })),
      diversityByGender: Object.entries(diversityByGender).map(([gender, data]) => ({ gender, ...data })),
      injuries: injuries.map((i) => ({ type: i.injuryType, status: i.injuryStatus, count: i.count })),
    },
    raw: { composition, diversity, training, turnover, injuries },
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
        fileType: 'S1',
        orgUnit: orgUnit.name, orgUnitId,
        status: 'PROCESSING',
        ...stored,
      },
    });

    processS1WithAI(workbook, req.user, orgUnitId, uploadRecord.id, year).catch((err) => {
      console.error('S1 AI processing error:', err);
      prisma.uploadHistory.update({
        where: { id: uploadRecord.id },
        data: { status: 'FAILED', errorMessage: err.message },
      });
    });

    logActivity(req.user.id, req.user.companyId, 'UPLOAD_S1', `Uploaded ${req.file.originalname} for ${orgUnit.name} (${year})`, { fileName: req.file.originalname, orgUnit: orgUnit.name, year }, req.ip);
    res.status(202).json({ message: 'AI processing started', uploadId: uploadRecord.id });
  } catch (err) {
    console.error('S1 upload error:', err);
    const { status, error } = require('../utils/errors').formatError(err);
    res.status(status).json({ error });
  }
});

async function processS1WithAI(workbook, user, orgUnitId, uploadId, reportingYear) {
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
      const mappingResult = await mapSchema(data, columns, 'S1', costCtx);

      // Step 2+3: For each mapping, clean and ingest
      for (const mapping of mappingResult.mappings) {
        if (mapping.confidence < 0.3) continue; // skip very low confidence mappings

        // Step 2: AI Data Cleaning
        const cleanedRows = await cleanAndTransform(data, mapping, 'S1', costCtx);

        // Step 3: Validation
        const { valid, invalid } = validateAndCoerce(cleanedRows, mapping.targetTable, 'S1');

        if (invalid.length > 0) {
          console.warn(`S1 ${sheetName}: ${invalid.length} rows failed validation`);
        }

        console.log(`[S1 ETL] Table: ${mapping.targetTable}, confidence: ${mapping.confidence}, cleaned: ${cleanedRows.length}, valid: ${valid.length}, invalid: ${invalid.length}`);
        if (valid.length > 0) console.log('[S1 ETL] Sample valid row:', JSON.stringify(valid[0]));

        // Step 4: Ingest into correct table
        for (const row of valid) {
          try {
            const base = { companyId: user.companyId, orgUnitId };

            switch (mapping.targetTable) {
              case 'workforce_composition':
                await prisma.fS1WorkforceComposition.create({
                  data: {
                    ...base,
                    year: reportingYear, quarter: row.quarter || null,
                    gender: row.gender || 'Not disclosed',
                    contractType: row.contractType || 'Permanent',
                    country: row.country || null,
                    employeeCount: parseInt(row.employeeCount) || 1,
                  },
                });
                break;

              case 'workforce_diversity':
                await prisma.fS1WorkforceDiversity.create({
                  data: {
                    ...base,
                    year: reportingYear, quarter: row.quarter || null,
                    gender: row.gender || 'Not disclosed',
                    disabilityStatus: row.disabilityStatus || 'Not disclosed',
                    disabilityType: row.disabilityType || null,
                    count: parseInt(row.count) || 1,
                  },
                });
                break;

              case 'employee_training':
                await prisma.fS1EmployeeTraining.create({
                  data: {
                    ...base,
                    year: reportingYear, quarter: row.quarter || null,
                    gender: row.gender || 'Not disclosed',
                    trainingHours: parseFloat(row.trainingHours) || 0,
                    employeeCount: parseInt(row.employeeCount) || 1,
                  },
                });
                break;

              case 'employee_turnover':
                await prisma.fS1EmployeeTurnover.create({
                  data: {
                    ...base,
                    year: reportingYear, quarter: row.quarter || null,
                    gender: row.gender || 'Not disclosed',
                    turnoverType: row.turnoverType || 'Voluntary',
                    count: parseInt(row.count) || 1,
                  },
                });
                break;

              case 'workplace_injuries':
                await prisma.fS1WorkplaceInjuries.create({
                  data: {
                    ...base,
                    year: reportingYear, quarter: row.quarter || null,
                    injuryType: row.injuryType || 'Other',
                    injuryStatus: row.injuryStatus || 'Non-fatal',
                    gender: row.gender || null,
                    count: parseInt(row.count) || 1,
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

  console.log(`[S1 ETL] Complete: ${insertedRows} rows inserted from ${totalRows} raw rows for year ${reportingYear}`);

  const finalEstimate = estimator.estimateExcelETL({ rowCount: totalRows, sheetCount: allSheetData.length });
  await deductCredits(
    user.companyId,
    user.id,
    finalEstimate.credits,
    'EXCEL_S1',
    `S1 AI ETL: ${insertedRows} rows ingested from ${totalRows} raw rows — ${finalEstimate.credits} credits`,
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

// ─── Debug: Show all raw S1 data ────────────────────────────

router.get('/debug/data', async (req, res) => {
  const { companyId } = req.user;
  const comp = await prisma.fS1WorkforceComposition.findMany({ where: { companyId }, take: 20, orderBy: { createdAt: 'desc' } });
  const div = await prisma.fS1WorkforceDiversity.findMany({ where: { companyId }, take: 10, orderBy: { createdAt: 'desc' } });
  const train = await prisma.fS1EmployeeTraining.findMany({ where: { companyId }, take: 10, orderBy: { createdAt: 'desc' } });
  const turn = await prisma.fS1EmployeeTurnover.findMany({ where: { companyId }, take: 10, orderBy: { createdAt: 'desc' } });

  const years = [...new Set(comp.map((r) => r.year))];
  const orgUnits = [...new Set(comp.map((r) => r.orgUnitId))];

  res.json({
    summary: {
      composition: comp.length,
      diversity: div.length,
      training: train.length,
      turnover: turn.length,
      years,
      orgUnits,
      totalEmployees: comp.reduce((s, r) => s + r.employeeCount, 0),
    },
    sampleComposition: comp.slice(0, 5).map((r) => ({
      year: r.year, gender: r.gender, contractType: r.contractType,
      employeeCount: r.employeeCount, orgUnitId: r.orgUnitId, created: r.createdAt,
    })),
    sampleTraining: train.slice(0, 5).map((r) => ({
      year: r.year, gender: r.gender, hours: r.trainingHours, count: r.employeeCount,
    })),
  });
});

module.exports = router;
