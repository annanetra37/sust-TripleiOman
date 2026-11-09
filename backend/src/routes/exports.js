const router = require('express').Router();
const XLSX = require('xlsx');
const prisma = require('../config/prisma');
const { authenticate } = require('../middleware/auth');
const { formatError } = require('../utils/errors');

router.use(authenticate);

// ─── Export E1 Dashboard Data as Excel ──────────────────────

router.get('/e1', async (req, res) => {
  try {
    const { companyId } = req.user;
    const { year, orgUnits } = req.query;
    const y = parseInt(year) || new Date().getFullYear();
    const orgList = orgUnits ? orgUnits.split(',').filter(Boolean) : [];
    const orgFilter = orgList.length > 0 ? { orgUnitId: { in: orgList } } : {};
    const where = { companyId, year: y, ...orgFilter };

    const [activities, company] = await Promise.all([
      prisma.fE1EmissionActivityData.findMany({ where, orderBy: { createdAt: 'asc' } }),
      prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
    ]);

    const wb = XLSX.utils.book_new();

    // Sheet 1: Summary KPIs
    const totalEmissions = activities.reduce((s, r) => s + (r.totalEmissions || 0), 0);
    const byScope = {};
    activities.forEach((r) => { byScope[r.scope || 'Scope 3'] = (byScope[r.scope || 'Scope 3'] || 0) + (r.totalEmissions || 0); });

    const summaryData = [
      ['ESG Climate Dashboard Export'],
      ['Company', company?.name || ''],
      ['Reporting Year', y],
      ['Export Date', new Date().toISOString().split('T')[0]],
      [],
      ['KPI', 'Value', 'Unit'],
      ['Total GHG Emissions', Math.round(totalEmissions * 10000) / 10000, 'tCO2e'],
      ['Scope 1 (Direct)', Math.round((byScope['Scope 1'] || 0) * 10000) / 10000, 'tCO2e'],
      ['Scope 2 (Purchased Energy)', Math.round((byScope['Scope 2'] || 0) * 10000) / 10000, 'tCO2e'],
      ['Scope 3 (Value Chain)', Math.round((byScope['Scope 3'] || 0) * 10000) / 10000, 'tCO2e'],
      ['Activity Records', activities.length, 'records'],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
    ws1['!cols'] = [{ wch: 30 }, { wch: 20 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Summary');

    // Sheet 2: All Activity Data
    const activityRows = activities.map((a) => ({
      Year: a.year, Month: a.month || '',
      Category: a.activityCategory, Subcategory: a.activitySubcat,
      Scope: a.scope, Quantity: a.quantity, Unit: a.unit,
      'Emission Factor': a.emissionFactor, 'tCO2e': a.totalEmissions,
      Method: a.calcMethod, Currency: a.currency || '', Amount: a.amount || '',
      'Source Document': a.sourceDoc || '',
    }));
    const ws2 = XLSX.utils.json_to_sheet(activityRows);
    XLSX.utils.book_append_sheet(wb, ws2, 'Activity Data');

    // Sheet 3: By Scope
    const scopeRows = Object.entries(byScope).map(([scope, value]) => ({ Scope: scope, 'tCO2e': Math.round(value * 10000) / 10000 }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(scopeRows), 'By Scope');

    // Sheet 4: By Category
    const byCategory = {};
    activities.forEach((r) => { byCategory[r.activityCategory || 'Other'] = (byCategory[r.activityCategory || 'Other'] || 0) + (r.totalEmissions || 0); });
    const catRows = Object.entries(byCategory).map(([cat, value]) => ({ Category: cat, 'tCO2e': Math.round(value * 10000) / 10000 }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(catRows), 'By Category');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="E1_Dashboard_${y}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Export S1 Dashboard Data as Excel ──────────────────────

router.get('/s1', async (req, res) => {
  try {
    const { companyId } = req.user;
    const { year, orgUnits } = req.query;
    const y = parseInt(year) || new Date().getFullYear();
    const orgList = orgUnits ? orgUnits.split(',').filter(Boolean) : [];
    const orgFilter = orgList.length > 0 ? { orgUnitId: { in: orgList } } : {};
    const where = { companyId, year: y, ...orgFilter };

    const [composition, diversity, training, turnover, injuries, company] = await Promise.all([
      prisma.fS1WorkforceComposition.findMany({ where }),
      prisma.fS1WorkforceDiversity.findMany({ where }),
      prisma.fS1EmployeeTraining.findMany({ where }),
      prisma.fS1EmployeeTurnover.findMany({ where }),
      prisma.fS1WorkplaceInjuries.findMany({ where }),
      prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
    ]);

    const wb = XLSX.utils.book_new();
    const totalEmployees = composition.reduce((s, r) => s + r.employeeCount, 0);
    const byGender = {};
    composition.forEach((r) => { byGender[r.gender] = (byGender[r.gender] || 0) + r.employeeCount; });

    // Summary
    const summaryData = [
      ['ESG Workforce Dashboard Export'],
      ['Company', company?.name || ''],
      ['Reporting Year', y],
      ['Export Date', new Date().toISOString().split('T')[0]],
      [],
      ['KPI', 'Value', 'Unit'],
      ['Total Employees', totalEmployees, 'headcount'],
      ['Female %', totalEmployees > 0 ? Math.round(((byGender['Female'] || 0) / totalEmployees) * 100) : 0, '%'],
      ['Male %', totalEmployees > 0 ? Math.round(((byGender['Male'] || 0) / totalEmployees) * 100) : 0, '%'],
      ['Training Hours', training.reduce((s, r) => s + r.trainingHours, 0), 'hours'],
      ['Total Turnover', turnover.reduce((s, r) => s + r.count, 0), 'employees'],
      ['Turnover Rate', totalEmployees > 0 ? Math.round((turnover.reduce((s, r) => s + r.count, 0) / totalEmployees) * 1000) / 10 : 0, '%'],
      ['Disability Count', diversity.filter((r) => r.disabilityStatus === 'Yes').reduce((s, r) => s + r.count, 0), 'employees'],
      ['Total Injuries', injuries.reduce((s, r) => s + r.count, 0), 'incidents'],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), 'Summary');

    // Composition
    const compRows = composition.map((r) => ({
      Year: r.year, Quarter: r.quarter || '', Gender: r.gender,
      'Contract Type': r.contractType, Country: r.country || '', 'Employee Count': r.employeeCount,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(compRows), 'Composition');

    // Training
    const trainRows = training.map((r) => ({
      Year: r.year, Gender: r.gender, 'Training Hours': r.trainingHours, 'Employee Count': r.employeeCount,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(trainRows), 'Training');

    // Turnover
    const turnRows = turnover.map((r) => ({
      Year: r.year, Gender: r.gender, Type: r.turnoverType, Count: r.count,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(turnRows), 'Turnover');

    // Diversity
    const divRows = diversity.map((r) => ({
      Year: r.year, Gender: r.gender, 'Disability Status': r.disabilityStatus,
      'Disability Type': r.disabilityType || '', Count: r.count,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(divRows), 'Diversity');

    // Injuries
    if (injuries.length > 0) {
      const injRows = injuries.map((r) => ({
        Year: r.year, 'Injury Type': r.injuryType, Status: r.injuryStatus, Gender: r.gender || '', Count: r.count,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(injRows), 'Injuries');
    }

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="S1_Dashboard_${y}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Export G1 Governance Data as Excel ─────────────────────

router.get('/g1', async (req, res) => {
  try {
    const { companyId } = req.user;
    const { year, orgUnits } = req.query;
    const y = parseInt(year) || new Date().getFullYear();
    const orgList = orgUnits ? orgUnits.split(',').filter(Boolean) : [];
    const orgFilter = orgList.length > 0 ? { orgUnitId: { in: orgList } } : {};
    const where = { companyId, year: y, ...orgFilter };

    const [board, training, incidents, policies, company] = await Promise.all([
      prisma.fG1BoardComposition.findMany({ where }),
      prisma.fG1EthicsTraining.findMany({ where }),
      prisma.fG1GovernanceIncident.findMany({ where }),
      prisma.fG1PolicyRegister.findMany({ where }),
      prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
    ]);

    const wb = XLSX.utils.book_new();
    const boardSize = board.reduce((s, r) => s + r.count, 0);
    const femaleBoard = board.filter((r) => r.gender === 'Female').reduce((s, r) => s + r.count, 0);
    const independent = board.filter((r) => r.independence === 'Independent').reduce((s, r) => s + r.count, 0);
    const totalIncidents = incidents.reduce((s, r) => s + r.count, 0);
    const confirmed = incidents.filter((r) => r.status === 'Substantiated').reduce((s, r) => s + r.count, 0);
    const totalFines = incidents.reduce((s, r) => s + (r.finesAmount || 0), 0);

    const summaryData = [
      ['ESG Governance Dashboard Export'],
      ['Company', company?.name || ''],
      ['Reporting Year', y],
      ['Export Date', new Date().toISOString().split('T')[0]],
      [],
      ['KPI', 'Value', 'Unit'],
      ['Board Size', boardSize, 'members'],
      ['Women on Board', boardSize > 0 ? Math.round((femaleBoard / boardSize) * 100) : 0, '%'],
      ['Board Independence', boardSize > 0 ? Math.round((independent / boardSize) * 100) : 0, '%'],
      ['People Trained (ethics/compliance)', training.reduce((s, r) => s + r.employeesTrained, 0), 'headcount'],
      ['Governance Incidents', totalIncidents, 'cases'],
      ['Confirmed Incidents', confirmed, 'cases'],
      ['Fines & Penalties', totalFines, 'USD'],
      ['Policies In Place', policies.filter((r) => r.status === 'In place').length, 'policies'],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), 'Summary');

    const boardRows = board.map((r) => ({
      Year: r.year, Quarter: r.quarter || '', Gender: r.gender, Role: r.role,
      Independence: r.independence, 'Age Band': r.ageBand || '', 'Tenure (yrs)': r.tenureYears ?? '', Count: r.count,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(boardRows), 'Board');

    const trainRows = training.map((r) => ({
      Year: r.year, Quarter: r.quarter || '', Topic: r.topic, Audience: r.audience,
      'People Trained': r.employeesTrained, 'Total Headcount': r.totalHeadcount ?? '', 'Completion %': r.completionRate ?? '',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(trainRows), 'Ethics Training');

    const incRows = incidents.map((r) => ({
      Year: r.year, Quarter: r.quarter || '', Type: r.incidentType, Status: r.status,
      'Action Taken': r.actionTaken || '', 'Fines (USD)': r.finesAmount ?? '', Count: r.count,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(incRows), 'Incidents');

    const polRows = policies.map((r) => ({
      Year: r.year, Policy: r.policyName, Area: r.policyArea, Status: r.status,
      'Board Approved': r.boardApproved || '', 'Last Reviewed': r.lastReviewed ?? '', Coverage: r.coverage || '',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(polRows), 'Policies');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="G1_Governance_${y}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

module.exports = router;
