/** Notifications, privacy (Oman PDPL — plan E0-09), public rules changelog, plans (E14-01). */
const router = require('express').Router();
const prisma = require('../config/prisma');
const audit = require('../services/audit');
const { asyncHandler, HttpError } = require('../lib/errors');
const { authenticate } = require('../middleware/auth');

const PLANS = [
  { id: 'FREE', priceOmrMonthly: 0, nameEn: 'Free', nameAr: 'مجاني', featuresEn: ['Up to 20 e-invoices / month', 'Tax calendar & reminders', 'VAT threshold monitor'], featuresAr: ['حتى 20 فاتورة إلكترونية شهرياً', 'التقويم الضريبي والتذكيرات', 'مراقبة حد التسجيل'] },
  { id: 'SME', priceOmrMonthly: 15, nameEn: 'SME', nameAr: 'المنشآت الصغيرة', featuresEn: ['500 e-invoices / month', 'VAT return preparation & filing companion', 'Excel import & data checks', '3 users'], featuresAr: ['500 فاتورة شهرياً', 'إعداد إقرار ضريبة القيمة المضافة', 'استيراد Excel', '3 مستخدمين'] },
  { id: 'BUSINESS', priceOmrMonthly: 60, nameEn: 'Business', nameAr: 'الأعمال', featuresEn: ['Unlimited e-invoices', 'VAT, WHT, CIT & excise', 'ERP connectors', 'Audit pack', '15 users'], featuresAr: ['فواتير غير محدودة', 'جميع الضرائب', 'ربط أنظمة ERP', 'حزمة التدقيق', '15 مستخدماً'] },
  { id: 'PRACTITIONER', priceOmrMonthly: 120, nameEn: 'Practitioner', nameAr: 'المحاسبين', featuresEn: ['Multi-client dashboard', 'Bulk reminders', 'Client billing'], featuresAr: ['لوحة متعددة العملاء', 'تذكيرات جماعية', 'فوترة العملاء'] },
  { id: 'PERSONAL', priceOmrMonthly: 3, nameEn: 'Personal (PIT)', nameAr: 'شخصي', featuresEn: ['Receipt vault', 'Residency counter', 'Personal income tax interview (from 2028)'], featuresAr: ['خزنة الإيصالات', 'عداد الإقامة', 'مقابلة ضريبة الدخل الشخصي (من 2028)'] },
];

router.get('/plans', (req, res) => res.json({ plans: PLANS, noteEn: 'Prices exclude 5% VAT. Indicative pricing — payment gateway for Omani cards to be confirmed [VERIFY provider].' }));

router.get('/rules/changelog', asyncHandler(async (req, res) => {
  const rows = await prisma.taxRule.findMany({ where: { status: 'APPROVED' }, orderBy: [{ approvedAt: 'desc' }], take: 100, select: { key: true, version: true, effectiveFrom: true, effectiveTo: true, sourceCitation: true, changeNote: true, approvedAt: true } });
  res.json(rows);
}));

router.use(authenticate);

router.get('/notifications', asyncHandler(async (req, res) => {
  const rows = await prisma.notification.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' }, take: 50 });
  res.json({ rows, unread: rows.filter((r) => !r.readAt).length });
}));
router.post('/notifications/read-all', asyncHandler(async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user.id, readAt: null }, data: { readAt: new Date() } });
  res.json({ ok: true });
}));
router.post('/notifications/:id/read', asyncHandler(async (req, res) => {
  await prisma.notification.updateMany({ where: { id: req.params.id, userId: req.user.id }, data: { readAt: new Date() } });
  res.json({ ok: true });
}));

router.get('/privacy/export', asyncHandler(async (req, res) => {
  const [user, consents, memberships, pit, notifications] = await Promise.all([
    prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, email: true, fullName: true, phone: true, locale: true, createdAt: true, lastLoginAt: true, mfaEnabled: true } }),
    prisma.consentRecord.findMany({ where: { userId: req.user.id } }),
    prisma.membership.findMany({ where: { userId: req.user.id }, include: { organisation: { select: { legalNameEn: true } } } }),
    prisma.pitProfile.findMany({ where: { userId: req.user.id } }),
    prisma.notification.findMany({ where: { userId: req.user.id } }),
  ]);
  audit.recordAsync({ req, organisationId: null, action: 'privacy.data_exported', objectType: 'user', objectId: req.user.id });
  res.setHeader('Content-Disposition', 'attachment; filename="my-triplei-oman-data.json"');
  res.json({ exportedAt: new Date().toISOString(), user, consents, memberships, personalIncomeTax: pit, notifications });
}));

router.get('/privacy/consents', asyncHandler(async (req, res) => res.json(await prisma.consentRecord.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } }))));

router.post('/privacy/consents', asyncHandler(async (req, res) => {
  const { type, granted } = req.body || {};
  if (!['MARKETING', 'WHATSAPP', 'SMS'].includes(type)) throw new HttpError(400, 'Only optional consents can be changed here.');
  const c = await prisma.consentRecord.create({ data: { userId: req.user.id, type, version: '2026-11', granted: !!granted, ip: req.ip } });
  res.json(c);
}));

/**
 * Deletion request: personal data is anonymised, but organisation tax records are kept for the
 * legal retention period (≥10 years) — plan E0-09.
 */
router.post('/privacy/delete-account', asyncHandler(async (req, res) => {
  if (req.body?.confirm !== 'DELETE') throw new HttpError(400, 'Type DELETE to confirm.');
  const owned = await prisma.membership.findMany({ where: { userId: req.user.id, role: 'OWNER', status: 'ACTIVE' } });
  for (const m of owned) {
    const others = await prisma.membership.count({ where: { organisationId: m.organisationId, role: 'OWNER', status: 'ACTIVE', NOT: { userId: req.user.id } } });
    if (!others) throw new HttpError(409, 'You are the only owner of an organisation. Transfer ownership first.');
  }
  await audit.record({ req, organisationId: null, action: 'privacy.account_deleted', objectType: 'user', objectId: req.user.id });
  await prisma.$transaction([
    prisma.pitProfile.deleteMany({ where: { userId: req.user.id } }),
    prisma.taxDocument.deleteMany({ where: { ownerUserId: req.user.id, organisationId: null } }),
    prisma.notification.deleteMany({ where: { userId: req.user.id } }),
    prisma.membership.updateMany({ where: { userId: req.user.id }, data: { status: 'REVOKED' } }),
    prisma.user.update({ where: { id: req.user.id }, data: { email: `deleted-${req.user.id}@deleted.invalid`, fullName: 'Deleted user', phone: null, isActive: false, mfaSecret: null, recoveryCodes: [], passwordHash: '!', tokenVersion: { increment: 1 } } }),
  ]);
  res.json({ ok: true, messageEn: 'Your personal data has been deleted. Tax records of organisations are retained as required by law.' });
}));

module.exports = router;
