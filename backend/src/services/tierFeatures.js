'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// tierFeatures.js
// Canonical registry of subscription tiers and the features / limits each
// tier is entitled to.  This is the SINGLE SOURCE OF TRUTH on the backend;
// the frontend ships a read-only mirror in frontend/src/config/tierFeatures.js
// (kept in sync by hand — the shapes match exactly).
//
// Used by:
//   - middleware/tier.js (requireFeature)
//   - routes/credits.js, routes/e1.js, routes/connections.js, etc.
//   - routes/settings.js (/tier-info)
//
// Feature keys must be strings.  Keep them lowercase-snake so they can be
// used as ids in the UI without translation.
// ─────────────────────────────────────────────────────────────────────────────

const TIER_KEYS = ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'];
const DEFAULT_TIER = 'STARTER';

// Features available at each tier.  A feature is "allowed" if it's in the
// tier's feature set.  Higher tiers inherit lower tiers' features via the
// `inheritsFrom` chain when `resolveFeatures()` flattens them.
const TIERS = {
  STARTER: {
    key: 'STARTER',
    name: 'Starter',
    priceMonthly: 349,
    priceAnnual: 3990,
    limits: {
      maxUsers: 2,
      maxOrgUnits: 1,
      monthlyCredits: 150,
    },
    inheritsFrom: null,
    features: {
      dashboards:             true,  // GHG + Social dashboards
      excel_upload:           true,  // Excel / CSV AI ETL
      gri_report:             true,  // GRI standard only
      ai_assistant:           true,  // Chat assistant
      email_support:          true,
    },
  },

  PROFESSIONAL: {
    key: 'PROFESSIONAL',
    name: 'Professional',
    priceMonthly: 890,
    priceAnnual: 8990,
    limits: {
      maxUsers: 8,
      maxOrgUnits: 5,
      monthlyCredits: 600,
    },
    inheritsFrom: 'STARTER',
    features: {
      ai_doc_extract:         true,  // /api/e1/doc-extract (invoice / receipt OCR)
      all_standards:          true,  // ESRS, TCFD, ISSB, SASB, CDP (beyond GRI)
      db_connections:         true,  // /api/connections/*
      audit_lineage:          true,  // /api/lineage/*
      multi_language_reports: true,  // languages other than English
      sustainability_roi:     true,  // /api/roi — Sustainability ROI dashboard
      water_resources:        true,  // /api/water — E3 Water Resources module
      building_energy:        true,  // /api/real-estate — Building Energy page
      priority_support:       true,
    },
  },

  ENTERPRISE: {
    key: 'ENTERPRISE',
    name: 'Enterprise',
    priceMonthly: null,         // custom / contact sales
    priceAnnual: null,
    limits: {
      maxUsers: null,           // unlimited
      maxOrgUnits: null,        // unlimited
      monthlyCredits: null,     // custom
    },
    inheritsFrom: 'PROFESSIONAL',
    features: {
      sso_saml:               true,
      custom_branding:        true,  // logo upload / custom theme
      dedicated_csm:          true,
      sla_guarantee:          true,
      api_access:             true,
      biodiversity:           true,  // /api/biodiversity — E4 Biodiversity module
      iso_gri_bridge:         true,  // ISO → GRI Bridge module
      iso_bridge:             true,  // ISO-to-GRI/ESRS Bridge (crosswalk + drafting) — Enterprise-included, add-on SKU below
    },
  },
};

// Human-readable labels for every feature key — used by the frontend
// FeatureLock component to render "Professional plan: AI document extraction".
const FEATURE_LABELS = {
  dashboards:             'GHG & Social dashboards',
  excel_upload:           'Excel / CSV upload',
  gri_report:             'GRI report generation',
  ai_assistant:           'AI assistant',
  email_support:          'Email support',
  ai_doc_extract:         'AI document extraction',
  all_standards:          'All 6 reporting standards',
  db_connections:         'Database connections',
  audit_lineage:          'Audit trail & lineage',
  multi_language_reports: '7-language reports',
  sustainability_roi:     'Sustainability ROI module',
  priority_support:       'Priority support',
  sso_saml:               'SSO / SAML',
  custom_branding:        'Custom branding',
  dedicated_csm:          'Dedicated CSM',
  sla_guarantee:          'SLA guarantee',
  api_access:             'API access',
  water_resources:        'Water Resources (E3)',
  building_energy:        'Building Energy',
  biodiversity:           'Biodiversity & Ecosystems (E4)',
  iso_gri_bridge:         'ISO → GRI Bridge',
  iso_bridge:             'ISO-to-GRI/ESRS Bridge',
};

// Standards that are allowed per tier.  GRI is universal (Starter gets it);
// all other standards are Professional+.  This drives both the standard
// selector in Reports and the backend gate on /reports/v2/generate.
const STANDARD_TIER = {
  GRI:     'STARTER',
  ESRS:    'PROFESSIONAL',
  TCFD:    'PROFESSIONAL',
  ISSB:    'PROFESSIONAL',
  SASB:    'PROFESSIONAL',
  CDP:     'PROFESSIONAL',
  IFRS:    'PROFESSIONAL',
};

// Languages allowed per tier.  English is universal; the other 6 are
// Professional+.
const LANGUAGE_TIER = {
  en: 'STARTER',
  fr: 'PROFESSIONAL',
  de: 'PROFESSIONAL',
  ar: 'PROFESSIONAL',
  es: 'PROFESSIONAL',
  hy: 'PROFESSIONAL',
  sv: 'PROFESSIONAL',
};

// ─── Public helpers ──────────────────────────────────────────────────────────

function normaliseTier(tier) {
  if (!tier) return DEFAULT_TIER;
  const upper = String(tier).toUpperCase();
  return TIERS[upper] ? upper : DEFAULT_TIER;
}

function getTier(tier) {
  return TIERS[normaliseTier(tier)];
}

// Flattens a tier's own features + every ancestor's features into a single
// object `{ featureKey: true, ... }`.  Used by hasFeature() and tierInfo().
function resolveFeatures(tier) {
  const key = normaliseTier(tier);
  const chain = [];
  let cursor = key;
  while (cursor) {
    chain.unshift(cursor);
    cursor = TIERS[cursor].inheritsFrom;
  }
  const merged = {};
  for (const t of chain) {
    Object.assign(merged, TIERS[t].features);
  }
  return merged;
}

function hasFeature(tier, featureKey) {
  return !!resolveFeatures(tier)[featureKey];
}

// Returns the lowest tier that unlocks `featureKey`, or null if no tier has
// it.  Used by the UI to render "Upgrade to Professional to unlock…".
function requiredTierFor(featureKey) {
  for (const key of TIER_KEYS) {
    if (TIERS[key].features[featureKey]) return key;
  }
  return null;
}

function allowedStandardsFor(tier) {
  const t = normaliseTier(tier);
  return Object.entries(STANDARD_TIER)
    .filter(([, needed]) => tierRank(t) >= tierRank(needed))
    .map(([k]) => k);
}

function allowedLanguagesFor(tier) {
  const t = normaliseTier(tier);
  return Object.entries(LANGUAGE_TIER)
    .filter(([, needed]) => tierRank(t) >= tierRank(needed))
    .map(([k]) => k);
}

function tierRank(tier) {
  return TIER_KEYS.indexOf(normaliseTier(tier));
}

// Returns a serialisable snapshot for the /settings/tier-info endpoint.
function tierInfo(tier) {
  const key = normaliseTier(tier);
  const t = TIERS[key];
  return {
    tier: key,
    name: t.name,
    priceMonthly: t.priceMonthly,
    priceAnnual: t.priceAnnual,
    limits: t.limits,
    features: resolveFeatures(key),
    labels: FEATURE_LABELS,
    allowedStandards: allowedStandardsFor(key),
    allowedLanguages: allowedLanguagesFor(key),
  };
}

module.exports = {
  TIERS,
  TIER_KEYS,
  DEFAULT_TIER,
  FEATURE_LABELS,
  STANDARD_TIER,
  LANGUAGE_TIER,
  normaliseTier,
  getTier,
  resolveFeatures,
  hasFeature,
  requiredTierFor,
  allowedStandardsFor,
  allowedLanguagesFor,
  tierRank,
  tierInfo,
};
