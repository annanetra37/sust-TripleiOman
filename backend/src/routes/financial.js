'use strict';

const router = require('express').Router();
const prisma = require('../config/prisma');
const { authenticate } = require('../middleware/auth');
const { formatError } = require('../utils/errors');
const { logActivity } = require('../utils/activityLog');
const pcafEngine = require('../services/pcafEngine');

router.use(authenticate);

// ─── Exposure CRUD ──────────────────────────────────────────────────────────

router.post('/exposures', async (req, res) => {
  try {
    const { assetClass, counterpartyName, counterpartyIsin, counterpartyLei, sector, country, outstandingAmount, currency, equityValue, totalBalanceSheet, epc, evic, reportingYear, dataQualityScore } = req.body;
    if (!assetClass || !counterpartyName || !outstandingAmount || !currency || !reportingYear) {
      return res.status(400).json({ error: 'Asset class, counterparty name, outstanding amount, currency, and reporting year are required.' });
    }
    const exposure = await prisma.financialExposure.create({
      data: {
        companyId: req.user.companyId, assetClass, counterpartyName, counterpartyIsin, counterpartyLei,
        sector, country, outstandingAmount: parseFloat(outstandingAmount), currency,
        equityValue: equityValue ? parseFloat(equityValue) : null, totalBalanceSheet: totalBalanceSheet ? parseFloat(totalBalanceSheet) : null,
        epc, evic: evic ? parseFloat(evic) : null, reportingYear: parseInt(reportingYear),
        dataQualityScore: parseInt(dataQualityScore) || 5,
      },
    });
    logActivity(req.user.id, req.user.companyId, 'FE_EXPOSURE_CREATE', `Created exposure: ${counterpartyName} (${assetClass})`, { exposureId: exposure.id }, req.ip);
    res.status(201).json(exposure);
  } catch (err) { const { status, error } = formatError(err); res.status(status).json({ error }); }
});

router.get('/exposures', async (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year) : undefined;
    const where = { companyId: req.user.companyId };
    if (year) where.reportingYear = year;
    const exposures = await prisma.financialExposure.findMany({
      where, orderBy: { outstandingAmount: 'desc' },
      include: { financedEmissions: { orderBy: { calcAt: 'desc' }, take: 1 } },
    });
    res.json(exposures);
  } catch (err) { const { status, error } = formatError(err); res.status(status).json({ error }); }
});

router.get('/exposures/:id', async (req, res) => {
  try {
    const exp = await prisma.financialExposure.findFirst({
      where: { id: req.params.id, companyId: req.user.companyId },
      include: { financedEmissions: { orderBy: { calcAt: 'desc' } } },
    });
    if (!exp) return res.status(404).json({ error: 'Exposure not found.' });
    res.json(exp);
  } catch (err) { const { status, error } = formatError(err); res.status(status).json({ error }); }
});

router.delete('/exposures/:id', async (req, res) => {
  try {
    const exp = await prisma.financialExposure.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!exp) return res.status(404).json({ error: 'Exposure not found.' });
    await prisma.financialExposure.delete({ where: { id: req.params.id } });
    res.json({ message: 'Exposure deleted.' });
  } catch (err) { const { status, error } = formatError(err); res.status(status).json({ error }); }
});

// ─── PCAF Calculation ───────────────────────────────────────────────────────

router.post('/exposures/:id/calculate', async (req, res) => {
  try {
    const exp = await prisma.financialExposure.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!exp) return res.status(404).json({ error: 'Exposure not found.' });
    const counterpartyData = req.body;
    if (!counterpartyData.scope1 && !counterpartyData.scope2) {
      return res.status(400).json({ error: 'Counterparty scope1 and/or scope2 emissions are required.' });
    }
    const result = await pcafEngine.calculateExposure(exp.id, counterpartyData);
    logActivity(req.user.id, req.user.companyId, 'FE_PCAF_CALC', `PCAF calc for ${exp.counterpartyName}: ${result.totalFinanced} tCO2e financed`, { exposureId: exp.id }, req.ip);
    res.json(result);
  } catch (err) { const { status, error } = formatError(err); res.status(status).json({ error }); }
});

// ─── Portfolio Summary ──────────────────────────────────────────────────────

router.get('/portfolio', async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const summary = await pcafEngine.portfolioSummary(req.user.companyId, year);
    res.json(summary);
  } catch (err) { const { status, error } = formatError(err); res.status(status).json({ error }); }
});

module.exports = router;
