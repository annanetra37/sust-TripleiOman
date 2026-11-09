/**
 * ISO Platform Connector Infrastructure (Sprint 2)
 *
 * Adapter-pattern connectors that normalise data from third-party ISO
 * management platforms into the common IsoDataIngestion shape:
 *
 *   [{ isoStandard, isoClause, dataDescription, dataValue, year }]
 *
 * Supported platforms: Intelex, Sphera, Cority, Enablon, Generic.
 *
 * For v1 the Intelex / Sphera / Cority / Enablon connectors are
 * **simulated** — they validate the config, return representative data
 * structures and log what would happen.  The adapter pattern makes it
 * trivial to swap in real HTTP calls later.
 *
 * Exports: { connectPlatform, fetchPlatformData, PLATFORMS }
 */

// ─── Platform Registry ────────────────────────────────────────────

const PLATFORMS = [
  {
    key: 'intelex',
    name: 'Intelex',
    description: 'Environmental monitoring + incident management',
    isoStandards: ['ISO_14001', 'ISO_45001'],
    logo: null,
  },
  {
    key: 'sphera',
    name: 'Sphera',
    description: 'EHS & sustainability data management',
    isoStandards: ['ISO_14001', 'ISO_45001', 'ISO_50001'],
    logo: null,
  },
  {
    key: 'cority',
    name: 'Cority',
    description: 'EHS, quality, and sustainability',
    isoStandards: ['ISO_14001', 'ISO_45001', 'ISO_9001'],
    logo: null,
  },
  {
    key: 'enablon',
    name: 'Enablon (Wolters Kluwer)',
    description: 'EHS, operational risk, sustainability',
    isoStandards: ['ISO_14001', 'ISO_45001', 'ISO_50001', 'ISO_14064'],
    logo: null,
  },
  {
    key: 'generic',
    name: 'Generic / Manual',
    description: 'Upload any ISO data via Excel/CSV or JSON',
    isoStandards: ['ISO_14001', 'ISO_45001', 'ISO_9001', 'ISO_50001', 'ISO_14064', 'ISO_27001'],
    logo: null,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────

function validateConfig(config, requiredFields) {
  if (!config || typeof config !== 'object') {
    return { valid: false, error: 'Config object is required' };
  }
  for (const field of requiredFields) {
    if (!config[field] || typeof config[field] !== 'string' || config[field].trim() === '') {
      return { valid: false, error: `Missing or empty required config field: ${field}` };
    }
  }
  return { valid: true };
}

function platformExists(key) {
  return PLATFORMS.some((p) => p.key === key);
}

// ─── Intelex Connector ───────────────────────────────────────────

function connectIntelex(config) {
  const check = validateConfig(config, ['apiUrl', 'apiKey']);
  if (!check.valid) return { success: false, error: check.error };

  console.log(`[isoConnectors] Intelex connection test → ${config.apiUrl}`);
  return {
    success: true,
    platform: 'intelex',
    message: 'Intelex connection validated (simulated)',
    endpoints: [
      '/api/v2/environmental-monitoring',
      '/api/v2/incidents',
      '/api/v2/audit-findings',
    ],
  };
}

function fetchIntelexData(config, year) {
  const check = validateConfig(config, ['apiUrl', 'apiKey']);
  if (!check.valid) return { success: false, error: check.error, data: [] };

  console.log(`[isoConnectors] Intelex fetch for year ${year} → ${config.apiUrl}`);

  // Simulated data mapping common Intelex environmental monitoring
  // + incident endpoint response shapes to ISO clauses.
  const data = [
    // ISO 14001 — Environmental Management
    { isoStandard: 'ISO_14001', isoClause: '6.1.2', dataDescription: 'Environmental aspects register (air emissions, water discharge, waste)', dataValue: 'Intelex Environmental Monitoring module — aspect/impact register', year },
    { isoStandard: 'ISO_14001', isoClause: '6.1.3', dataDescription: 'Legal compliance obligations tracking', dataValue: 'Intelex Compliance Tasks — regulatory calendar', year },
    { isoStandard: 'ISO_14001', isoClause: '8.1', dataDescription: 'Operational controls for environmental impacts', dataValue: 'Intelex Operational Controls — monitoring readings', year },
    { isoStandard: 'ISO_14001', isoClause: '9.1.1', dataDescription: 'Environmental performance monitoring data', dataValue: 'Intelex KPI Dashboard — monthly readings', year },
    { isoStandard: 'ISO_14001', isoClause: '9.1.2', dataDescription: 'Compliance evaluation records', dataValue: 'Intelex Compliance Evaluation reports', year },
    { isoStandard: 'ISO_14001', isoClause: '10.2', dataDescription: 'Environmental nonconformity & corrective actions', dataValue: 'Intelex CAPA module — environmental CAPAs', year },

    // ISO 45001 — Occupational Health & Safety
    { isoStandard: 'ISO_45001', isoClause: '6.1.2', dataDescription: 'Hazard identification and risk assessment', dataValue: 'Intelex Risk Assessment module — HIRA records', year },
    { isoStandard: 'ISO_45001', isoClause: '6.1.2.1', dataDescription: 'Incident records and near-miss reports', dataValue: 'Intelex Incident Management — incident log', year },
    { isoStandard: 'ISO_45001', isoClause: '8.1.1', dataDescription: 'OH&S operational controls', dataValue: 'Intelex Safety Controls — inspection checklists', year },
    { isoStandard: 'ISO_45001', isoClause: '9.1.2', dataDescription: 'Legal compliance evaluation for OH&S', dataValue: 'Intelex OH&S Compliance module', year },
    { isoStandard: 'ISO_45001', isoClause: '10.2', dataDescription: 'OH&S incident investigation and corrective actions', dataValue: 'Intelex CAPA module — safety CAPAs', year },
  ];

  return {
    success: true,
    platform: 'intelex',
    year,
    recordCount: data.length,
    note: 'Simulated — actual integration would call Intelex REST API v2',
    data,
  };
}

// ─── Sphera Connector ─────────────────────────────────────────────

function connectSphera(config) {
  const check = validateConfig(config, ['apiUrl', 'apiKey']);
  if (!check.valid) return { success: false, error: check.error };

  console.log(`[isoConnectors] Sphera connection test → ${config.apiUrl}`);
  return {
    success: true,
    platform: 'sphera',
    message: 'Sphera connection validated (simulated)',
    endpoints: [
      '/api/ehs/incidents',
      '/api/ehs/risk-assessments',
      '/api/sustainability/energy',
      '/api/sustainability/emissions',
    ],
  };
}

function fetchSpheraData(config, year) {
  const check = validateConfig(config, ['apiUrl', 'apiKey']);
  if (!check.valid) return { success: false, error: check.error, data: [] };

  console.log(`[isoConnectors] Sphera fetch for year ${year} → ${config.apiUrl}`);

  const data = [
    // ISO 14001 — Environmental
    { isoStandard: 'ISO_14001', isoClause: '6.1.2', dataDescription: 'Environmental aspects and impacts', dataValue: 'Sphera EHS — aspect/impact database', year },
    { isoStandard: 'ISO_14001', isoClause: '8.1', dataDescription: 'Operational environmental controls', dataValue: 'Sphera Process Safety — control records', year },
    { isoStandard: 'ISO_14001', isoClause: '9.1.1', dataDescription: 'Emissions and waste monitoring', dataValue: 'Sphera Sustainability — emissions tracker', year },

    // ISO 45001 — OH&S
    { isoStandard: 'ISO_45001', isoClause: '6.1.2', dataDescription: 'Hazard identification and risk assessment', dataValue: 'Sphera Risk Assessment module', year },
    { isoStandard: 'ISO_45001', isoClause: '6.1.2.1', dataDescription: 'Incident and near-miss data', dataValue: 'Sphera Incident Management module', year },
    { isoStandard: 'ISO_45001', isoClause: '8.1.1', dataDescription: 'Safety operational controls', dataValue: 'Sphera EHS — safety inspections', year },
    { isoStandard: 'ISO_45001', isoClause: '10.2', dataDescription: 'Corrective actions for OH&S', dataValue: 'Sphera CAPA — safety CAPAs', year },

    // ISO 50001 — Energy Management
    { isoStandard: 'ISO_50001', isoClause: '4.4', dataDescription: 'Energy planning data', dataValue: 'Sphera Energy module — baseline planning', year },
    { isoStandard: 'ISO_50001', isoClause: '6.3', dataDescription: 'Energy review and performance baseline', dataValue: 'Sphera Energy module — energy review', year },
    { isoStandard: 'ISO_50001', isoClause: '8.1', dataDescription: 'Energy consumption monitoring', dataValue: 'Sphera Energy module — consumption tracker', year },
    { isoStandard: 'ISO_50001', isoClause: '9.1', dataDescription: 'Energy performance indicators', dataValue: 'Sphera Energy module — EnPI dashboard', year },
  ];

  return {
    success: true,
    platform: 'sphera',
    year,
    recordCount: data.length,
    note: 'Simulated — actual integration would call Sphera Cloud API',
    data,
  };
}

// ─── Cority Connector ─────────────────────────────────────────────

function connectCority(config) {
  const check = validateConfig(config, ['apiUrl', 'apiKey']);
  if (!check.valid) return { success: false, error: check.error };

  console.log(`[isoConnectors] Cority connection test → ${config.apiUrl}`);
  return {
    success: true,
    platform: 'cority',
    message: 'Cority connection validated (simulated)',
    endpoints: [
      '/api/v1/ehs/incidents',
      '/api/v1/ehs/audits',
      '/api/v1/quality/nonconformances',
      '/api/v1/sustainability/metrics',
    ],
  };
}

function fetchCorityData(config, year) {
  const check = validateConfig(config, ['apiUrl', 'apiKey']);
  if (!check.valid) return { success: false, error: check.error, data: [] };

  console.log(`[isoConnectors] Cority fetch for year ${year} → ${config.apiUrl}`);

  const data = [
    // ISO 14001 — Environmental
    { isoStandard: 'ISO_14001', isoClause: '6.1.2', dataDescription: 'Environmental aspects register', dataValue: 'Cority Environmental module — aspects database', year },
    { isoStandard: 'ISO_14001', isoClause: '9.1.1', dataDescription: 'Environmental performance data', dataValue: 'Cority Sustainability Metrics — env KPIs', year },
    { isoStandard: 'ISO_14001', isoClause: '9.2', dataDescription: 'Internal audit findings (environmental)', dataValue: 'Cority Audit module — environmental audits', year },

    // ISO 45001 — OH&S
    { isoStandard: 'ISO_45001', isoClause: '6.1.2', dataDescription: 'Hazard and risk assessment', dataValue: 'Cority Safety module — hazard register', year },
    { isoStandard: 'ISO_45001', isoClause: '6.1.2.1', dataDescription: 'Incident investigation records', dataValue: 'Cority Incident module — investigation reports', year },
    { isoStandard: 'ISO_45001', isoClause: '9.1.2', dataDescription: 'Legal compliance for OH&S', dataValue: 'Cority Compliance module — OH&S legal register', year },
    { isoStandard: 'ISO_45001', isoClause: '10.2', dataDescription: 'Corrective actions for safety', dataValue: 'Cority CAPA module — safety corrective actions', year },

    // ISO 9001 — Quality Management
    { isoStandard: 'ISO_9001', isoClause: '8.5.2', dataDescription: 'Nonconformance and corrective actions', dataValue: 'Cority Quality module — NCR register', year },
    { isoStandard: 'ISO_9001', isoClause: '9.1.3', dataDescription: 'Quality performance analysis', dataValue: 'Cority Quality module — performance analysis', year },
    { isoStandard: 'ISO_9001', isoClause: '9.2', dataDescription: 'Internal audit programme', dataValue: 'Cority Audit module — quality audits', year },
    { isoStandard: 'ISO_9001', isoClause: '10.2', dataDescription: 'Nonconformity and corrective action process', dataValue: 'Cority CAPA module — quality CAPAs', year },
  ];

  return {
    success: true,
    platform: 'cority',
    year,
    recordCount: data.length,
    note: 'Simulated — actual integration would call Cority REST API v1',
    data,
  };
}

// ─── Enablon Connector ────────────────────────────────────────────

function connectEnablon(config) {
  const check = validateConfig(config, ['apiUrl', 'apiKey']);
  if (!check.valid) return { success: false, error: check.error };

  console.log(`[isoConnectors] Enablon connection test → ${config.apiUrl}`);
  return {
    success: true,
    platform: 'enablon',
    message: 'Enablon connection validated (simulated)',
    endpoints: [
      '/api/ehs/incidents',
      '/api/ehs/risk',
      '/api/sustainability/ghg',
      '/api/sustainability/energy',
    ],
  };
}

function fetchEnablonData(config, year) {
  const check = validateConfig(config, ['apiUrl', 'apiKey']);
  if (!check.valid) return { success: false, error: check.error, data: [] };

  console.log(`[isoConnectors] Enablon fetch for year ${year} → ${config.apiUrl}`);

  const data = [
    // ISO 14001
    { isoStandard: 'ISO_14001', isoClause: '6.1.2', dataDescription: 'Environmental aspects & impacts', dataValue: 'Enablon EHS — aspect register', year },
    { isoStandard: 'ISO_14001', isoClause: '9.1.1', dataDescription: 'Environmental monitoring data', dataValue: 'Enablon Sustainability — env metrics', year },

    // ISO 45001
    { isoStandard: 'ISO_45001', isoClause: '6.1.2', dataDescription: 'Operational risk assessment', dataValue: 'Enablon Risk module — risk register', year },
    { isoStandard: 'ISO_45001', isoClause: '6.1.2.1', dataDescription: 'Incident and near-miss log', dataValue: 'Enablon Incident module — event log', year },

    // ISO 50001 — Energy
    { isoStandard: 'ISO_50001', isoClause: '6.3', dataDescription: 'Energy review and baseline', dataValue: 'Enablon Energy module — baseline data', year },
    { isoStandard: 'ISO_50001', isoClause: '8.1', dataDescription: 'Energy consumption tracking', dataValue: 'Enablon Energy module — consumption', year },

    // ISO 14064 — GHG
    { isoStandard: 'ISO_14064', isoClause: '5.2', dataDescription: 'GHG emissions quantification', dataValue: 'Enablon GHG module — emissions inventory', year },
    { isoStandard: 'ISO_14064', isoClause: '5.3', dataDescription: 'GHG removals and storage', dataValue: 'Enablon GHG module — removals tracker', year },
    { isoStandard: 'ISO_14064', isoClause: '7.3', dataDescription: 'GHG data quality management', dataValue: 'Enablon GHG module — data QA', year },
  ];

  return {
    success: true,
    platform: 'enablon',
    year,
    recordCount: data.length,
    note: 'Simulated — actual integration would call Enablon (Wolters Kluwer) API',
    data,
  };
}

// ─── Generic Connector ────────────────────────────────────────────

function connectGeneric(config) {
  // Generic connector only requires that *some* config is provided,
  // or it can run with no config at all (manual upload).
  console.log('[isoConnectors] Generic connector — always available');
  return {
    success: true,
    platform: 'generic',
    message: 'Generic connector ready — accepts JSON, Excel, or CSV payloads',
  };
}

function fetchGenericData(config, year) {
  // The generic connector expects the caller to pass an array of records
  // inside config.payload with { standard, clause, description, value, year } fields.
  if (!config || !Array.isArray(config.payload)) {
    return {
      success: false,
      error: 'Generic connector requires config.payload to be an array of { standard, clause, description, value, year }',
      data: [],
    };
  }

  const data = config.payload
    .filter((row) => row.standard && row.clause)
    .map((row) => ({
      isoStandard: String(row.standard).replace(/\s+/g, '_').toUpperCase(),
      isoClause: String(row.clause).trim(),
      dataDescription: row.description || null,
      dataValue: row.value || null,
      year: parseInt(row.year) || year,
    }));

  console.log(`[isoConnectors] Generic fetch — ${data.length} records normalised`);

  return {
    success: true,
    platform: 'generic',
    year,
    recordCount: data.length,
    data,
  };
}

// ─── Connector Registry (private) ─────────────────────────────────

const CONNECTORS = {
  intelex: { connect: connectIntelex, fetch: fetchIntelexData },
  sphera:  { connect: connectSphera,  fetch: fetchSpheraData },
  cority:  { connect: connectCority,  fetch: fetchCorityData },
  enablon: { connect: connectEnablon, fetch: fetchEnablonData },
  generic: { connect: connectGeneric, fetch: fetchGenericData },
};

// ─── Public API ───────────────────────────────────────────────────

/**
 * Test a platform connection.
 *
 * @param {string} platformKey — one of PLATFORMS[].key
 * @param {object} config      — { apiUrl, apiKey, ... } (platform-dependent)
 * @returns {{ success: boolean, ... }}
 */
function connectPlatform(platformKey, config) {
  if (!platformKey || !CONNECTORS[platformKey]) {
    return {
      success: false,
      error: `Unknown platform: "${platformKey}". Available: ${PLATFORMS.map((p) => p.key).join(', ')}`,
    };
  }

  try {
    return CONNECTORS[platformKey].connect(config);
  } catch (err) {
    console.error(`[isoConnectors] connectPlatform(${platformKey}) error:`, err);
    return { success: false, error: `Connection failed: ${err.message}` };
  }
}

/**
 * Fetch normalised ISO data from a connected platform.
 *
 * @param {string} platformKey — one of PLATFORMS[].key
 * @param {object} config      — platform credentials / settings
 * @param {number} year        — reporting year
 * @returns {{ success: boolean, data: Array<{ isoStandard, isoClause, dataDescription, dataValue, year }>, ... }}
 */
function fetchPlatformData(platformKey, config, year) {
  if (!platformKey || !CONNECTORS[platformKey]) {
    return {
      success: false,
      error: `Unknown platform: "${platformKey}". Available: ${PLATFORMS.map((p) => p.key).join(', ')}`,
      data: [],
    };
  }

  const resolvedYear = parseInt(year) || new Date().getFullYear();

  try {
    return CONNECTORS[platformKey].fetch(config, resolvedYear);
  } catch (err) {
    console.error(`[isoConnectors] fetchPlatformData(${platformKey}) error:`, err);
    return { success: false, error: `Fetch failed: ${err.message}`, data: [] };
  }
}

module.exports = { connectPlatform, fetchPlatformData, PLATFORMS };
