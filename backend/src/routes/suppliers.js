'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// suppliers.js — Buyer-side supplier management (SUP-01)
//
//   POST   /api/suppliers                     — add a supplier
//   GET    /api/suppliers                     — list with response rates
//   GET    /api/suppliers/:id                 — detail + requests
//   DELETE /api/suppliers/:id                 — remove supplier
//   POST   /api/suppliers/:id/request         — send a data request (email + token)
//   POST   /api/suppliers/:id/approve/:reqId  — approve a submission → ingest into Scope 3
// ─────────────────────────────────────────────────────────────────────────────

const router = require('express').Router();
const crypto = require('crypto');
const prisma = require('../config/prisma');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { formatError } = require('../utils/errors');
const { logActivity } = require('../utils/activityLog');
const { sendEmail } = require('../utils/email');

router.use(authenticate);

// ─── CRUD ───────────────────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  try {
    const { name, contactEmail, country, annualSpendUsd, category } = req.body;
    if (!name || !contactEmail || !country) {
      return res.status(400).json({ error: 'Name, email, and country are required.' });
    }

    const supplier = await prisma.supplier.create({
      data: {
        buyerCompanyId: req.user.companyId,
        name,
        contactEmail: contactEmail.toLowerCase(),
        country,
        annualSpendUsd: annualSpendUsd ? parseFloat(annualSpendUsd) : null,
        category: category || null,
      },
    });

    logActivity(req.user.id, req.user.companyId, 'SUPPLIER_ADD',
      `Added supplier ${name} (${contactEmail})`, { supplierId: supplier.id }, req.ip);
    res.status(201).json(supplier);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'A supplier with this email already exists.' });
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.get('/', async (req, res) => {
  try {
    const suppliers = await prisma.supplier.findMany({
      where: { buyerCompanyId: req.user.companyId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { requests: true } },
        requests: { select: { status: true } },
      },
    });

    res.json(suppliers.map((s) => {
      const total = s.requests.length;
      const submitted = s.requests.filter((r) => ['submitted', 'approved'].includes(r.status)).length;
      return {
        id: s.id,
        name: s.name,
        contactEmail: s.contactEmail,
        country: s.country,
        annualSpendUsd: s.annualSpendUsd,
        category: s.category,
        riskScore: s.riskScore,
        requestCount: total,
        responseRate: total > 0 ? Math.round((submitted / total) * 100) : null,
        createdAt: s.createdAt,
      };
    }));
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const supplier = await prisma.supplier.findFirst({
      where: { id: req.params.id, buyerCompanyId: req.user.companyId },
      include: { requests: { orderBy: { sentAt: 'desc' } } },
    });
    if (!supplier) return res.status(404).json({ error: 'Supplier not found.' });
    res.json(supplier);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const supplier = await prisma.supplier.findFirst({ where: { id: req.params.id, buyerCompanyId: req.user.companyId } });
    if (!supplier) return res.status(404).json({ error: 'Supplier not found.' });
    await prisma.supplier.delete({ where: { id: req.params.id } });
    logActivity(req.user.id, req.user.companyId, 'SUPPLIER_DELETE',
      `Deleted supplier ${supplier.name}`, { supplierId: supplier.id }, req.ip);
    res.json({ message: 'Supplier deleted.' });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Send data request ──────────────────────────────────────────────────────
// Creates a SupplierDataRequest with a 48-byte random token, dispatches an
// email, and returns the request.  The supplier opens /portal/:token — see
// supplierPortal.js for the public-facing route.

router.post('/:id/request', async (req, res) => {
  try {
    const supplier = await prisma.supplier.findFirst({
      where: { id: req.params.id, buyerCompanyId: req.user.companyId },
    });
    if (!supplier) return res.status(404).json({ error: 'Supplier not found.' });

    const { reportingYear, scope3Category } = req.body;
    if (!reportingYear) return res.status(400).json({ error: 'reportingYear is required.' });

    const token = crypto.randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const request = await prisma.supplierDataRequest.create({
      data: {
        supplierId: supplier.id,
        reportingYear: parseInt(reportingYear),
        scope3Category: scope3Category || 'cat1_purchased_goods',
        token,
        tokenExpiresAt: expiresAt,
      },
    });

    // Send email
    const company = await prisma.company.findUnique({ where: { id: req.user.companyId }, select: { name: true, logoPath: true } });
    const portalUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/portal/${token}`;

    try {
      await sendEmail({
        to: supplier.contactEmail,
        subject: `${company.name} requests your sustainability data — Triple I ESG`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #003700; margin-bottom: 16px;">Sustainability Data Request</h2>
            <p style="color: #333; font-size: 15px;">
              <strong>${company.name}</strong> is requesting emissions and sustainability data
              from <strong>${supplier.name}</strong> for the year <strong>${reportingYear}</strong>.
            </p>
            <p style="color: #666; font-size: 14px;">
              This takes about 10 minutes. You don't need an account — just click the button
              below to open the secure submission form.
            </p>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${portalUrl}" style="background: #003700; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 15px;">
                Submit Data
              </a>
            </div>
            <p style="color: #999; font-size: 12px;">This link expires on ${expiresAt.toLocaleDateString()}.</p>
            <p style="color: #999; font-size: 11px; margin-top: 24px; border-top: 1px solid #eee; padding-top: 12px;">
              Triple I ESG Portal — Powered by triplei.io
            </p>
          </div>
        `,
      });
    } catch (emailErr) {
      console.warn('[suppliers] Email send failed:', emailErr.message);
    }

    logActivity(req.user.id, req.user.companyId, 'SUPPLIER_REQUEST',
      `Sent data request to ${supplier.name} (${supplier.contactEmail}) for ${reportingYear}`,
      { supplierId: supplier.id, requestId: request.id }, req.ip);

    res.status(201).json({ ...request, portalUrl });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Approve submission → ingest into Scope 3 (SUP-02) ─────────────────────
// When the buyer approves, the submission's emissions data is written into
// the existing FE1EmissionActivityData table with primaryDataFlag context
// (the submission came from the actual supplier, not an industry average).

router.post('/:id/approve/:reqId', requireAdmin, async (req, res) => {
  try {
    const request = await prisma.supplierDataRequest.findUnique({
      where: { id: req.params.reqId },
      include: { supplier: true },
    });
    if (!request || request.supplier.buyerCompanyId !== req.user.companyId) {
      return res.status(404).json({ error: 'Request not found.' });
    }
    if (request.status === 'approved') {
      return res.status(400).json({ error: 'Already approved.' });
    }
    if (!request.submission) {
      return res.status(400).json({ error: 'No submission to approve — the supplier hasn\'t submitted yet.' });
    }

    // Parse the submission and create emission records
    const sub = request.submission;
    const items = sub.items || [sub]; // support both array and single-item
    let inserted = 0;

    const orgUnits = await prisma.orgUnit.findMany({ where: { companyId: req.user.companyId }, take: 1 });
    const defaultOrgUnitId = orgUnits[0]?.id;
    if (!defaultOrgUnitId) {
      return res.status(400).json({ error: 'No org unit found. Create one first.' });
    }

    for (const item of items) {
      await prisma.fE1EmissionActivityData.create({
        data: {
          companyId: req.user.companyId,
          orgUnitId: defaultOrgUnitId,
          year: request.reportingYear,
          activityCategory: item.activityCategory || 'Purchased Goods & Services',
          activitySubcat: item.subType || request.supplier.name,
          calcMethod: 'consumption',
          quantity: parseFloat(item.quantity) || 0,
          unit: item.unit || 'tCO2e',
          emissionFactor: parseFloat(item.emissionFactor) || 0,
          totalEmissions: parseFloat(item.totalEmissions || item.emissions) || 0,
          scope: 'Scope 3',
          currency: item.currency || null,
          amount: parseFloat(item.amount) || null,
          sourceDoc: `Supplier: ${request.supplier.name}`,
        },
      });
      inserted++;
    }

    // Mark approved
    await prisma.supplierDataRequest.update({
      where: { id: request.id },
      data: { status: 'approved', approvedAt: new Date(), dataQuality: 'primary' },
    });

    logActivity(req.user.id, req.user.companyId, 'SUPPLIER_APPROVE',
      `Approved ${request.supplier.name} submission for ${request.reportingYear}: ${inserted} record(s) ingested as Scope 3 primary data`,
      { requestId: request.id, supplierId: request.supplierId, inserted }, req.ip);

    res.json({ message: `Approved. ${inserted} record(s) ingested into Scope 3 as primary data.`, inserted });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

module.exports = router;
