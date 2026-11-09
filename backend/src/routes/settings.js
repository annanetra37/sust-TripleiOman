const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const prisma = require('../config/prisma');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { formatError } = require('../utils/errors');
const { logActivity } = require('../utils/activityLog');

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});

const jwt = require('jsonwebtoken');
const configApp = require('../config');

// Auth that also accepts ?token= query param (for logo img tags)
async function authWithToken(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return authenticate(req, res, next);
  }
  const token = req.query.token;
  if (token) {
    try {
      const payload = jwt.verify(token, configApp.jwt.secret);
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, email: true, role: true, isActive: true, companyId: true, firstName: true, lastName: true },
      });
      if (!user || !user.isActive) return res.status(401).json({ error: 'Unauthorized' });
      req.user = user;
      return next();
    } catch { return res.status(401).json({ error: 'Invalid token' }); }
  }
  return authenticate(req, res, next);
}

router.use(authWithToken);

// ─── Org Units ──────────────────────────────────────────────

router.get('/org-units', async (req, res) => {
  try {
    const units = await prisma.orgUnit.findMany({
      where: { companyId: req.user.companyId },
      orderBy: { createdAt: 'asc' },
    });
    res.json(units);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.post('/org-units', requireAdmin, async (req, res) => {
  try {
    const { name, country } = req.body;
    if (!name || !country) return res.status(400).json({ error: 'Name and country are required to create an org unit.' });

    const existing = await prisma.orgUnit.findFirst({
      where: { name, companyId: req.user.companyId },
    });
    if (existing) return res.status(409).json({ error: `An org unit named "${name}" already exists.` });

    const unit = await prisma.orgUnit.create({
      data: { name, country, companyId: req.user.companyId },
    });
    res.status(201).json(unit);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.delete('/org-units/:id', requireAdmin, async (req, res) => {
  try {
    // Verify the org unit belongs to this company
    const unit = await prisma.orgUnit.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!unit) return res.status(404).json({ error: 'Org unit not found.' });

    // Delete the org unit — cascade will remove all related data
    await prisma.orgUnit.delete({ where: { id: req.params.id } });

    logActivity(req.user.id, req.user.companyId, 'DELETE_ORG_UNIT', `Deleted org unit "${unit.name}" (${unit.country}) and all associated data`, { orgUnitId: unit.id, name: unit.name }, req.ip);
    res.json({ message: `Org unit "${unit.name}" and all associated data deleted successfully.` });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── ESG Standards ──────────────────────────────────────────

router.get('/esg-standard', async (req, res) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.user.companyId },
      select: { esgStandard: true },
    });
    // Legacy values from when IFRS S1/S2 were separate options
    const standard = ['IFRS_S1', 'IFRS_S2'].includes(company.esgStandard) ? 'IFRS' : company.esgStandard;
    res.json({ standard });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.put('/esg-standard', requireAdmin, async (req, res) => {
  try {
    const { standard } = req.body;
    const valid = ['ESRS', 'TCFD', 'GRI', 'SASB', 'CDP', 'IFRS'];
    if (!valid.includes(standard)) {
      return res.status(400).json({ error: `Invalid standard "${standard}". Supported: ${valid.join(', ')}` });
    }

    await prisma.company.update({ where: { id: req.user.companyId }, data: { esgStandard: standard } });
    res.json({ message: `Reporting standard updated to ${standard}.`, standard });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Data Reset Preview ─────────────────────────────────────

router.post('/reset/preview', requireAdmin, async (req, res) => {
  try {
    const { type, year, quarter, orgUnitId } = req.body;
    if (!year) return res.status(400).json({ error: 'Year is required.' });

    const companyId = req.user.companyId;
    const y = parseInt(year);

    if (type === 's1') {
      const where = { companyId, year: y };
      if (quarter) where.quarter = parseInt(quarter);
      if (orgUnitId) where.orgUnitId = orgUnitId;

      const [comp, div, train, turn, inj] = await Promise.all([
        prisma.fS1WorkforceComposition.count({ where }),
        prisma.fS1WorkforceDiversity.count({ where }),
        prisma.fS1EmployeeTraining.count({ where }),
        prisma.fS1EmployeeTurnover.count({ where }),
        prisma.fS1WorkplaceInjuries.count({ where }),
      ]);

      const total = comp + div + train + turn + inj;

      // Get some sample records
      const samples = await prisma.fS1WorkforceComposition.findMany({
        where,
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { orgUnit: { select: { name: true } } },
      });

      res.json({
        total,
        breakdown: [
          { table: 'Workforce Composition', count: comp },
          { table: 'Workforce Diversity', count: div },
          { table: 'Employee Training', count: train },
          { table: 'Employee Turnover', count: turn },
          { table: 'Workplace Injuries', count: inj },
        ].filter((b) => b.count > 0),
        samples: samples.map((s) => ({
          orgUnit: s.orgUnit?.name,
          year: s.year,
          quarter: s.quarter,
          gender: s.gender,
          contractType: s.contractType,
          count: s.employeeCount,
        })),
      });
    } else if (type === 'g1') {
      const where = { companyId, year: y };
      if (quarter) where.quarter = parseInt(quarter);
      if (orgUnitId) where.orgUnitId = orgUnitId;
      const { quarter: _q, ...policyWhere } = where;

      const [boardCnt, trainCnt, incCnt, polCnt] = await Promise.all([
        prisma.fG1BoardComposition.count({ where }),
        prisma.fG1EthicsTraining.count({ where }),
        prisma.fG1GovernanceIncident.count({ where }),
        prisma.fG1PolicyRegister.count({ where: policyWhere }),
      ]);

      const total = boardCnt + trainCnt + incCnt + polCnt;
      const samples = await prisma.fG1BoardComposition.findMany({
        where,
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { orgUnit: { select: { name: true } } },
      });

      res.json({
        total,
        breakdown: [
          { table: 'Board Composition', count: boardCnt },
          { table: 'Ethics Training', count: trainCnt },
          { table: 'Governance Incidents', count: incCnt },
          { table: 'Policy Register', count: polCnt },
        ].filter((b) => b.count > 0),
        samples: samples.map((s) => ({
          orgUnit: s.orgUnit?.name,
          year: s.year,
          quarter: s.quarter,
          gender: s.gender,
          role: s.role,
          count: s.count,
        })),
      });
    } else {
      const where = { companyId, year: y };

      const [activities, inventory] = await Promise.all([
        prisma.fE1EmissionActivityData.count({ where }),
        prisma.fE1GHGInventory.count({ where }),
      ]);

      const total = activities + inventory;

      // Get sample activity records
      const samples = await prisma.fE1EmissionActivityData.findMany({
        where,
        take: 5,
        orderBy: { createdAt: 'desc' },
      });

      // Aggregate emissions that will be lost
      const emissionSum = await prisma.fE1EmissionActivityData.aggregate({
        where,
        _sum: { totalEmissions: true, quantity: true },
      });

      res.json({
        total,
        breakdown: [
          { table: 'Emission Activity Data', count: activities },
          { table: 'GHG Inventory', count: inventory },
        ].filter((b) => b.count > 0),
        samples: samples.map((s) => ({
          category: s.activityCategory,
          subcategory: s.activitySubcat,
          scope: s.scope,
          quantity: s.quantity,
          unit: s.unit,
          emissions: s.totalEmissions,
        })),
        totalEmissions: emissionSum._sum.totalEmissions || 0,
      });
    }
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Data Reset (actual delete) ─────────────────────────────

router.post('/reset/s1', requireAdmin, async (req, res) => {
  try {
    const { year, quarter, orgUnitId } = req.body;
    if (!year) return res.status(400).json({ error: 'Year is required for data reset.' });

    const where = { companyId: req.user.companyId, year: parseInt(year) };
    if (quarter) where.quarter = parseInt(quarter);
    if (orgUnitId) where.orgUnitId = orgUnitId;

    const [c1, c2, c3, c4, c5] = await Promise.all([
      prisma.fS1WorkforceComposition.deleteMany({ where }),
      prisma.fS1WorkforceDiversity.deleteMany({ where }),
      prisma.fS1EmployeeTraining.deleteMany({ where }),
      prisma.fS1EmployeeTurnover.deleteMany({ where }),
      prisma.fS1WorkplaceInjuries.deleteMany({ where }),
    ]);

    const total = c1.count + c2.count + c3.count + c4.count + c5.count;
    const userName = `${req.user.firstName} ${req.user.lastName}`;

    // Mark related upload history records as deleted (preserve the record)
    const updateResult = await prisma.uploadHistory.updateMany({
      where: {
        companyId: req.user.companyId,
        fileType: 'S1',
        deletedAt: null, // only mark records not already deleted
      },
      data: {
        deletedAt: new Date(),
        deletedBy: userName,
        deletedNote: `${total} records removed for year ${year}${quarter ? ' Q' + quarter : ''}${orgUnitId ? ' (specific org unit)' : ''}.`,
      },
    });
    console.log(`[Reset S1] Marked ${updateResult.count} history records as deleted`);

    logActivity(req.user.id, req.user.companyId, 'RESET_DATA', `Deleted ${total} S1 records for year ${year}`, { type: 's1', year, total }, req.ip);
    res.json({ message: `Successfully deleted ${total} S1 records for year ${year}. ${updateResult.count} history records marked.` });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.post('/reset/g1', requireAdmin, async (req, res) => {
  try {
    const { year, quarter, orgUnitId } = req.body;
    if (!year) return res.status(400).json({ error: 'Year is required for data reset.' });

    const where = { companyId: req.user.companyId, year: parseInt(year) };
    if (quarter) where.quarter = parseInt(quarter);
    if (orgUnitId) where.orgUnitId = orgUnitId;
    // Policy register has no quarter column
    const { quarter: _q, ...policyWhere } = where;

    const [c1, c2, c3, c4] = await Promise.all([
      prisma.fG1BoardComposition.deleteMany({ where }),
      prisma.fG1EthicsTraining.deleteMany({ where }),
      prisma.fG1GovernanceIncident.deleteMany({ where }),
      prisma.fG1PolicyRegister.deleteMany({ where: policyWhere }),
    ]);

    const total = c1.count + c2.count + c3.count + c4.count;
    const userName = `${req.user.firstName} ${req.user.lastName}`;

    const updateResult = await prisma.uploadHistory.updateMany({
      where: { companyId: req.user.companyId, fileType: 'G1', deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userName,
        deletedNote: `${total} records removed for year ${year}${quarter ? ' Q' + quarter : ''}${orgUnitId ? ' (specific org unit)' : ''}.`,
      },
    });
    console.log(`[Reset G1] Marked ${updateResult.count} history records as deleted`);

    logActivity(req.user.id, req.user.companyId, 'RESET_DATA', `Deleted ${total} G1 records for year ${year}`, { type: 'g1', year, total }, req.ip);
    res.json({ message: `Successfully deleted ${total} G1 records for year ${year}. ${updateResult.count} history records marked.` });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.post('/reset/e1', requireAdmin, async (req, res) => {
  try {
    const { year } = req.body;
    if (!year) return res.status(400).json({ error: 'Year is required for data reset.' });

    const where = { companyId: req.user.companyId, year: parseInt(year) };

    const [c1, c2] = await Promise.all([
      prisma.fE1EmissionActivityData.deleteMany({ where }),
      prisma.fE1GHGInventory.deleteMany({ where }),
    ]);

    const total = c1.count + c2.count;
    const userName = `${req.user.firstName} ${req.user.lastName}`;

    // Mark related upload history records as deleted (preserve the record)
    const updateResult = await prisma.uploadHistory.updateMany({
      where: {
        companyId: req.user.companyId,
        fileType: 'E1',
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
        deletedBy: userName,
        deletedNote: `${total} records removed for year ${year}.`,
      },
    });
    console.log(`[Reset E1] Marked ${updateResult.count} history records as deleted`);

    logActivity(req.user.id, req.user.companyId, 'RESET_DATA', `Deleted ${total} E1 records for year ${year}`, { type: 'e1', year, total }, req.ip);
    res.json({ message: `Successfully deleted ${total} E1 records for year ${year}. ${updateResult.count} history records marked.` });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Credit Transactions ────────────────────────────────────

router.get('/credits', async (req, res) => {
  try {
    const { from, to, page, limit } = req.query;

    const where = { companyId: req.user.companyId };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [transactions, total, company] = await Promise.all([
      prisma.creditTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: ((parseInt(page) || 1) - 1) * (parseInt(limit) || 20),
        take: parseInt(limit) || 20,
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
      }),
      prisma.creditTransaction.count({ where }),
      prisma.company.findUnique({ where: { id: req.user.companyId }, select: { creditBalance: true } }),
    ]);

    res.json({ transactions, total, balance: company.creditBalance });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Company Profile ────────────────────────────────────────

router.get('/company', async (req, res) => {
  try {
    const company = await prisma.company.findUnique({ where: { id: req.user.companyId } });
    if (!company) return res.status(404).json({ error: 'Company not found.' });
    res.json(company);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.put('/company', requireAdmin, async (req, res) => {
  try {
    const allowed = ['name', 'country', 'hqLocation', 'industry', 'companySize', 'ownershipType', 'yearEstablished', 'legalStructure', 'regionsOfOp', 'stockExchange', 'tickerSymbol'];
    const data = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        data[key] = key === 'yearEstablished' ? (req.body[key] ? parseInt(req.body[key]) : null) : (req.body[key] || null);
      }
    }

    const company = await prisma.company.update({ where: { id: req.user.companyId }, data });
    res.json(company);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Subscription tier ──────────────────────────────────────
// Returns the current tier, feature map, limits, labels, and the lists of
// standards / languages the company is entitled to.  The frontend calls
// this once per session and caches the response in AuthContext so every
// component can render feature locks without round-trips.
const tierFeatures = require('../services/tierFeatures');
const { invalidateTierCache } = require('../middleware/tier');
const { sendEmail } = require('../utils/email');

// ─── Upgrade request ───────────────────────────────────────────
// Sends a notification to the Triple I sales team when a user clicks
// "Request upgrade" on a feature-locked page.  No Stripe, no self-serve;
// the team reaches out to the customer manually.
router.post('/upgrade-request', async (req, res) => {
  try {
    const { desiredTier, feature, message } = req.body || {};

    const company = await prisma.company.findUnique({
      where: { id: req.user.companyId },
      select: { name: true, tier: true, industry: true, companySize: true, country: true },
    });
    if (!company) return res.status(404).json({ error: 'Company not found.' });

    const user = req.user;
    const tierLabel = desiredTier || 'Professional';

    await sendEmail({
      to: 'info@triplei.io',
      subject: `Upgrade request — ${company.name} → ${tierLabel}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #003700; margin-bottom: 16px;">New Upgrade Request</h2>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #333;">
            <tr><td style="padding: 6px 12px; font-weight: bold; color: #666;">User</td><td style="padding: 6px 12px;">${user.firstName} ${user.lastName} &lt;${user.email}&gt;</td></tr>
            <tr style="background:#f9fafb;"><td style="padding: 6px 12px; font-weight: bold; color: #666;">Company</td><td style="padding: 6px 12px;">${company.name}</td></tr>
            <tr><td style="padding: 6px 12px; font-weight: bold; color: #666;">Industry / Size</td><td style="padding: 6px 12px;">${company.industry} / ${company.companySize}</td></tr>
            <tr style="background:#f9fafb;"><td style="padding: 6px 12px; font-weight: bold; color: #666;">Country</td><td style="padding: 6px 12px;">${company.country}</td></tr>
            <tr><td style="padding: 6px 12px; font-weight: bold; color: #666;">Current tier</td><td style="padding: 6px 12px;">${company.tier}</td></tr>
            <tr style="background:#f9fafb;"><td style="padding: 6px 12px; font-weight: bold; color: #666;">Requested tier</td><td style="padding: 6px 12px;"><strong>${tierLabel}</strong></td></tr>
            ${feature ? `<tr><td style="padding: 6px 12px; font-weight: bold; color: #666;">Feature</td><td style="padding: 6px 12px;">${feature}</td></tr>` : ''}
            ${message ? `<tr style="background:#f9fafb;"><td style="padding: 6px 12px; font-weight: bold; color: #666;">Message</td><td style="padding: 6px 12px;">${message}</td></tr>` : ''}
          </table>
          <p style="color: #999; font-size: 11px; margin-top: 24px; border-top: 1px solid #eee; padding-top: 12px;">Triple I ESG Portal — automated upgrade request notification</p>
        </div>
      `,
    });

    logActivity(req.user.id, req.user.companyId, 'UPGRADE_REQUEST',
      `Requested upgrade to ${tierLabel}${feature ? ` (triggered by ${feature})` : ''}`,
      { desiredTier: tierLabel, feature, message }, req.ip,
    );

    res.json({ message: 'Your upgrade request has been sent. Our team will be in touch shortly.' });
  } catch (err) {
    console.error('[settings] upgrade-request error:', err);
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.get('/tier-info', async (req, res) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.user.companyId },
      select: { tier: true, creditBalance: true },
    });
    if (!company) return res.status(404).json({ error: 'Company not found.' });
    res.json({
      ...tierFeatures.tierInfo(company.tier),
      creditBalance: company.creditBalance,
    });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// Admin-only tier setter — used for testing & manual upgrades.  No Stripe
// wiring; real pricing would call this from a billing webhook.
router.put('/tier', requireAdmin, async (req, res) => {
  try {
    const { tier } = req.body || {};
    if (!tier || !tierFeatures.TIERS[tierFeatures.normaliseTier(tier)]) {
      return res.status(400).json({ error: `Unknown tier. Valid: ${tierFeatures.TIER_KEYS.join(', ')}` });
    }
    const normalised = tierFeatures.normaliseTier(tier);
    const company = await prisma.company.update({
      where: { id: req.user.companyId },
      data: { tier: normalised },
    });
    invalidateTierCache(req.user.companyId);
    logActivity(req.user.id, req.user.companyId, 'TIER_CHANGE', `Tier changed to ${normalised}`, { tier: normalised }, req.ip);
    res.json({
      ...tierFeatures.tierInfo(company.tier),
      creditBalance: company.creditBalance,
    });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Company Logo ───────────────────────────────────────────

router.post('/logo', requireAdmin, logoUpload.single('logo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image file provided. Supported: PNG, JPG, WebP (max 5MB).' });

    const uploadsDir = path.join(__dirname, '../../uploads');
    const logoDir = path.join(uploadsDir, req.user.companyId);
    if (!fs.existsSync(logoDir)) fs.mkdirSync(logoDir, { recursive: true });

    const ext = path.extname(req.file.originalname) || '.png';
    const logoFile = `company_logo${ext}`;
    const logoPath = path.join(logoDir, logoFile);
    fs.writeFileSync(logoPath, req.file.buffer);

    const relativePath = `${req.user.companyId}/${logoFile}`;
    await prisma.company.update({ where: { id: req.user.companyId }, data: { logoPath: relativePath } });

    res.json({ message: 'Logo uploaded successfully.', logoPath: relativePath });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.get('/logo', async (req, res) => {
  try {
    const company = await prisma.company.findUnique({ where: { id: req.user.companyId }, select: { logoPath: true } });
    if (!company?.logoPath) return res.status(404).json({ error: 'No logo uploaded.' });

    const uploadsDir = path.join(__dirname, '../../uploads');
    const filePath = path.join(uploadsDir, company.logoPath);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Logo file not found.' });

    const ext = path.extname(filePath).toLowerCase();
    const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
    res.setHeader('Content-Type', mimeMap[ext] || 'image/png');
    res.setHeader('Content-Disposition', 'inline');
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.delete('/logo', requireAdmin, async (req, res) => {
  try {
    const company = await prisma.company.findUnique({ where: { id: req.user.companyId }, select: { logoPath: true } });
    if (company?.logoPath) {
      const uploadsDir = path.join(__dirname, '../../uploads');
      const filePath = path.join(uploadsDir, company.logoPath);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await prisma.company.update({ where: { id: req.user.companyId }, data: { logoPath: null } });
    res.json({ message: 'Logo removed.' });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

module.exports = router;
