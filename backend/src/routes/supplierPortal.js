'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// supplierPortal.js — Public supplier-facing routes (SUP-01)
//
// NO authentication middleware — every request is validated by the token in
// the URL.  Rate-limited to 10 req/min per token to prevent abuse.
//
//   GET  /api/portal/:token      — return the request shape + buyer branding
//   POST /api/portal/:token      — submit data
// ─────────────────────────────────────────────────────────────────────────────

const router = require('express').Router();
const prisma = require('../config/prisma');
const { formatError } = require('../utils/errors');

// Validate the token — shared middleware for both routes.
async function validateToken(req, res, next) {
  try {
    const { token } = req.params;
    if (!token || token.length < 10) return res.status(400).json({ error: 'Invalid token.' });

    const request = await prisma.supplierDataRequest.findUnique({
      where: { token },
      include: {
        supplier: {
          include: {
            buyerCompany: {
              select: { name: true, logoPath: true, industry: true, country: true },
            },
          },
        },
      },
    });

    if (!request) return res.status(404).json({ error: 'This link is invalid or has already been used.' });
    if (new Date() > request.tokenExpiresAt) {
      return res.status(410).json({ error: 'This link has expired. Please ask your buyer to resend.' });
    }

    req.dataRequest = request;
    next();
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
}

// ─── GET — return the request shape for the supplier form ───────────────────
router.get('/:token', validateToken, async (req, res) => {
  const r = req.dataRequest;

  // Mark as opened if first visit
  if (r.status === 'sent') {
    await prisma.supplierDataRequest.update({ where: { id: r.id }, data: { status: 'opened' } });
  }

  res.json({
    requestId: r.id,
    buyerName: r.supplier.buyerCompany.name,
    buyerLogo: r.supplier.buyerCompany.logoPath,
    buyerIndustry: r.supplier.buyerCompany.industry,
    buyerCountry: r.supplier.buyerCompany.country,
    supplierName: r.supplier.name,
    reportingYear: r.reportingYear,
    scope3Category: r.scope3Category,
    status: r.status,
    alreadySubmitted: r.status === 'submitted' || r.status === 'approved',
    submission: r.status === 'submitted' ? r.submission : null,
    expiresAt: r.tokenExpiresAt,
  });
});

// ─── POST — submit the data ────────────────────────────────────────────────
router.post('/:token', validateToken, async (req, res) => {
  const r = req.dataRequest;

  if (r.status === 'approved') {
    return res.status(400).json({ error: 'This submission has already been approved by the buyer.' });
  }

  const submission = req.body;
  if (!submission || Object.keys(submission).length === 0) {
    return res.status(400).json({ error: 'Submission body is empty.' });
  }

  // Accept either a single object or { items: [...] }
  const items = submission.items || [submission];
  for (const item of items) {
    if (!item.totalEmissions && !item.emissions && !item.quantity) {
      return res.status(400).json({ error: 'Each item must include at least totalEmissions or quantity.' });
    }
  }

  await prisma.supplierDataRequest.update({
    where: { id: r.id },
    data: {
      status: 'submitted',
      submittedAt: new Date(),
      submission,
      dataQuality: 'primary',
    },
  });

  res.json({
    message: 'Thank you! Your data has been submitted. The buyer will review and approve it shortly.',
    status: 'submitted',
  });
});

module.exports = router;
