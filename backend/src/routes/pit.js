const router = require('express').Router();
const prisma = require('../config/prisma');
const rulesSvc = require('../services/rules');
const audit = require('../services/audit');
const pit = require('../engines/pit');
const { toBaisa } = require('../lib/money');
const { HttpError, asyncHandler } = require('../lib/errors');
const { authenticate } = require('../middleware/auth');

// Public, no sign-up, nothing stored (plan E9-01).
router.post('/am-i-affected', asyncHandler(async (req, res) => {
  const { values } = await rulesSvc.all(new Date('2028-01-01'));
  res.json(pit.amIAffected(req.body || {}, values));
}));

router.use(authenticate);

function normalise(data = {}) {
  return {
    incomes: (data.incomes || []).map((i) => ({ category: i.category, description: i.description || '', amountOmr: Number(i.amountOmr) || 0, foreign: !!i.foreign, foreignTaxPaidOmr: Number(i.foreignTaxPaidOmr) || 0, rentalCostMethod: i.rentalCostMethod || null })),
    deductions: (data.deductions || []).map((x) => ({ category: x.category, description: x.description || '', amountOmr: Number(x.amountOmr) || 0, documentId: x.documentId || null })),
    travelLog: (data.travelLog || []).filter((t) => t.from).map((t) => ({ from: t.from, to: t.to || t.from, note: t.note || '' })),
    interview: data.interview || {},
  };
}

function summarise(year, data, rules) {
  const computed = pit.compute({
    incomes: data.incomes.map((i) => ({ ...i, amountBaisa: toBaisa(i.amountOmr), foreignTaxPaidBaisa: toBaisa(i.foreignTaxPaidOmr) })),
    deductions: data.deductions.map((x) => ({ ...x, amountBaisa: toBaisa(x.amountOmr) })),
  }, rules);
  return { taxYear: year, ...computed, residency: pit.residency(data.travelLog, year, rules), firstTaxYear: 2028, dueDate: `${year + 1}-06-30` };
}

router.get('/profile/:year', asyncHandler(async (req, res) => {
  const year = Number(req.params.year);
  if (!(year >= 2026 && year <= 2100)) throw new HttpError(400, 'Invalid year');
  const p = await prisma.pitProfile.findUnique({ where: { userId_taxYear: { userId: req.user.id, taxYear: year } } });
  const data = normalise(p?.data);
  const { values } = await rulesSvc.all(new Date(Date.UTC(Math.max(year, 2028), 0, 1)));
  res.json({ data, summary: summarise(year, data, values), rules: values['pit.rates'] });
}));

router.put('/profile/:year', asyncHandler(async (req, res) => {
  const year = Number(req.params.year);
  if (!(year >= 2026 && year <= 2100)) throw new HttpError(400, 'Invalid year');
  const data = normalise(req.body || {});
  await prisma.pitProfile.upsert({ where: { userId_taxYear: { userId: req.user.id, taxYear: year } }, create: { userId: req.user.id, taxYear: year, data }, update: { data } });
  audit.recordAsync({ req, organisationId: null, action: 'pit.profile_updated', objectType: 'pit_profile', objectId: `${req.user.id}:${year}` });
  const { values } = await rulesSvc.all(new Date(Date.UTC(Math.max(year, 2028), 0, 1)));
  res.json({ data, summary: summarise(year, data, values) });
}));

module.exports = router;
