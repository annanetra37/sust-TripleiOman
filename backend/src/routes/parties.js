const router = require('express').Router();
const prisma = require('../config/prisma');
const audit = require('../services/audit');
const { d } = require('../lib/dates');
const { HttpError, asyncHandler } = require('../lib/errors');
const { authenticate, withOrg, requirePermission } = require('../middleware/auth');

router.use(authenticate, withOrg);
const FIELDS = ['kind', 'nameEn', 'nameAr', 'vatNumber', 'crNumber', 'country', 'address', 'city', 'email', 'peppolId', 'hasOmanPE'];

function clean(b) {
  const data = {};
  for (const f of FIELDS) if (b[f] !== undefined) data[f] = typeof b[f] === 'string' ? b[f].trim() || null : b[f];
  if (data.vatNumber) data.vatNumber = data.vatNumber.toUpperCase().replace(/\s/g, '');
  if (data.country) data.country = data.country.toUpperCase().slice(0, 2);
  if (b.residencyCertExpiry !== undefined) data.residencyCertExpiry = b.residencyCertExpiry ? d(b.residencyCertExpiry) : null;
  if (data.kind && !['CUSTOMER', 'SUPPLIER', 'BOTH'].includes(data.kind)) throw new HttpError(400, 'Kind must be CUSTOMER, SUPPLIER or BOTH');
  if (data.country === 'OM' && data.vatNumber && !/^OM[0-9A-Z]{10}$/.test(data.vatNumber)) throw new HttpError(400, 'Omani VAT numbers are "OM" + 10 characters.');
  return data;
}

router.get('/', asyncHandler(async (req, res) => {
  const where = { organisationId: req.org.id };
  if (req.query.kind) where.kind = { in: [String(req.query.kind), 'BOTH'] };
  res.json(await prisma.party.findMany({ where, orderBy: { nameEn: 'asc' } }));
}));

router.post('/', requirePermission('data.write'), asyncHandler(async (req, res) => {
  const data = clean(req.body || {});
  if (!data.nameEn) throw new HttpError(400, 'Name is required.');
  const p = await prisma.party.create({ data: { kind: 'CUSTOMER', ...data, organisationId: req.org.id } });
  await audit.record({ req, action: 'party.created', objectType: 'party', objectId: p.id, after: p });
  res.status(201).json(p);
}));

router.patch('/:id', requirePermission('data.write'), asyncHandler(async (req, res) => {
  const p = await prisma.party.findFirst({ where: { id: req.params.id, organisationId: req.org.id } });
  if (!p) throw new HttpError(404, 'Not found');
  const updated = await prisma.party.update({ where: { id: p.id }, data: clean(req.body || {}) });
  await audit.record({ req, action: 'party.updated', objectType: 'party', objectId: p.id, before: p, after: updated });
  res.json(updated);
}));

router.delete('/:id', requirePermission('data.write'), asyncHandler(async (req, res) => {
  const p = await prisma.party.findFirst({ where: { id: req.params.id, organisationId: req.org.id } });
  if (!p) throw new HttpError(404, 'Not found');
  const used = await prisma.whtPayment.count({ where: { partyId: p.id } });
  if (used) throw new HttpError(409, 'This party has withholding tax payments and cannot be deleted.');
  await prisma.party.delete({ where: { id: p.id } });
  await audit.record({ req, action: 'party.deleted', objectType: 'party', objectId: p.id, before: p });
  res.json({ ok: true });
}));

module.exports = router;
