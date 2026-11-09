'use strict';

const prisma = require('../config/prisma');
const tierFeatures = require('../services/tierFeatures');

// Simple in-process cache so we don't hit Prisma on every request just to
// read the company's tier.  Invalidated by tier-change endpoints via
// invalidateTierCache(companyId).
const cache = new Map();
const TTL_MS = 60 * 1000;

async function getCompanyTier(companyId) {
  const now = Date.now();
  const cached = cache.get(companyId);
  if (cached && cached.expires > now) return cached.tier;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { tier: true },
  });
  const tier = tierFeatures.normaliseTier(company?.tier);
  cache.set(companyId, { tier, expires: now + TTL_MS });
  return tier;
}

function invalidateTierCache(companyId) {
  if (companyId) cache.delete(companyId);
  else cache.clear();
}

// Express middleware — gate a route by a feature key.  Returns 403 with a
// structured payload the frontend uses to render an upsell prompt.
//
//   router.post('/doc-extract', requireFeature('ai_doc_extract'), handler)
//
function requireFeature(featureKey) {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.companyId) {
        return res.status(401).json({ error: 'Authentication required.' });
      }
      const tier = await getCompanyTier(req.user.companyId);
      if (tierFeatures.hasFeature(tier, featureKey)) {
        req.tier = tier;
        return next();
      }
      const needed = tierFeatures.requiredTierFor(featureKey);
      return res.status(403).json({
        error: 'FEATURE_NOT_IN_PLAN',
        message: `This feature requires the ${tierFeatures.getTier(needed).name} plan.`,
        feature: featureKey,
        featureLabel: tierFeatures.FEATURE_LABELS[featureKey] || featureKey,
        currentTier: tier,
        requiredTier: needed,
      });
    } catch (err) {
      console.error('[tier] requireFeature error:', err);
      res.status(500).json({ error: 'Tier check failed.' });
    }
  };
}

// Attach the company's tier to req without blocking.  Handlers that need
// to filter output (e.g. /reports/v2/standards) by tier use this.
async function attachTier(req, _res, next) {
  try {
    if (req.user && req.user.companyId) {
      req.tier = await getCompanyTier(req.user.companyId);
    }
  } catch (err) {
    console.error('[tier] attachTier error:', err.message);
  }
  next();
}

module.exports = {
  requireFeature,
  attachTier,
  getCompanyTier,
  invalidateTierCache,
};
