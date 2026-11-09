const router = require('express').Router();
const prisma = require('../config/prisma');
const config = require('../config');
const audit = require('../services/audit');
const obligationsSvc = require('../services/obligations');
const { toICal } = require('../engines/obligations');
const { d, hijri } = require('../lib/dates');
const { HttpError, asyncHandler } = require('../lib/errors');
const { authenticate, withOrg, requirePermission } = require('../middleware/auth');

router.use(authenticate, withOrg);

const STATUSES = ['NOT_STARTED', 'DATA_MISSING', 'READY_FOR_REVIEW', 'APPROVED', 'SUBMITTED', 'PAID', 'ACKNOWLEDGED'];

router.get('/', asyncHandler(async (req, res) => {
  const where = { organisationId: req.org.id };
  if (req.query.taxType) where.taxType = String(req.query.taxType);
  if (req.query.status) where.status = String(req.query.status);
  if (req.query.from || req.query.to) where.dueDate = { ...(req.query.from ? { gte: d(req.query.from) } : {}), ...(req.query.to ? { lte: d(req.query.to) } : {}) };
  const rows = await prisma.obligation.findMany({ where, orderBy: { dueDate: 'asc' }, include: { returns: { select: { id: true, status: true } } } });
  const locale = req.user.locale;
  res.json(rows.map((o) => ({ ...o, dueDateHijri: req.user.showHijri ? hijri(o.dueDate, locale) : null })));
}));

router.post('/regenerate', requirePermission('org.manage'), asyncHandler(async (req, res) => {
  const list = await obligationsSvc.refresh(req.org);
  await audit.record({ req, action: 'obligations.regenerated', objectType: 'organisation', objectId: req.org.id });
  res.json({ obligations: list });
}));

router.patch('/:id', requirePermission('return.prepare'), asyncHandler(async (req, res) => {
  const ob = await prisma.obligation.findFirst({ where: { id: req.params.id, organisationId: req.org.id } });
  if (!ob) throw new HttpError(404, 'Obligation not found');
  const { status, notes } = req.body || {};
  if (status && !STATUSES.includes(status)) throw new HttpError(400, `Status must be one of ${STATUSES.join(', ')}`);
  // Approval-type statuses must go through the return workflow, not a manual toggle.
  if (status === 'APPROVED' && ['VAT', 'CIT', 'WHT', 'EXCISE'].includes(ob.taxType)) throw new HttpError(400, 'Approve the return itself (Returns → Review) to mark this obligation approved.');
  const updated = await prisma.obligation.update({ where: { id: ob.id }, data: { ...(status ? { status } : {}), ...(notes !== undefined ? { notes } : {}) } });
  await audit.record({ req, action: 'obligation.updated', objectType: 'obligation', objectId: ob.id, before: ob, after: updated, details: { from: ob.status, to: updated.status } });
  res.json(updated);
}));

router.post('/', requirePermission('data.write'), asyncHandler(async (req, res) => {
  const { title, dueDate, notes } = req.body || {};
  if (!title || !dueDate) throw new HttpError(400, 'Title and due date are required.');
  const due = d(dueDate);
  const ob = await prisma.obligation.create({ data: { organisationId: req.org.id, taxType: 'OTHER', title, dueDate: due, periodStart: due, periodEnd: due, notes } });
  await audit.record({ req, action: 'obligation.created', objectType: 'obligation', objectId: ob.id });
  res.status(201).json(ob);
}));

router.get('/export.ics', asyncHandler(async (req, res) => {
  const rows = await prisma.obligation.findMany({ where: { organisationId: req.org.id }, orderBy: { dueDate: 'asc' } });
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="triplei-oman-tax-calendar.ics"');
  res.send(toICal(req.org.legalNameEn, rows, config.appUrl));
}));

module.exports = router;
