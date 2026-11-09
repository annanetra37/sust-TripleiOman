const router = require('express').Router();
const jwt = require('jsonwebtoken');
const config = require('../config');
const prisma = require('../config/prisma');
const { authenticate } = require('../middleware/auth');
const { paginate } = require('../utils/helpers');
const { formatError } = require('../utils/errors');
const { getFilePath } = require('../utils/fileStore');
const path = require('path');
const fs = require('fs');

// Auth middleware that also accepts ?token= query parameter (for file downloads in new tabs)
async function authenticateWithToken(req, res, next) {
  // Try standard Bearer auth first
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return authenticate(req, res, next);
  }
  // Fall back to query parameter token
  const token = req.query.token;
  if (token) {
    try {
      const payload = jwt.verify(token, config.jwt.secret);
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, email: true, role: true, isActive: true, companyId: true, firstName: true, lastName: true },
      });
      if (!user || !user.isActive) {
        return res.status(401).json({ error: 'Account inactive or not found' });
      }
      req.user = user;
      return next();
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }
  return res.status(401).json({ error: 'Authentication required' });
}

router.use(authenticateWithToken);

// List upload history
router.get('/', async (req, res) => {
  try {
    const { fileType, status, search, page, limit } = req.query;
    const { skip, take } = paginate(page, limit);

    const where = { companyId: req.user.companyId };
    if (fileType) where.fileType = fileType;
    if (status) {
      if (status === 'DELETED') {
        where.deletedAt = { not: null };
      } else {
        where.status = status;
        // Don't filter out deleted records when viewing all
      }
    }
    if (search) where.fileName = { contains: search, mode: 'insensitive' };

    const [records, total] = await Promise.all([
      prisma.uploadHistory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
      }),
      prisma.uploadHistory.count({ where }),
    ]);

    res.json({ records, total, page: Math.floor(skip / take) + 1, totalPages: Math.ceil(total / take) });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// Get detail for a single upload — traceability view
router.get('/:id', async (req, res) => {
  try {
    const record = await prisma.uploadHistory.findFirst({
      where: { id: req.params.id, companyId: req.user.companyId },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    });
    if (!record) return res.status(404).json({ error: 'Upload not found.' });

    // Fetch the actual data records created by this upload
    let transformedData = [];
    let creditTxn = null;

    // Get related emission activity data (by matching sourceDoc or time window)
    if (record.fileType === 'E1') {
      transformedData = await prisma.fE1EmissionActivityData.findMany({
        where: {
          companyId: req.user.companyId,
          createdAt: {
            gte: record.createdAt,
            lte: record.completedAt || new Date(),
          },
        },
        orderBy: { createdAt: 'asc' },
        take: 500,
      });
    } else if (record.fileType === 'S1') {
      // Combine all S1 data types
      const [comp, div, train, turn, inj] = await Promise.all([
        prisma.fS1WorkforceComposition.findMany({ where: { companyId: req.user.companyId, createdAt: { gte: record.createdAt, lte: record.completedAt || new Date() } }, take: 200 }),
        prisma.fS1WorkforceDiversity.findMany({ where: { companyId: req.user.companyId, createdAt: { gte: record.createdAt, lte: record.completedAt || new Date() } }, take: 200 }),
        prisma.fS1EmployeeTraining.findMany({ where: { companyId: req.user.companyId, createdAt: { gte: record.createdAt, lte: record.completedAt || new Date() } }, take: 200 }),
        prisma.fS1EmployeeTurnover.findMany({ where: { companyId: req.user.companyId, createdAt: { gte: record.createdAt, lte: record.completedAt || new Date() } }, take: 200 }),
        prisma.fS1WorkplaceInjuries.findMany({ where: { companyId: req.user.companyId, createdAt: { gte: record.createdAt, lte: record.completedAt || new Date() } }, take: 200 }),
      ]);
      transformedData = [
        ...comp.map((r) => ({ ...r, _table: 'Workforce Composition' })),
        ...div.map((r) => ({ ...r, _table: 'Workforce Diversity' })),
        ...train.map((r) => ({ ...r, _table: 'Employee Training' })),
        ...turn.map((r) => ({ ...r, _table: 'Employee Turnover' })),
        ...inj.map((r) => ({ ...r, _table: 'Workplace Injuries' })),
      ];
    }

    // Get credit transaction
    creditTxn = await prisma.creditTransaction.findFirst({
      where: { relatedFileId: record.id, companyId: req.user.companyId },
    });

    // Resolve org unit name
    let orgUnitName = record.orgUnit;
    if (record.orgUnit && record.orgUnit.match(/^[0-9a-f-]{36}$/i)) {
      const unit = await prisma.orgUnit.findUnique({ where: { id: record.orgUnit } });
      if (unit) orgUnitName = `${unit.name} (${unit.country})`;
    }

    res.json({
      upload: { ...record, orgUnit: orgUnitName },
      transformedData,
      creditTransaction: creditTxn,
      recordCount: transformedData.length,
    });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// Get available years (only years that have data)
router.get('/meta/years', async (req, res) => {
  try {
    const { companyId } = req.user;

    // Get distinct years from all data tables
    const [e1Years, s1CompYears, s1TrainYears, s1TurnYears, g1BoardYears, g1IncYears] = await Promise.all([
      prisma.fE1EmissionActivityData.findMany({ where: { companyId }, select: { year: true }, distinct: ['year'] }),
      prisma.fS1WorkforceComposition.findMany({ where: { companyId }, select: { year: true }, distinct: ['year'] }),
      prisma.fS1EmployeeTraining.findMany({ where: { companyId }, select: { year: true }, distinct: ['year'] }),
      prisma.fS1EmployeeTurnover.findMany({ where: { companyId }, select: { year: true }, distinct: ['year'] }),
      prisma.fG1BoardComposition.findMany({ where: { companyId }, select: { year: true }, distinct: ['year'] }),
      prisma.fG1GovernanceIncident.findMany({ where: { companyId }, select: { year: true }, distinct: ['year'] }),
    ]);

    const allYears = [...new Set([
      ...e1Years.map((r) => r.year),
      ...s1CompYears.map((r) => r.year),
      ...s1TrainYears.map((r) => r.year),
      ...s1TurnYears.map((r) => r.year),
      ...g1BoardYears.map((r) => r.year),
      ...g1IncYears.map((r) => r.year),
    ])].sort((a, b) => b - a);

    // If no data yet, return current year as default
    if (allYears.length === 0) allYears.push(new Date().getFullYear());

    res.json(allYears);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// Parse stored file path entry — supports both "path" and "name::path" formats
function parseFileEntry(entry) {
  if (entry.includes('::')) {
    const [name, storedPath] = entry.split('::');
    return { name, storedPath };
  }
  return { name: null, storedPath: entry };
}

// Download original file(s)
router.get('/:id/download/:fileIndex?', async (req, res) => {
  try {
    const record = await prisma.uploadHistory.findFirst({
      where: { id: req.params.id, companyId: req.user.companyId },
    });
    if (!record) return res.status(404).json({ error: 'Upload not found.' });
    if (!record.storedFilePath) return res.status(404).json({ error: 'Original file not available for this upload.' });

    const entries = record.storedFilePath.split('||');
    const idx = parseInt(req.params.fileIndex) || 0;
    if (idx >= entries.length) return res.status(404).json({ error: 'File index out of range.' });

    const { name, storedPath } = parseFileEntry(entries[idx]);
    const filePath = getFilePath(storedPath);

    if (!fs.existsSync(filePath)) {
      console.error('[Download] File not found:', filePath);
      return res.status(404).json({ error: 'File no longer exists on server.', path: storedPath });
    }

    const ext = path.extname(filePath);
    const downloadName = name || (entries.length > 1 ? `${record.fileName}_${idx + 1}${ext}` : `${record.fileName}${ext}`);

    // Determine MIME type
    const mimeMap = {
      '.pdf': 'application/pdf', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.xls': 'application/vnd.ms-excel', '.csv': 'text/csv',
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    };
    const mime = mimeMap[ext.toLowerCase()] || record.storedFileMime || 'application/octet-stream';

    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    res.setHeader('Content-Type', mime);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('[Download] Error:', err);
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// Serve original file for inline viewing (PDF/images)
router.get('/:id/view/:fileIndex?', async (req, res) => {
  try {
    const record = await prisma.uploadHistory.findFirst({
      where: { id: req.params.id, companyId: req.user.companyId },
    });
    if (!record || !record.storedFilePath) return res.status(404).json({ error: 'File not available.' });

    const entries = record.storedFilePath.split('||');
    const idx = parseInt(req.params.fileIndex) || 0;
    if (idx >= entries.length) return res.status(404).json({ error: 'File not found.' });

    const { storedPath } = parseFileEntry(entries[idx]);
    const filePath = getFilePath(storedPath);

    if (!fs.existsSync(filePath)) {
      console.error('[View] File not found:', filePath);
      return res.status(404).json({ error: 'File no longer exists.' });
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeMap = {
      '.pdf': 'application/pdf', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.xls': 'application/vnd.ms-excel', '.csv': 'text/csv',
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    };

    res.setHeader('Content-Type', mimeMap[ext] || record.storedFileMime || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline');
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('[View] Error:', err);
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// Update audit status (Admin only)
router.patch('/:id/audit', async (req, res) => {
  try {
    const { auditStatus, auditNote } = req.body;
    const validStatuses = ['pending', 'verified', 'flagged', 'rejected'];
    if (!validStatuses.includes(auditStatus)) {
      return res.status(400).json({ error: `Audit status must be: ${validStatuses.join(', ')}` });
    }

    const record = await prisma.uploadHistory.findFirst({
      where: { id: req.params.id, companyId: req.user.companyId },
    });
    if (!record) return res.status(404).json({ error: 'Upload not found.' });

    await prisma.uploadHistory.update({
      where: { id: req.params.id },
      data: {
        auditStatus,
        auditNote: auditNote || null,
        auditedBy: `${req.user.firstName} ${req.user.lastName}`,
        auditedAt: new Date(),
      },
    });

    res.json({ message: `Audit status updated to "${auditStatus}".` });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

module.exports = router;
