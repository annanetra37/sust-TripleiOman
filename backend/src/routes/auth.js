const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const prisma = require('../config/prisma');
const { generateOTP, generateToken } = require('../utils/helpers');
const { sendOTP, sendResetLink, sendInvite } = require('../utils/email');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { formatError } = require('../utils/errors');
const { logActivity } = require('../utils/activityLog');

// ─── Sign Up (2-step: personal + company) ────────────────────

router.post('/signup', async (req, res) => {
  // Public self-signup is disabled — accounts are provisioned after a
  // license agreement (https://triplei.io/contact-us). Gated at the API
  // layer, not just hidden in the UI. Set ALLOW_PUBLIC_SIGNUP=true only
  // in dev/demo environments.
  if (process.env.ALLOW_PUBLIC_SIGNUP !== 'true') {
    return res.status(403).json({
      error: 'Self-service signup is disabled. Please contact us for a license at https://triplei.io/contact-us.',
    });
  }
  try {
    const {
      email, password, firstName, lastName, phone,
      companyName, country, industry, companySize,
      ownershipType, yearEstablished, legalStructure,
      hqLocation, regionsOfOp, stockExchange, tickerSymbol,
    } = req.body;

    if (!email || !password || !firstName || !lastName || !companyName || !country || !industry || !companySize) {
      return res.status(400).json({ error: 'Missing required fields: email, password, first name, last name, company name, country, industry, and company size are all required.' });
    }

    // Block personal / free email providers — business emails only.
    const personalDomains = [
      'gmail.com','googlemail.com','yahoo.com','yahoo.co.uk','yahoo.fr','yahoo.de',
      'hotmail.com','hotmail.co.uk','hotmail.fr','hotmail.de',
      'outlook.com','live.com','msn.com',
      'aol.com','icloud.com','me.com','mac.com',
      'mail.com','protonmail.com','proton.me','zoho.com',
      'yandex.com','yandex.ru','gmx.com','gmx.de','gmx.net',
      'tutanota.com','tuta.io','fastmail.com',
      'qq.com','163.com','126.com','sina.com',
      'web.de','t-online.de','freenet.de',
      'rediffmail.com','inbox.com','mail.ru',
    ];
    const emailDomain = email.toLowerCase().split('@')[1];
    if (!emailDomain || personalDomains.includes(emailDomain)) {
      return res.status(400).json({
        error: 'Please use a business email address. Personal email providers (Gmail, Hotmail, Yahoo, etc.) are not accepted.',
        field: 'email',
      });
    }

    if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters and include an uppercase letter, a number, and a special character.' });
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

    const passwordHash = await bcrypt.hash(password, 12);
    const otp = generateOTP();

    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: companyName, country, industry, companySize,
          ownershipType: ownershipType || null,
          yearEstablished: yearEstablished ? parseInt(yearEstablished) : null,
          legalStructure: legalStructure || null,
          hqLocation: hqLocation || null,
          regionsOfOp: regionsOfOp || [],
          stockExchange: stockExchange || null,
          tickerSymbol: tickerSymbol || null,
        },
      });

      const user = await tx.user.create({
        data: {
          email: email.toLowerCase(), passwordHash, firstName, lastName, phone: phone || null,
          role: 'ADMIN', companyId: company.id,
          otpCode: otp,
          otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
          otpLastSentAt: new Date(),
        },
      });

      await tx.orgUnit.create({
        data: { name: 'Headquarters', country, companyId: company.id },
      });

      // Send OTP inside the transaction — if this fails, everything rolls back
      await sendOTP(email, otp);

      return { user, company };
    });

    res.status(201).json({
      message: 'Account created. Check your email for verification code.',
      userId: result.user.id,
    });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Verify Email (OTP) ─────────────────────────────────────

router.post('/verify-email', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: 'Email and verification code are required.' });

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    if (!user) return res.status(404).json({ error: 'No account found with this email.' });
    if (user.emailVerified) return res.json({ message: 'Email is already verified.' });
    if (!user.otpCode || user.otpCode !== otp) return res.status(400).json({ error: 'Invalid verification code. Please check and try again.' });
    if (new Date() > user.otpExpiresAt) return res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, isActive: true, otpCode: null, otpExpiresAt: null },
    });

    res.json({ message: 'Email verified successfully.' });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Resend OTP (60s cooldown) ──────────────────────────────

router.post('/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return res.status(404).json({ error: 'No account found with this email.' });
    if (user.emailVerified) return res.json({ message: 'Email is already verified.' });

    if (user.otpLastSentAt && Date.now() - user.otpLastSentAt.getTime() < 60000) {
      const wait = Math.ceil((60000 - (Date.now() - user.otpLastSentAt.getTime())) / 1000);
      return res.status(429).json({ error: `Please wait ${wait} seconds before requesting a new code.` });
    }

    const otp = generateOTP();
    await prisma.user.update({
      where: { id: user.id },
      data: { otpCode: otp, otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000), otpLastSentAt: new Date() },
    });

    await sendOTP(email, otp);
    res.json({ message: 'A new verification code has been sent to your email.' });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Sign In ────────────────────────────────────────────────

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { company: { select: { id: true, name: true, creditBalance: true, tier: true } } },
    });

    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });
    if (!user.emailVerified) return res.status(403).json({ error: 'Please verify your email before signing in.', needsVerification: true });
    if (!user.isActive) return res.status(403).json({ error: 'Your account has been deactivated. Contact your administrator.' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });

    const accessToken = jwt.sign({ userId: user.id, companyId: user.companyId, role: user.role }, config.jwt.secret, { expiresIn: config.jwt.accessExpiry });
    const refreshToken = jwt.sign({ userId: user.id }, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpiry });

    await prisma.user.update({ where: { id: user.id }, data: { refreshToken } });

    logActivity(user.id, user.companyId, 'LOGIN', `Signed in`, null, req.ip);

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName,
        role: user.role, company: user.company,
      },
    });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Refresh Token ──────────────────────────────────────────

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ error: 'Refresh token is required.' });

    const payload = jwt.verify(refreshToken, config.jwt.refreshSecret);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ error: 'Invalid or revoked refresh token. Please sign in again.' });
    }

    const accessToken = jwt.sign({ userId: user.id, companyId: user.companyId, role: user.role }, config.jwt.secret, { expiresIn: config.jwt.accessExpiry });
    const newRefresh = jwt.sign({ userId: user.id }, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpiry });

    await prisma.user.update({ where: { id: user.id }, data: { refreshToken: newRefresh } });

    res.json({ accessToken, refreshToken: newRefresh });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Logout ─────────────────────────────────────────────────

router.post('/logout', authenticate, async (req, res) => {
  await prisma.user.update({ where: { id: req.user.id }, data: { refreshToken: null } });
  res.json({ message: 'Logged out successfully.' });
});

// ─── Forgot Password ───────────────────────────────────────

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    // Always return success to prevent email enumeration
    if (!user) return res.json({ message: 'If an account with this email exists, a reset link has been sent.' });

    const token = generateToken();
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: { resetToken: token, resetTokenExp: new Date(Date.now() + 60 * 60 * 1000) },
      });
      await sendResetLink(email, token);
    } catch (emailErr) {
      // Revert the token if email fails
      await prisma.user.update({ where: { id: user.id }, data: { resetToken: null, resetTokenExp: null } });
      throw emailErr;
    }
    res.json({ message: 'If an account with this email exists, a reset link has been sent.' });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Reset Password ────────────────────────────────────────

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Reset token and new password are required.' });

    if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters and include an uppercase letter, a number, and a special character.' });
    }

    const user = await prisma.user.findFirst({ where: { resetToken: token, resetTokenExp: { gt: new Date() } } });
    if (!user) return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(password, 12), resetToken: null, resetTokenExp: null },
    });

    res.json({ message: 'Password has been reset successfully. You can now sign in.' });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Invite User (Admin) ───────────────────────────────────

router.post('/invite', authenticate, requireAdmin, async (req, res) => {
  try {
    const { email, firstName, lastName, phone, jobTitle, role, permissions } = req.body;
    if (!email || !firstName || !lastName) {
      return res.status(400).json({ error: 'Email, first name, and last name are required to send an invitation.' });
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) return res.status(409).json({ error: 'A user with this email already exists in the system.' });

    const token = generateToken();
    const company = await prisma.company.findUnique({ where: { id: req.user.companyId } });
    const inviteLink = `${config.frontend.url}/accept-invite?token=${token}`;

    // Create user + permissions in transaction
    const newUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: email.toLowerCase(),
          passwordHash: '',
          firstName, lastName, phone: phone || null, jobTitle: jobTitle || null,
          role: role === 'ADMIN' ? 'ADMIN' : 'CUSTOM',
          companyId: req.user.companyId,
          emailVerified: true,
          inviteToken: token,
          inviteTokenExp: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      // Set org unit permissions if Custom role
      if (role !== 'ADMIN' && permissions && permissions.length > 0) {
        await tx.userPermission.createMany({
          data: permissions.map((p) => ({
            userId: user.id,
            orgUnitId: p.orgUnitId,
            canView: !!p.canView,
            canUpload: !!p.canUpload,
            canDelete: !!p.canDelete,
          })),
        });
      }

      return user;
    });

    // Try sending email — but don't fail if SMTP is broken
    let emailSent = false;
    try {
      await sendInvite(email, token, company.name);
      emailSent = true;
    } catch (emailErr) {
      console.warn('Email send failed (user still created):', emailErr.message);
    }

    res.status(201).json({
      message: emailSent
        ? `Invitation sent to ${email}.`
        : `User created but email could not be sent. Share the invite link manually.`,
      inviteLink: emailSent ? undefined : inviteLink,
      userId: newUser.id,
    });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Accept Invite ──────────────────────────────────────────

router.post('/accept-invite', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Invitation token and password are required.' });

    if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters and include an uppercase letter, a number, and a special character.' });
    }

    const user = await prisma.user.findFirst({ where: { inviteToken: token, inviteTokenExp: { gt: new Date() } } });
    if (!user) return res.status(400).json({ error: 'This invitation link is invalid or has expired. Please ask your administrator to resend it.' });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(password, 12),
        isActive: true,
        inviteToken: null,
        inviteTokenExp: null,
      },
    });

    res.json({ message: 'Account activated successfully. You can now sign in.' });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Get Current User ───────────────────────────────────────

router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, email: true, firstName: true, lastName: true, phone: true,
        jobTitle: true, role: true, isActive: true, createdAt: true,
        company: { select: { id: true, name: true, creditBalance: true, country: true, industry: true, tier: true } },
        permissions: { include: { orgUnit: true } },
      },
    });
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json(user);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

module.exports = router;
