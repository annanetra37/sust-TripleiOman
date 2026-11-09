/** Triple i Oman staff console (plan E2-04 rules library with four-eyes approval, E15-03 admin, E0-08 support access). */
const router = require('express').Router();
const prisma = require('../config/prisma');
const audit = require('../services/audit');
const rulesSvc = require('../services/rules');
const notify = require('../services/notify');
const { d } = require('../lib/dates');
const { HttpError, asyncHandler } = require('../lib/errors');
const { authenticate, requirePlatformRole } = require('../middleware/auth');

router.use(authenticate, requirePlatformRole());

router.get('/rules', asyncHandler(async (req, res) => {
  res.json(await prisma.taxRule.findMany({ orderBy: [{ key: 'asc' }, { version: 'desc' }] }));
}));

router.post('/rules', requirePlatformRole('PLATFORM_ADMIN', 'TAX_SPECIALIST'), asyncHandler(async (req, res) => {
  const { key, value, effectiveFrom, effectiveTo, sourceCitation, changeNote } = req.body || {};
  if (!key || value === undefined || !effectiveFrom || !sourceCitation) throw new HttpError(400, 'key, value, effectiveFrom and sourceCitation are required.');
  let parsed = value;
  if (typeof value === 'string') { try { parsed = JSON.parse(value); } catch { throw new HttpError(400, 'Value must be valid JSON.'); } }
  const last = await prisma.taxRule.findFirst({ where: { key }, orderBy: { version: 'desc' } });
  if (!last && !rulesSvc.library.rules.find((r) => r.key === key)) throw new HttpError(400, `Unknown rule key ${key}.`);
  const rule = await prisma.taxRule.create({ data: { key, version: (last?.version || 0) + 1, value: parsed, effectiveFrom: d(effectiveFrom), effectiveTo: effectiveTo ? d(effectiveTo) : null, sourceCitation, changeNote, status: 'DRAFT', createdById: req.user.id } });
  await audit.record({ req, organisationId: null, action: 'rule.proposed', objectType: 'tax_rule', objectId: rule.id, after: parsed, details: { key, version: rule.version } });
  res.status(201).json(rule);
}));

router.post('/rules/:id/:decision', requirePlatformRole('PLATFORM_ADMIN', 'TAX_SPECIALIST'), asyncHandler(async (req, res) => {
  const { decision } = req.params;
  if (!['approve', 'reject'].includes(decision)) throw new HttpError(400, 'Invalid decision');
  const rule = await prisma.taxRule.findUnique({ where: { id: req.params.id } });
  if (!rule || rule.status !== 'DRAFT') throw new HttpError(404, 'Draft rule not found');
  if (rule.createdById === req.user.id) throw new HttpError(403, 'Four-eyes rule: a different specialist must approve this change.');
  const updated = await prisma.taxRule.update({ where: { id: rule.id }, data: decision === 'approve' ? { status: 'APPROVED', approvedById: req.user.id, approvedAt: new Date() } : { status: 'REJECTED', approvedById: req.user.id } });
  if (decision === 'approve') {
    // Close the previous version's window the day before the new one takes effect.
    const prev = await prisma.taxRule.findFirst({ where: { key: rule.key, status: 'APPROVED', version: { lt: rule.version } }, orderBy: { version: 'desc' } });
    if (prev && !prev.effectiveTo && prev.effectiveFrom < rule.effectiveFrom) await prisma.taxRule.update({ where: { id: prev.id }, data: { effectiveTo: new Date(rule.effectiveFrom.getTime() - 86400000) } });
    rulesSvc.invalidate();
  }
  await audit.record({ req, organisationId: null, action: `rule.${decision}d`, objectType: 'tax_rule', objectId: rule.id, details: { key: rule.key, version: rule.version } });
  res.json(updated);
}));

router.get('/tenants', asyncHandler(async (req, res) => {
  const orgs = await prisma.organisation.findMany({ orderBy: { createdAt: 'desc' }, take: 500, select: { id: true, legalNameEn: true, legalNameAr: true, vatNumber: true, plan: true, createdAt: true, _count: { select: { memberships: true, transactions: true, einvoices: true, returns: true } } } });
  const rejected = await prisma.eInvoice.groupBy({ by: ['organisationId'], where: { status: 'REJECTED' }, _count: true });
  res.json(orgs.map((o) => ({ ...o, rejectedInvoices: rejected.find((r) => r.organisationId === o.id)?._count || 0 })));
}));

router.post('/support-requests', asyncHandler(async (req, res) => {
  const { organisationId, reason } = req.body || {};
  if (!organisationId || !reason) throw new HttpError(400, 'Organisation and reason are required.');
  const org = await prisma.organisation.findUnique({ where: { id: organisationId } });
  if (!org) throw new HttpError(404, 'Organisation not found');
  const g = await prisma.supportAccessGrant.create({ data: { organisationId, staffUserId: req.user.id, reason } });
  await notify.toRoles(organisationId, ['OWNER', 'FINANCE_ADMIN'], { type: 'SUPPORT_REQUEST', title: 'Triple i Oman support requests temporary access', body: `${req.user.fullName}: ${reason}. Approve or deny in Settings → Privacy & access.`, link: '/settings?tab=access' }, null, { sendEmail: true });
  await audit.record({ req, organisationId, action: 'support.requested', objectType: 'support_grant', objectId: g.id, details: { reason } });
  res.status(201).json(g);
}));

router.get('/support-requests', asyncHandler(async (req, res) => {
  res.json(await prisma.supportAccessGrant.findMany({ where: { staffUserId: req.user.id }, include: { organisation: { select: { legalNameEn: true } } }, orderBy: { createdAt: 'desc' }, take: 100 }));
}));

router.get('/users', requirePlatformRole('PLATFORM_ADMIN'), asyncHandler(async (req, res) => {
  res.json(await prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 500, select: { id: true, email: true, fullName: true, platformRole: true, isActive: true, mfaEnabled: true, lastLoginAt: true, createdAt: true } }));
}));

router.patch('/users/:id', requirePlatformRole('PLATFORM_ADMIN'), asyncHandler(async (req, res) => {
  const { platformRole, isActive, resetMfa } = req.body || {};
  if (platformRole !== undefined && ![null, '', 'PLATFORM_ADMIN', 'TAX_SPECIALIST', 'SUPPORT'].includes(platformRole)) throw new HttpError(400, 'Invalid platform role');
  if (req.params.id === req.user.id && (isActive === false || (platformRole !== undefined && platformRole !== 'PLATFORM_ADMIN'))) throw new HttpError(400, 'You cannot demote or deactivate yourself.');
  const data = {};
  if (platformRole !== undefined) data.platformRole = platformRole || null;
  if (isActive !== undefined) data.isActive = !!isActive;
  // MFA reset only after identity re-verification (recorded in the reason) — plan E0-04.
  if (resetMfa) {
    if (!req.body?.verificationNote) throw new HttpError(400, 'Record how the user\'s identity was re-verified before resetting MFA.');
    Object.assign(data, { mfaEnabled: false, mfaSecret: null, recoveryCodes: [], tokenVersion: { increment: 1 } });
  }
  const u = await prisma.user.update({ where: { id: req.params.id }, data, select: { id: true, email: true, platformRole: true, isActive: true, mfaEnabled: true } });
  await audit.record({ req, organisationId: null, action: 'admin.user_updated', objectType: 'user', objectId: u.id, details: { ...data, tokenVersion: undefined, verificationNote: req.body?.verificationNote } });
  res.json(u);
}));

router.get('/audit/verify', asyncHandler(async (req, res) => res.json(await audit.verifyChain())));

module.exports = router;
