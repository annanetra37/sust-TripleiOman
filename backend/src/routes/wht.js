const router = require('express').Router();
const prisma = require('../config/prisma');
const audit = require('../services/audit');
const rulesSvc = require('../services/rules');
const wht = require('../engines/wht');
const { toBaisa } = require('../lib/money');
const { d } = require('../lib/dates');
const { HttpError, asyncHandler } = require('../lib/errors');
const { authenticate, withOrg, requirePermission } = require('../middleware/auth');

router.use(authenticate, withOrg);

async function computeFor(org, body) {
  const party = await prisma.party.findFirst({ where: { id: body.partyId, organisationId: org.id } });
  if (!party) throw new HttpError(404, 'Payee not found — add the foreign supplier first (country, PE status, residency certificate).');
  const date = body.paymentDate ? d(body.paymentDate) : d(new Date());
  const { values } = await rulesSvc.all(date);
  const certValid = !!party.residencyCertExpiry && party.residencyCertExpiry >= date;
  const out = wht.compute({ amountBaisa: toBaisa(body.amountOmr), category: body.category, country: party.country, hasOmanPE: party.hasOmanPE, treatyCertValid: certValid, netOfTax: !!body.netOfTax }, values);
  return { party, date, out, certValid };
}

router.get('/rates', asyncHandler(async (req, res) => res.json(await rulesSvc.get('wht.rates'))));

router.post('/calculate', asyncHandler(async (req, res) => {
  const { out, certValid } = await computeFor(req.org, req.body || {});
  res.json({ ...out, certificateValid: certValid });
}));

router.get('/', asyncHandler(async (req, res) => {
  const where = { organisationId: req.org.id };
  if (req.query.month) {
    const [y, m] = String(req.query.month).split('-').map(Number);
    where.paymentDate = { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) };
  }
  res.json(await prisma.whtPayment.findMany({ where, include: { party: true }, orderBy: { paymentDate: 'desc' } }));
}));

router.post('/', requirePermission('data.write'), asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!b.category) throw new HttpError(400, 'Choose the payment category.');
  const { party, date, out } = await computeFor(req.org, b);
  const p = await prisma.whtPayment.create({ data: {
    organisationId: req.org.id, partyId: party.id, paymentDate: date, category: b.category, grossBaisa: out.grossBaisa, netOfTax: !!b.netOfTax,
    rateBp: out.rateBp, treatyApplied: out.treatyApplied, whtBaisa: out.whtBaisa, explanation: { steps: out.steps }, description: b.description || null,
  } });
  await audit.record({ req, action: 'wht.payment_recorded', objectType: 'wht_payment', objectId: p.id, after: p });
  res.status(201).json(p);
}));

router.delete('/:id', requirePermission('data.write'), asyncHandler(async (req, res) => {
  const p = await prisma.whtPayment.findFirst({ where: { id: req.params.id, organisationId: req.org.id } });
  if (!p) throw new HttpError(404, 'Not found');
  await prisma.whtPayment.delete({ where: { id: p.id } });
  await audit.record({ req, action: 'wht.payment_deleted', objectType: 'wht_payment', objectId: p.id, before: p });
  res.json({ ok: true });
}));

module.exports = router;
