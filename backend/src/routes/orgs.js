const router = require('express').Router();
const crypto = require('crypto');
const prisma = require('../config/prisma');
const audit = require('../services/audit');
const email = require('../services/email');
const rulesSvc = require('../services/rules');
const obligationsSvc = require('../services/obligations');
const vat = require('../engines/vat');
const { einvoicingWave } = require('../engines/obligations');
const { toBaisa } = require('../lib/money');
const { d, daysBetween } = require('../lib/dates');
const { HttpError, asyncHandler } = require('../lib/errors');
const { authenticate, withOrg, requirePermission, ROLES, can } = require('../middleware/auth');

router.use(authenticate);

const ORG_FIELDS = ['legalNameEn', 'legalNameAr', 'crNumber', 'legalForm', 'activities', 'address', 'governorate', 'tin', 'vatNumber', 'exciseNumber'];

function cleanOrg(body, rules) {
  const data = {};
  for (const f of ORG_FIELDS) if (body[f] !== undefined) data[f] = body[f] === '' ? null : String(body[f]).trim();
  if (data.vatNumber) {
    data.vatNumber = data.vatNumber.toUpperCase().replace(/\s/g, '');
    if (!new RegExp(rules['registration.vatNumberFormat'].pattern).test(data.vatNumber)) throw new HttpError(400, 'VAT number must be "OM" followed by 10 characters (e.g. OM1100012345).');
  }
  if (data.crNumber && !/^\d{5,10}$/.test(data.crNumber)) throw new HttpError(400, 'Commercial Registration number should be 5–10 digits.');
  if (body.fiscalYearEndMonth !== undefined) {
    const m = Number(body.fiscalYearEndMonth);
    if (!(m >= 1 && m <= 12)) throw new HttpError(400, 'Fiscal year end month must be 1–12.');
    data.fiscalYearEndMonth = m;
  }
  if (body.vatRegistered !== undefined) data.vatRegistered = !!body.vatRegistered;
  if (body.vatRegisteredAt) data.vatRegisteredAt = d(body.vatRegisteredAt);
  if (body.annualSuppliesOmr !== undefined) data.annualSuppliesBaisa = toBaisa(body.annualSuppliesOmr);
  if (body.paidUpCapitalOmr !== undefined) data.paidUpCapitalBaisa = toBaisa(body.paidUpCapitalOmr);
  if (body.employees !== undefined) data.employees = Math.max(0, parseInt(body.employees, 10) || 0);
  if (body.isPractitionerFirm !== undefined) data.isPractitionerFirm = !!body.isPractitionerFirm;
  return data;
}

router.get('/', asyncHandler(async (req, res) => {
  const ms = await prisma.membership.findMany({ where: { userId: req.user.id, status: 'ACTIVE' }, include: { organisation: true }, orderBy: { createdAt: 'asc' } });
  res.json(ms.map((m) => ({ role: m.role, organisation: m.organisation })));
}));

router.post('/', asyncHandler(async (req, res) => {
  const { values } = await rulesSvc.all();
  if (!req.body?.legalNameEn) throw new HttpError(400, 'Legal name (English) is required.');
  const data = cleanOrg(req.body, values);
  const org = await prisma.organisation.create({ data: { ...data, memberships: { create: { userId: req.user.id, role: 'OWNER' } } } });
  await audit.record({ req, organisationId: org.id, action: 'org.created', objectType: 'organisation', objectId: org.id, after: data });
  res.status(201).json(org);
}));

// ── Practitioner dashboard: every client the user can access (plan E12-01) ──
router.get('/clients-overview', asyncHandler(async (req, res) => {
  const ms = await prisma.membership.findMany({ where: { userId: req.user.id, status: 'ACTIVE' }, include: { organisation: true } });
  const now = new Date();
  const out = [];
  for (const m of ms) {
    const obs = await prisma.obligation.findMany({ where: { organisationId: m.organisationId, status: { notIn: ['SUBMITTED', 'PAID', 'ACKNOWLEDGED'] }, dueDate: { lte: new Date(now.getTime() + 60 * 86400000) } }, orderBy: { dueDate: 'asc' } });
    const overdue = obs.filter((o) => o.dueDate < now).length;
    const next = obs.find((o) => o.dueDate >= now);
    const risk = overdue ? 'HIGH' : next && daysBetween(now, next.dueDate) <= 7 ? 'MEDIUM' : 'LOW';
    out.push({ organisation: { id: m.organisation.id, legalNameEn: m.organisation.legalNameEn, legalNameAr: m.organisation.legalNameAr, vatNumber: m.organisation.vatNumber }, role: m.role, overdue, open: obs.length, next, risk });
  }
  out.sort((a, b) => ({ HIGH: 0, MEDIUM: 1, LOW: 2 }[a.risk] - { HIGH: 0, MEDIUM: 1, LOW: 2 }[b.risk]));
  res.json(out);
}));

router.get('/current', withOrg, asyncHandler(async (req, res) => res.json({ ...req.org, myRole: req.role, actingAs: req.actingAs || null })));

router.patch('/current', withOrg, requirePermission('org.manage'), asyncHandler(async (req, res) => {
  const { values } = await rulesSvc.all();
  const data = cleanOrg(req.body || {}, values);
  const before = req.org;
  const org = await prisma.organisation.update({ where: { id: req.org.id }, data });
  await audit.record({ req, action: 'org.updated', objectType: 'organisation', objectId: org.id, before, after: org, details: { fields: Object.keys(data) } });
  if (['vatRegistered', 'annualSuppliesBaisa', 'fiscalYearEndMonth'].some((k) => k in data)) {
    await obligationsSvc.refresh({ ...org, profile: { ...org.profile, vatRegistered: org.vatRegistered, annualSalesOmr: Number(org.annualSuppliesBaisa) / 1000 } });
  }
  res.json(org);
}));

// ── Smart onboarding questionnaire (plan E1-03) ──
router.post('/current/questionnaire', withOrg, requirePermission('org.manage'), asyncHandler(async (req, res) => {
  const a = req.body || {};
  const answers = {
    vatRegistered: !!a.vatRegistered,
    annualSalesOmr: Math.max(0, Number(a.annualSalesOmr) || 0),
    importsGoods: !!a.importsGoods,
    paysForeignParties: !!a.paysForeignParties,
    exciseGoods: !!a.exciseGoods,
    employees: Math.max(0, parseInt(a.employees, 10) || 0),
    isSmallEnterprise: !!a.isSmallEnterprise,
    ownerIncomeAbovePitThreshold: !!a.ownerIncomeAbovePitThreshold,
    sellsToConsumers: !!a.sellsToConsumers,
    vatQuarterStartMonth: [1, 2, 3].includes(Number(a.vatQuarterStartMonth)) ? Number(a.vatQuarterStartMonth) : 1,
    completedAt: new Date().toISOString(),
  };
  const org = await prisma.organisation.update({
    where: { id: req.org.id },
    data: { profile: answers, vatRegistered: answers.vatRegistered, annualSuppliesBaisa: toBaisa(answers.annualSalesOmr), employees: answers.employees },
  });
  const list = await obligationsSvc.refresh(org);
  await audit.record({ req, action: 'org.questionnaire_completed', objectType: 'organisation', objectId: org.id, after: answers, details: { obligations: list.map((o) => o.taxType) } });
  res.json({ answers, obligations: list });
}));

// ── Dashboard overview ──
router.get('/current/overview', withOrg, asyncHandler(async (req, res) => {
  const org = req.org;
  const { values } = await rulesSvc.all();
  const now = new Date();
  const [obligations, txs, invoiceCounts, letters, expiring, openReturns] = await Promise.all([
    prisma.obligation.findMany({ where: { organisationId: org.id, dueDate: { gte: new Date(now.getTime() - 90 * 86400000) } }, orderBy: { dueDate: 'asc' }, take: 60 }),
    prisma.transaction.findMany({ where: { organisationId: org.id, direction: 'SALE', date: { gte: new Date(now.getTime() - 366 * 86400000) } }, select: { direction: true, date: true, netBaisa: true, vatCategory: true, isCreditNote: true } }),
    prisma.eInvoice.groupBy({ by: ['status'], where: { organisationId: org.id }, _count: true }),
    prisma.taxLetter.findMany({ where: { organisationId: org.id, status: 'OPEN' }, orderBy: { responseDueAt: 'asc' }, take: 5 }),
    prisma.taxDocument.findMany({ where: { organisationId: org.id, expiresAt: { lte: new Date(now.getTime() + 60 * 86400000) } }, select: { id: true, title: true, category: true, expiresAt: true }, take: 10 }),
    prisma.taxReturn.findMany({ where: { organisationId: org.id, status: { in: ['DRAFT', 'IN_REVIEW', 'REJECTED', 'APPROVED'] } }, select: { id: true, taxType: true, status: true, periodStart: true, periodEnd: true, amountDueBaisa: true }, take: 10 }),
  ]);
  const flaggedCount = await prisma.transaction.count({ where: { organisationId: org.id, OR: [{ vatCategory: null }, { NOT: { flags: { equals: [] } } }] } });
  const threshold = vat.thresholdStatus({ transactions: txs, declaredAnnualBaisa: org.annualSuppliesBaisa, rules: values });
  const wave = einvoicingWave({ annualSuppliesBaisa: org.annualSuppliesBaisa, vatRegistered: org.vatRegistered }, values);
  const upcoming = obligations.filter((o) => o.dueDate >= new Date(now.getTime() - 86400000 * 0) && !['SUBMITTED', 'PAID', 'ACKNOWLEDGED'].includes(o.status)).slice(0, 8);
  const overdue = obligations.filter((o) => o.dueDate < now && !['SUBMITTED', 'PAID', 'ACKNOWLEDGED'].includes(o.status));
  const compliant = overdue.length === 0;
  res.json({
    organisation: org, myRole: req.role, onboardingComplete: !!org.profile?.completedAt,
    compliance: { compliant, overdue, upcoming, flaggedTransactions: flaggedCount },
    threshold, einvoicing: wave, invoices: Object.fromEntries(invoiceCounts.map((g) => [g.status, g._count])),
    letters, expiringDocuments: expiring, openReturns, obligationsSummary: org.obligationsSummary,
  });
}));

// ── Members & roles (plan E0-05) ──
router.get('/current/members', withOrg, asyncHandler(async (req, res) => {
  const [members, invitations] = await Promise.all([
    prisma.membership.findMany({ where: { organisationId: req.org.id }, include: { user: { select: { id: true, email: true, fullName: true, mfaEnabled: true, lastLoginAt: true } } }, orderBy: { createdAt: 'asc' } }),
    can(req.role, 'members.manage') ? prisma.invitation.findMany({ where: { organisationId: req.org.id, acceptedAt: null, expiresAt: { gt: new Date() } } }) : [],
  ]);
  res.json({ members, invitations: invitations.map(({ token, ...i }) => i), roles: ROLES });
}));

router.post('/current/invitations', withOrg, requirePermission('members.manage'), asyncHandler(async (req, res) => {
  const em = String(req.body?.email || '').trim().toLowerCase();
  const role = String(req.body?.role || '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) throw new HttpError(400, 'Enter a valid email.');
  if (!ROLES.includes(role)) throw new HttpError(400, `Role must be one of ${ROLES.join(', ')}`);
  const token = crypto.randomBytes(24).toString('hex');
  const inv = await prisma.invitation.create({ data: { organisationId: req.org.id, email: em, role, token, invitedById: req.user.id, expiresAt: new Date(Date.now() + 7 * 86400000) } });
  await email.sendInvite(em, token, req.org.legalNameEn, role).catch((e) => console.error('[invite] email failed', e.message));
  await audit.record({ req, action: 'member.invited', objectType: 'invitation', objectId: inv.id, details: { email: em, role } });
  res.status(201).json({ id: inv.id, email: em, role, expiresAt: inv.expiresAt, ...(process.env.NODE_ENV !== 'production' ? { devAcceptPath: `/accept-invite?token=${token}` } : {}) });
}));

router.delete('/current/invitations/:id', withOrg, requirePermission('members.manage'), asyncHandler(async (req, res) => {
  await prisma.invitation.deleteMany({ where: { id: req.params.id, organisationId: req.org.id } });
  await audit.record({ req, action: 'member.invitation_revoked', objectType: 'invitation', objectId: req.params.id });
  res.json({ ok: true });
}));

router.patch('/current/members/:userId', withOrg, requirePermission('members.manage'), asyncHandler(async (req, res) => {
  const { role, status } = req.body || {};
  if (role && !ROLES.includes(role)) throw new HttpError(400, 'Invalid role');
  const m = await prisma.membership.findUnique({ where: { userId_organisationId: { userId: req.params.userId, organisationId: req.org.id } } });
  if (!m) throw new HttpError(404, 'Member not found');
  if (m.role === 'OWNER' && (role && role !== 'OWNER' || status === 'REVOKED')) {
    const owners = await prisma.membership.count({ where: { organisationId: req.org.id, role: 'OWNER', status: 'ACTIVE' } });
    if (owners <= 1) throw new HttpError(400, 'An organisation must keep at least one owner.');
  }
  const updated = await prisma.membership.update({ where: { id: m.id }, data: { ...(role ? { role } : {}), ...(status ? { status: status === 'REVOKED' ? 'REVOKED' : 'ACTIVE' } : {}) } });
  await audit.record({ req, action: 'member.permission_changed', objectType: 'membership', objectId: m.id, before: m, after: updated, details: { userId: m.userId, from: m.role, to: updated.role, status: updated.status } });
  res.json(updated);
}));

// ── Just-in-time support access (plan E0-08) ──
router.get('/current/support-grants', withOrg, asyncHandler(async (req, res) => {
  const grants = await prisma.supportAccessGrant.findMany({ where: { organisationId: req.org.id }, orderBy: { createdAt: 'desc' }, take: 50 });
  const staff = await prisma.user.findMany({ where: { id: { in: grants.map((g) => g.staffUserId) } }, select: { id: true, fullName: true, email: true } });
  const views = await prisma.auditLog.findMany({ where: { organisationId: req.org.id, action: 'support.view' }, orderBy: { seq: 'desc' }, take: 100, select: { actorLabel: true, objectId: true, createdAt: true } });
  res.json({ grants: grants.map((g) => ({ ...g, staff: staff.find((s) => s.id === g.staffUserId) })), views });
}));

router.post('/current/support-grants/:id/:decision', withOrg, requirePermission('support.grant'), asyncHandler(async (req, res) => {
  const { decision } = req.params;
  if (!['approve', 'deny', 'revoke'].includes(decision)) throw new HttpError(400, 'Invalid decision');
  const g = await prisma.supportAccessGrant.findFirst({ where: { id: req.params.id, organisationId: req.org.id } });
  if (!g) throw new HttpError(404, 'Request not found');
  const hours = Math.min(24, Math.max(1, Number(req.body?.hours) || 4));
  const data = decision === 'approve' ? { status: 'APPROVED', approvedById: req.user.id, expiresAt: new Date(Date.now() + hours * 3600000) }
    : decision === 'deny' ? { status: 'DENIED' } : { status: 'REVOKED', expiresAt: new Date() };
  const updated = await prisma.supportAccessGrant.update({ where: { id: g.id }, data });
  await audit.record({ req, action: `support.${decision}`, objectType: 'support_grant', objectId: g.id, details: { hours: decision === 'approve' ? hours : undefined } });
  res.json(updated);
}));

module.exports = router;
