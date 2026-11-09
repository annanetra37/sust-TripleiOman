const router = require('express').Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const QRCode = require('qrcode');
const prisma = require('../config/prisma');
const config = require('../config');
const audit = require('../services/audit');
const email = require('../services/email');
const totp = require('../lib/totp');
const { HttpError, asyncHandler } = require('../lib/errors');
const { authenticate, signTokens, signStepToken, verifyToken, USER_SELECT } = require('../middleware/auth');

// Neutral message: never reveal whether the email exists here or in original Triple i (plan E0-02).
const NEUTRAL = "We couldn't sign you in to Triple i Oman. Check your email and password.";
const PRIVACY_VERSION = '2026-11';
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-password', 12);

const normEmail = (e) => String(e || '').trim().toLowerCase();
function checkPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 10 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) {
    throw new HttpError(400, 'Password must be at least 10 characters and contain letters and numbers.');
  }
}

async function loadMe(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: USER_SELECT });
  const memberships = await prisma.membership.findMany({
    where: { userId, status: 'ACTIVE' },
    include: { organisation: { select: { id: true, legalNameEn: true, legalNameAr: true, vatNumber: true, plan: true, isPractitionerFirm: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return { ...user, memberships: memberships.map((m) => ({ role: m.role, organisation: m.organisation })) };
}

async function issueSession(user, req, method) {
  await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  audit.recordAsync({ req, actor: user, organisationId: null, action: 'auth.login', objectType: 'user', objectId: user.id, details: { method } });
  return { ...signTokens(user), user: await loadMe(user.id) };
}

router.get('/config', (req, res) => {
  res.json({ allowPublicSignup: config.allowPublicSignup, mfaRequired: config.mfaRequired, tripleiUrl: config.tripleiUrl, privacyVersion: PRIVACY_VERSION });
});

router.post('/signup', asyncHandler(async (req, res) => {
  const { fullName, password, phone, locale, acceptPrivacy, acceptTerms } = req.body || {};
  const em = normEmail(req.body?.email);
  const isBootstrap = config.bootstrapAdminEmail && em === config.bootstrapAdminEmail;
  if (!config.allowPublicSignup && !isBootstrap) throw new HttpError(403, 'Self sign-up is disabled. Ask your organisation owner for an invitation.');
  if (!em || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) throw new HttpError(400, 'Enter a valid email address.');
  if (!fullName) throw new HttpError(400, 'Full name is required.');
  if (!acceptPrivacy || !acceptTerms) throw new HttpError(400, 'Please accept the privacy notice and terms (Oman PDPL).');
  checkPassword(password);
  const exists = await prisma.user.findUnique({ where: { email: em } });
  if (exists) throw new HttpError(409, 'An account with this email already exists in Triple i Oman. Try signing in or resetting your password.');
  const user = await prisma.user.create({
    data: {
      email: em, fullName: String(fullName).trim(), phone: phone || null, locale: locale === 'ar' ? 'ar' : 'en',
      passwordHash: await bcrypt.hash(password, 12), platformRole: isBootstrap ? 'PLATFORM_ADMIN' : null,
      consents: { create: [
        { type: 'PRIVACY_NOTICE', version: PRIVACY_VERSION, ip: req.ip },
        { type: 'TERMS', version: PRIVACY_VERSION, ip: req.ip },
      ] },
    },
  });
  audit.recordAsync({ req, actor: user, action: 'auth.signup', objectType: 'user', objectId: user.id });
  if (config.mfaRequired) {
    return res.status(201).json({ mfaEnrollRequired: true, enrollToken: signStepToken(user, 'mfa_enroll', '30m') });
  }
  return res.status(201).json(await issueSession(user, req, 'password'));
}));

router.post('/login', asyncHandler(async (req, res) => {
  const em = normEmail(req.body?.email);
  const user = await prisma.user.findUnique({ where: { email: em } });
  if (!user || !user.isActive) {
    await bcrypt.compare(String(req.body?.password || ''), DUMMY_HASH); // timing equaliser
    throw new HttpError(401, NEUTRAL);
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) throw new HttpError(429, `Too many attempts. Try again after ${user.lockedUntil.toISOString().slice(11, 16)} UTC.`);
  const ok = await bcrypt.compare(String(req.body?.password || ''), user.passwordHash);
  if (!ok) {
    const failed = user.failedLogins + 1;
    await prisma.user.update({ where: { id: user.id }, data: { failedLogins: failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60000) : null } });
    audit.recordAsync({ req, actor: user, action: 'auth.login_failed', objectType: 'user', objectId: user.id });
    throw new HttpError(401, NEUTRAL);
  }
  if (user.mfaEnabled) return res.json({ mfaRequired: true, mfaToken: signStepToken(user, 'mfa', '10m') });
  if (config.mfaRequired) return res.json({ mfaEnrollRequired: true, enrollToken: signStepToken(user, 'mfa_enroll', '30m') });
  return res.json(await issueSession(user, req, 'password'));
}));

router.post('/mfa/verify', asyncHandler(async (req, res) => {
  let payload;
  try { payload = verifyToken(req.body?.mfaToken, 'mfa'); } catch { throw new HttpError(401, 'Your sign-in step expired. Please sign in again.'); }
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive || !user.mfaEnabled) throw new HttpError(401, NEUTRAL);
  if (user.lockedUntil && user.lockedUntil > new Date()) throw new HttpError(429, 'Too many attempts. Try again later.');
  const { code, recoveryCode } = req.body || {};
  if (code && totp.verifyTotp(user.mfaSecret, code)) return res.json(await issueSession(user, req, 'totp'));
  if (recoveryCode) {
    const hashes = Array.isArray(user.recoveryCodes) ? user.recoveryCodes : [];
    for (let i = 0; i < hashes.length; i++) {
      if (await bcrypt.compare(String(recoveryCode).trim().toUpperCase(), hashes[i])) {
        hashes.splice(i, 1);
        await prisma.user.update({ where: { id: user.id }, data: { recoveryCodes: hashes } });
        return res.json(await issueSession(user, req, 'recovery_code'));
      }
    }
  }
  const failed = user.failedLogins + 1;
  await prisma.user.update({ where: { id: user.id }, data: { failedLogins: failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60000) : null } });
  throw new HttpError(401, 'That code is not valid. Try again.');
}));

/** Resolve the user for MFA setup: either a logged-in session or a first-login enrolment token. */
async function setupUser(req) {
  const header = req.headers.authorization || '';
  if (req.body?.enrollToken) {
    try { return { user: await prisma.user.findUnique({ where: { id: verifyToken(req.body.enrollToken, 'mfa_enroll').sub } }), viaEnroll: true }; } catch { throw new HttpError(401, 'Enrolment link expired. Sign in again.'); }
  }
  if (header.startsWith('Bearer ')) {
    try { return { user: await prisma.user.findUnique({ where: { id: verifyToken(header.slice(7), 'access').sub } }), viaEnroll: false }; } catch { /* fallthrough */ }
  }
  throw new HttpError(401, 'Authentication required');
}

router.post('/mfa/setup', asyncHandler(async (req, res) => {
  const { user } = await setupUser(req);
  if (user.mfaEnabled) throw new HttpError(400, 'Two-step verification is already enabled.');
  const secret = totp.generateSecret();
  await prisma.user.update({ where: { id: user.id }, data: { mfaSecret: secret } });
  const uri = totp.otpauthUri(secret, user.email);
  res.json({ secret, otpauthUri: uri, qrDataUrl: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) });
}));

router.post('/mfa/enable', asyncHandler(async (req, res) => {
  const { user, viaEnroll } = await setupUser(req);
  if (!user.mfaSecret || !totp.verifyTotp(user.mfaSecret, req.body?.code)) throw new HttpError(400, 'That code is not valid. Check the time on your phone and try again.');
  const codes = Array.from({ length: 8 }, () => crypto.randomBytes(5).toString('hex').toUpperCase());
  const hashes = await Promise.all(codes.map((c) => bcrypt.hash(c, 10)));
  await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true, recoveryCodes: hashes } });
  audit.recordAsync({ req, actor: user, action: 'auth.mfa_enabled', objectType: 'user', objectId: user.id });
  const out = { recoveryCodes: codes };
  if (viaEnroll) Object.assign(out, await issueSession(user, req, 'totp_enrolment'));
  res.json(out);
}));

router.post('/mfa/disable', authenticate, asyncHandler(async (req, res) => {
  if (config.mfaRequired) throw new HttpError(400, 'Two-step verification is mandatory on Triple i Oman.');
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!totp.verifyTotp(user.mfaSecret, req.body?.code)) throw new HttpError(400, 'That code is not valid.');
  await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: false, mfaSecret: null, recoveryCodes: [] } });
  audit.recordAsync({ req, action: 'auth.mfa_disabled', objectType: 'user', objectId: user.id });
  res.json({ ok: true });
}));

router.post('/refresh', asyncHandler(async (req, res) => {
  let payload;
  try { payload = verifyToken(req.body?.refreshToken, 'refresh', config.jwt.refreshSecret); } catch { throw new HttpError(401, 'Session expired. Please sign in again.'); }
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive || user.tokenVersion !== payload.tv) throw new HttpError(401, 'Session expired. Please sign in again.');
  res.json(signTokens(user));
}));

router.post('/logout-all', authenticate, asyncHandler(async (req, res) => {
  await prisma.user.update({ where: { id: req.user.id }, data: { tokenVersion: { increment: 1 } } });
  audit.recordAsync({ req, action: 'auth.logout_all', objectType: 'user', objectId: req.user.id });
  res.json({ ok: true });
}));

router.get('/me', authenticate, asyncHandler(async (req, res) => res.json(await loadMe(req.user.id))));

router.patch('/me', authenticate, asyncHandler(async (req, res) => {
  const { fullName, phone, locale, digitStyle, showHijri } = req.body || {};
  const data = {};
  if (fullName !== undefined) data.fullName = String(fullName).trim();
  if (phone !== undefined) {
    if (phone && !/^\+968\s?\d{8}$/.test(String(phone).replace(/\s/g, '').replace(/^(\+968)/, '$1 '))) throw new HttpError(400, 'Use an Omani mobile number in the format +968 9XXXXXXX.');
    data.phone = phone || null;
  }
  if (locale) data.locale = locale === 'ar' ? 'ar' : 'en';
  if (digitStyle) data.digitStyle = digitStyle === 'arabic' ? 'arabic' : 'western';
  if (showHijri !== undefined) data.showHijri = !!showHijri;
  await prisma.user.update({ where: { id: req.user.id }, data });
  res.json(await loadMe(req.user.id));
}));

router.post('/change-password', authenticate, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!(await bcrypt.compare(String(req.body?.currentPassword || ''), user.passwordHash))) throw new HttpError(400, 'Current password is incorrect.');
  checkPassword(req.body?.newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(req.body.newPassword, 12), tokenVersion: { increment: 1 } } });
  audit.recordAsync({ req, action: 'auth.password_changed', objectType: 'user', objectId: user.id });
  res.json({ ok: true });
}));

router.post('/forgot-password', asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { email: normEmail(req.body?.email) } });
  if (user && user.isActive) {
    const token = crypto.randomBytes(32).toString('hex');
    await prisma.user.update({ where: { id: user.id }, data: { resetToken: crypto.createHash('sha256').update(token).digest('hex'), resetExpiresAt: new Date(Date.now() + 3600000) } });
    await email.sendResetLink(user.email, token).catch((e) => console.error('[auth] reset email failed', e.message));
  }
  res.json({ ok: true, message: 'If an account exists for this email, a reset link has been sent.' });
}));

router.post('/reset-password', asyncHandler(async (req, res) => {
  const hash = crypto.createHash('sha256').update(String(req.body?.token || '')).digest('hex');
  const user = await prisma.user.findUnique({ where: { resetToken: hash } });
  if (!user || !user.resetExpiresAt || user.resetExpiresAt < new Date()) throw new HttpError(400, 'This reset link is invalid or has expired.');
  checkPassword(req.body?.password);
  // Password reset does NOT reset MFA — MFA reset needs identity re-verification by support (plan E0-04).
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(req.body.password, 12), resetToken: null, resetExpiresAt: null, failedLogins: 0, lockedUntil: null, tokenVersion: { increment: 1 } } });
  audit.recordAsync({ req, actor: user, action: 'auth.password_reset', objectType: 'user', objectId: user.id });
  res.json({ ok: true });
}));

router.get('/invite/:token', asyncHandler(async (req, res) => {
  const inv = await prisma.invitation.findUnique({ where: { token: req.params.token }, include: { organisation: { select: { legalNameEn: true, legalNameAr: true } } } });
  if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) throw new HttpError(404, 'This invitation is invalid or has expired.');
  const existing = await prisma.user.findUnique({ where: { email: inv.email }, select: { id: true } });
  res.json({ email: inv.email, role: inv.role, organisation: inv.organisation, hasAccount: !!existing });
}));

router.post('/accept-invite', asyncHandler(async (req, res) => {
  const inv = await prisma.invitation.findUnique({ where: { token: String(req.body?.token || '') } });
  if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) throw new HttpError(404, 'This invitation is invalid or has expired.');
  let user = await prisma.user.findUnique({ where: { email: inv.email } });
  if (user) {
    if (!(await bcrypt.compare(String(req.body?.password || ''), user.passwordHash))) throw new HttpError(401, NEUTRAL);
  } else {
    if (!req.body?.fullName) throw new HttpError(400, 'Full name is required.');
    if (!req.body?.acceptPrivacy) throw new HttpError(400, 'Please accept the privacy notice.');
    checkPassword(req.body?.password);
    user = await prisma.user.create({ data: {
      email: inv.email, fullName: req.body.fullName, passwordHash: await bcrypt.hash(req.body.password, 12), emailVerified: true,
      consents: { create: [{ type: 'PRIVACY_NOTICE', version: PRIVACY_VERSION, ip: req.ip }, { type: 'TERMS', version: PRIVACY_VERSION, ip: req.ip }] },
    } });
  }
  await prisma.$transaction([
    prisma.membership.upsert({
      where: { userId_organisationId: { userId: user.id, organisationId: inv.organisationId } },
      create: { userId: user.id, organisationId: inv.organisationId, role: inv.role, invitedById: inv.invitedById },
      update: { role: inv.role, status: 'ACTIVE' },
    }),
    prisma.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } }),
  ]);
  audit.recordAsync({ req, actor: user, organisationId: inv.organisationId, action: 'member.joined', objectType: 'membership', objectId: user.id, details: { role: inv.role } });
  if (user.mfaEnabled) return res.json({ mfaRequired: true, mfaToken: signStepToken(user, 'mfa', '10m') });
  if (config.mfaRequired) return res.json({ mfaEnrollRequired: true, enrollToken: signStepToken(user, 'mfa_enroll', '30m') });
  return res.json(await issueSession(user, req, 'invite'));
}));

module.exports = router;
module.exports.loadMe = loadMe;
