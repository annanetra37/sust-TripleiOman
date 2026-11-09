const router = require('express').Router();
const crypto = require('crypto');
const multer = require('multer');
const prisma = require('../config/prisma');
const audit = require('../services/audit');
const { d } = require('../lib/dates');
const { HttpError, asyncHandler } = require('../lib/errors');
const { authenticate, withOrg, requirePermission } = require('../middleware/auth');

const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'application/xml', 'text/xml', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (req, file, cb) => cb(ALLOWED.includes(file.mimetype) ? null : new HttpError(400, 'Allowed: PDF, images, XML, CSV, Excel, Word.'), ALLOWED.includes(file.mimetype)) });
const CATEGORIES = ['CR_CERTIFICATE', 'TAX_CARD', 'VAT_CERTIFICATE', 'ACKNOWLEDGEMENT', 'PAYMENT_PROOF', 'LETTER', 'RECEIPT', 'FINANCIAL_STATEMENTS', 'RESIDENCY_CERT', 'CUSTOMS_DECLARATION', 'OTHER'];

const META = { id: true, category: true, title: true, filename: true, mimeType: true, sizeBytes: true, sha256: true, expiresAt: true, relatedType: true, relatedId: true, uploadedById: true, createdAt: true };

// Personal vault (PIT receipts) — scoped to the user, no organisation.
router.get('/personal', authenticate, asyncHandler(async (req, res) => {
  res.json(await prisma.taxDocument.findMany({ where: { ownerUserId: req.user.id, organisationId: null }, select: META, orderBy: { createdAt: 'desc' } }));
}));
router.post('/personal', authenticate, upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Choose a file.');
  const doc = await prisma.taxDocument.create({ data: { ownerUserId: req.user.id, category: 'RECEIPT', title: req.body.title || req.file.originalname, filename: req.file.originalname, mimeType: req.file.mimetype, sizeBytes: req.file.size, sha256: crypto.createHash('sha256').update(req.file.buffer).digest('hex'), data: req.file.buffer, relatedType: req.body.relatedType || 'pit', relatedId: req.body.relatedId || null, uploadedById: req.user.id }, select: META });
  res.status(201).json(doc);
}));
router.get('/personal/:id/download', authenticate, asyncHandler(async (req, res) => {
  const doc = await prisma.taxDocument.findFirst({ where: { id: req.params.id, ownerUserId: req.user.id, organisationId: null } });
  if (!doc) throw new HttpError(404, 'Not found');
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.filename)}"`);
  res.send(Buffer.from(doc.data));
}));

router.use(authenticate, withOrg);

router.get('/', asyncHandler(async (req, res) => {
  const where = { organisationId: req.org.id };
  if (req.query.category) where.category = String(req.query.category);
  if (req.query.relatedType) where.relatedType = String(req.query.relatedType);
  if (req.query.relatedId) where.relatedId = String(req.query.relatedId);
  res.json(await prisma.taxDocument.findMany({ where, select: META, orderBy: { createdAt: 'desc' } }));
}));

router.post('/', requirePermission('data.write'), upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Choose a file to upload.');
  const category = CATEGORIES.includes(req.body.category) ? req.body.category : 'OTHER';
  const doc = await prisma.taxDocument.create({ data: {
    organisationId: req.org.id, category, title: req.body.title || req.file.originalname, filename: req.file.originalname, mimeType: req.file.mimetype, sizeBytes: req.file.size,
    sha256: crypto.createHash('sha256').update(req.file.buffer).digest('hex'), data: req.file.buffer, expiresAt: req.body.expiresAt ? d(req.body.expiresAt) : null,
    relatedType: req.body.relatedType || null, relatedId: req.body.relatedId || null, uploadedById: req.user.id,
  }, select: META });
  await audit.record({ req, action: 'document.uploaded', objectType: 'document', objectId: doc.id, details: { category, sha256: doc.sha256, filename: doc.filename } });
  res.status(201).json(doc);
}));

router.get('/:id/download', asyncHandler(async (req, res) => {
  const doc = await prisma.taxDocument.findFirst({ where: { id: req.params.id, organisationId: req.org.id } });
  if (!doc) throw new HttpError(404, 'Document not found');
  audit.recordAsync({ req, action: 'document.downloaded', objectType: 'document', objectId: doc.id });
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.filename)}"`);
  res.send(Buffer.from(doc.data));
}));

router.delete('/:id', requirePermission('org.manage'), asyncHandler(async (req, res) => {
  const doc = await prisma.taxDocument.findFirst({ where: { id: req.params.id, organisationId: req.org.id }, select: META });
  if (!doc) throw new HttpError(404, 'Document not found');
  if (['ACKNOWLEDGEMENT', 'PAYMENT_PROOF', 'FINANCIAL_STATEMENTS'].includes(doc.category)) throw new HttpError(409, 'Tax records must be retained for at least 10 years and cannot be deleted.');
  await prisma.taxDocument.delete({ where: { id: doc.id } });
  await audit.record({ req, action: 'document.deleted', objectType: 'document', objectId: doc.id, before: doc });
  res.json({ ok: true });
}));

module.exports = router;
