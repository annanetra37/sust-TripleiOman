/** Stateless calculators (preview without saving) — CIT, small-enterprise check, excise, stamps. */
const router = require('express').Router();
const rulesSvc = require('../services/rules');
const cit = require('../engines/cit');
const excise = require('../engines/excise');
const { toBaisa } = require('../lib/money');
const { asyncHandler } = require('../lib/errors');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.post('/cit/small-enterprise', asyncHandler(async (req, res) => {
  const { values } = await rulesSvc.all();
  const b = req.body || {};
  res.json(cit.smallEnterpriseCheck({ paidUpCapitalBaisa: toBaisa(b.paidUpCapitalOmr), grossIncomeBaisa: toBaisa(b.grossIncomeOmr), averageEmployees: Number(b.averageEmployees), activity: b.activity, omaniOwnedOrSoleProprietor: !!b.omaniOwnedOrSoleProprietor }, values));
}));

router.post('/excise', asyncHandler(async (req, res) => {
  const { values } = await rulesSvc.all();
  res.json(excise.compute((req.body?.lines || []).map((l) => ({ ...l, unitPriceBaisa: toBaisa(l.unitPriceOmr), referencePriceBaisa: toBaisa(l.referencePriceOmr || 0) })), values));
}));

router.post('/excise/stamps', asyncHandler(async (req, res) => res.json(excise.reconcileStamps(req.body || {}))));

router.get('/excise/categories', asyncHandler(async (req, res) => res.json(await rulesSvc.get('excise.categories'))));

module.exports = router;
