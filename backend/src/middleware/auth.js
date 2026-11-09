const jwt = require('jsonwebtoken');
const config = require('../config');
const prisma = require('../config/prisma');
const audit = require('../services/audit');

const ROLES = ['OWNER', 'FINANCE_ADMIN', 'PREPARER', 'APPROVER', 'VIEWER', 'EXTERNAL_ACCOUNTANT', 'AUDITOR'];

/** Permission matrix (plan E0-05) — enforced in the API, not only in the UI. */
const PERMISSIONS = {
  'org.read': ROLES,
  'org.manage': ['OWNER', 'FINANCE_ADMIN'],
  'members.manage': ['OWNER'],
  'data.write': ['OWNER', 'FINANCE_ADMIN', 'PREPARER', 'EXTERNAL_ACCOUNTANT'],
  'return.prepare': ['OWNER', 'FINANCE_ADMIN', 'PREPARER', 'EXTERNAL_ACCOUNTANT'],
  'return.approve': ['OWNER', 'FINANCE_ADMIN', 'APPROVER'],
  'return.file': ['OWNER', 'FINANCE_ADMIN', 'APPROVER', 'PREPARER', 'EXTERNAL_ACCOUNTANT'],
  'einvoice.send': ['OWNER', 'FINANCE_ADMIN', 'APPROVER', 'PREPARER', 'EXTERNAL_ACCOUNTANT'],
  'audit.read': ['OWNER', 'FINANCE_ADMIN', 'APPROVER', 'AUDITOR'],
  'support.grant': ['OWNER', 'FINANCE_ADMIN'],
};

function signTokens(user) {
  const base = { issuer: config.jwt.issuer, audience: config.jwt.audience, subject: user.id };
  return {
    accessToken: jwt.sign({ typ: 'access' }, config.jwt.secret, { ...base, expiresIn: config.jwt.accessExpiry }),
    refreshToken: jwt.sign({ typ: 'refresh', tv: user.tokenVersion }, config.jwt.refreshSecret, { ...base, expiresIn: config.jwt.refreshExpiry }),
  };
}

function signStepToken(user, typ, expiresIn = '10m') {
  return jwt.sign({ typ }, config.jwt.secret, { issuer: config.jwt.issuer, audience: config.jwt.audience, subject: user.id, expiresIn });
}

/** Verify a token from THIS realm only: wrong issuer/audience/type → rejected (plan E0-02). */
function verifyToken(token, typ, secret = config.jwt.secret) {
  const payload = jwt.verify(token, secret, { issuer: config.jwt.issuer, audience: config.jwt.audience, algorithms: ['HS256'] });
  if (payload.typ !== typ) throw new Error('Wrong token type');
  return payload;
}

const USER_SELECT = {
  id: true, email: true, fullName: true, phone: true, locale: true, digitStyle: true, showHijri: true,
  platformRole: true, isActive: true, mfaEnabled: true, emailVerified: true, createdAt: true,
};

async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = verifyToken(header.slice(7), 'access');
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: USER_SELECT });
    if (!user || !user.isActive) return res.status(401).json({ error: 'Account inactive or not found' });
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

/**
 * Resolve the organisation context from the X-Org-Id header (or :orgId).
 * Members get their role. Platform support staff get read-only access only through an
 * approved, unexpired just-in-time grant (plan E0-08); every such view is logged.
 */
async function withOrg(req, res, next) {
  try {
    const orgId = req.headers['x-org-id'] || req.params.orgId || req.query.orgId;
    if (!orgId) return res.status(400).json({ error: 'Select an organisation first (X-Org-Id header missing).' });
    const membership = await prisma.membership.findUnique({
      where: { userId_organisationId: { userId: req.user.id, organisationId: String(orgId) } },
      include: { organisation: true },
    });
    if (membership && membership.status === 'ACTIVE') {
      req.org = membership.organisation;
      req.role = membership.role;
      if (membership.role === 'EXTERNAL_ACCOUNTANT') req.actingAs = 'by accountant';
      return next();
    }
    if (req.user.platformRole) {
      const grant = await prisma.supportAccessGrant.findFirst({
        where: { organisationId: String(orgId), staffUserId: req.user.id, status: 'APPROVED', expiresAt: { gt: new Date() } },
        include: { organisation: true },
      });
      if (grant) {
        req.org = grant.organisation;
        req.role = 'VIEWER';
        req.actingAs = 'Triple i Oman support';
        audit.recordAsync({ req, action: 'support.view', objectType: 'route', objectId: req.originalUrl, details: { grantId: grant.id } });
        return next();
      }
    }
    return res.status(403).json({ error: 'You do not have access to this organisation.' });
  } catch (err) { return next(err); }
}

function can(role, permission) {
  return (PERMISSIONS[permission] || []).includes(role);
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.role || !can(req.role, permission)) {
      return res.status(403).json({ error: `Your role (${req.role || 'none'}) does not allow: ${permission}` });
    }
    return next();
  };
}

function requirePlatformRole(...roles) {
  return (req, res, next) => {
    if (!req.user?.platformRole || (roles.length && !roles.includes(req.user.platformRole))) {
      return res.status(403).json({ error: 'Triple i Oman staff access required' });
    }
    return next();
  };
}

module.exports = {
  ROLES, PERMISSIONS, USER_SELECT, signTokens, signStepToken, verifyToken,
  authenticate, withOrg, requirePermission, requirePlatformRole, can,
};
