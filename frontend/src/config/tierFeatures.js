// ─────────────────────────────────────────────────────────────────────────────
// tierFeatures.js  (frontend mirror)
// Read-only mirror of backend/src/services/tierFeatures.js.  Kept in sync by
// hand — the shapes match.
//
// The frontend fetches /api/settings/tier-info on session start and caches
// the authoritative feature map there.  This file is only a fallback /
// helper for pages that need synchronous feature checks before the API
// response arrives (e.g. filtering a list on first render).
// ─────────────────────────────────────────────────────────────────────────────

export const TIER_KEYS = ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'];
export const DEFAULT_TIER = 'STARTER';

export const TIERS = {
  STARTER: {
    key: 'STARTER', name: 'Starter',
    priceMonthly: 349,
    limits: { maxUsers: 2, maxOrgUnits: 1, monthlyCredits: 150 },
    inheritsFrom: null,
    features: { dashboards: true, excel_upload: true, gri_report: true, ai_assistant: true, email_support: true },
  },
  PROFESSIONAL: {
    key: 'PROFESSIONAL', name: 'Professional',
    priceMonthly: 890,
    limits: { maxUsers: 8, maxOrgUnits: 5, monthlyCredits: 600 },
    inheritsFrom: 'STARTER',
    features: {
      ai_doc_extract: true, all_standards: true, db_connections: true,
      audit_lineage: true, multi_language_reports: true, sustainability_roi: true,
      water_resources: true, building_energy: true,
      priority_support: true,
    },
  },
  ENTERPRISE: {
    key: 'ENTERPRISE', name: 'Enterprise',
    priceMonthly: null,
    limits: { maxUsers: null, maxOrgUnits: null, monthlyCredits: null },
    inheritsFrom: 'PROFESSIONAL',
    features: { sso_saml: true, custom_branding: true, dedicated_csm: true, sla_guarantee: true, api_access: true, iso_gri_bridge: true, iso_bridge: true, biodiversity: true },
  },
};

export const FEATURE_LABELS = {
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
  iso_gri_bridge:         'ISO → GRI Bridge',
  iso_bridge:             'ISO-to-GRI/ESRS Bridge',
  water_resources:        'Water Resources (E3)',
  building_energy:        'Building Energy',
  biodiversity:           'Biodiversity & Ecosystems (E4)',
};

export function normaliseTier(tier) {
  if (!tier) return DEFAULT_TIER;
  const upper = String(tier).toUpperCase();
  return TIERS[upper] ? upper : DEFAULT_TIER;
}

export function resolveFeatures(tier) {
  const key = normaliseTier(tier);
  const chain = [];
  let cursor = key;
  while (cursor) {
    chain.unshift(cursor);
    cursor = TIERS[cursor].inheritsFrom;
  }
  const merged = {};
  for (const t of chain) Object.assign(merged, TIERS[t].features);
  return merged;
}

export function hasFeature(tier, featureKey) {
  return !!resolveFeatures(tier)[featureKey];
}

export function requiredTierFor(featureKey) {
  for (const key of TIER_KEYS) {
    if (TIERS[key].features[featureKey]) return key;
  }
  return null;
}

export function tierRank(tier) {
  return TIER_KEYS.indexOf(normaliseTier(tier));
}

export function tierName(tier) {
  return TIERS[normaliseTier(tier)].name;
}
