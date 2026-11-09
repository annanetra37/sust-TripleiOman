/**
 * ISO-to-GRI / ESRS Bridge — Crosswalk Registry (C2, the core IP)
 *
 * A versioned mapping from ISO clauses / record types to GRI / ESRS / ISSB
 * disclosure codes, plus drafting guidance for each mapping.  Mirrors the
 * structure of standardRegistry.js (STANDARDS-like export).
 *
 * VERSIONING: the registry is versioned by ISO edition.  A certificate's
 * edition selects the mapping set — 14001:2015 and 14001:2026 map
 * differently (the 2026 edition adds climate / biodiversity / resource /
 * life-cycle context requirements).  Certificates with edition "unknown"
 * are served the conservative base (2015) set and the UI prompts the user
 * to confirm the edition.
 *
 * STANDARDS CURRENCY: biodiversity maps to GRI 101: Biodiversity 2024
 * (mandatory since 1 Jan 2026).  GRI 304 is superseded and MUST NOT be
 * referenced anywhere in this registry.
 *
 * GOVERNANCE GATE: the seed content below is the spec §9 table.  It must
 * be reviewed and signed off by the Head of Sustainability before it is
 * used in customer-facing output — the signedOff flag is surfaced through
 * the API so the UI can label output accordingly.
 */

const REGISTRY_META = {
  version: '1.0.0',
  signedOff: false, // pending Sustainability (Varduhi) sign-off — spec §14
  signedOffBy: null,
  updatedAt: '2026-07-15',
};

// Record types the evidence-ingestion pipeline (C3) understands.  Crosswalk
// rows reference these so a mapping can locate its evidence.
const RECORD_TYPES = [
  'certificate',
  'policy',              // environmental / OH&S / energy / anti-bribery policy documents
  'aspectsRegister',      // 14001 6.1.2 aspects & impacts register
  'complianceRegister',   // 14001 6.1.3 compliance obligations register
  'objectives',           // 6.2 objectives & targets
  'monitoring',           // 9.1 monitoring & measurement data
  'mgmtReview',           // 9.3 management review minutes
  'nonconformity',        // 10.2 nonconformity & corrective action log
  'contextAnalysis',      // 4.1 / 4.2 context of the organisation (2026: climate, biodiversity…)
  'ohsSystem',            // 45001 management-system description
  'hazardRisk',           // 45001 6.1.2 hazard identification & risk assessment
  'healthServices',       // 45001 occupational health services documentation
  'workerParticipation',  // 45001 5.4 worker participation & consultation
  'trainingRecords',      // 45001 7.2 OH&S training records
  'contractorControl',    // 45001 8.1.4 contractor / value-chain control
  'incidentRegister',     // 45001 incident register
  'energyReview',         // 50001 6.3–6.5 energy review, baseline, EnPIs
  'ghgInventory',         // 14064-1 verified GHG inventory
  'waterFootprint',       // 14046 water footprint study
  'antiBribery',          // 37001 controls, training, incident records
  'supplierEvaluation',   // 9001 8.4 supplier evaluation & control
];

/**
 * Crosswalk seed (spec §9).
 *
 * Field semantics:
 *  - isoStandard:   ISO standard number as string ('14001', '45001', …)
 *  - editions:      which certificate editions this row applies to.
 *                   ['any'] = applies regardless of edition.
 *                   14001 base rows apply to both 2015 and 2026; rows that
 *                   exist only in the 2026 edition are tagged ['2026'].
 *  - clause:        ISO clause / record reference (human-readable)
 *  - recordType:    which ingested evidence record feeds this mapping
 *  - mapsTo:        target disclosure codes (GRI / ESRS / IFRS / TCFD)
 *  - partialTargets: targets this mapping only partially covers
 *  - contentType:   'narrative' | 'metric' | 'both'
 *  - extractionHint: what to look for in the source document
 *  - draftingGuidance: instructions handed to the drafting engine (C4)
 *  - confidenceDefault: starting confidence before evidence-quality scoring
 */
const CROSSWALK = [
  // ─── ISO 14001 — Environmental management (2015 + 2026) ────────────
  {
    id: '14001-5.2-policy',
    isoStandard: '14001', editions: ['2015', '2026'],
    clause: '5.2', clauseTitle: 'Environmental policy',
    recordType: 'policy',
    mapsTo: ['GRI 2-23', 'ESRS E1-2', 'ESRS E2-1'],
    partialTargets: [],
    contentType: 'narrative',
    extractionHint: 'The signed environmental policy document: commitments to protection of the environment, pollution prevention, compliance obligations, continual improvement; who approved it and when.',
    draftingGuidance: 'Draft a policy-commitment disclosure. State the policy commitments verbatim where possible, who approved the policy and at what level (top management), how it is communicated, and its scope of application. Do not invent commitments not present in the source.',
    confidenceDefault: 0.85,
  },
  {
    id: '14001-6.1.2-aspects',
    isoStandard: '14001', editions: ['2015', '2026'],
    clause: '6.1.2', clauseTitle: 'Aspects & impacts register',
    recordType: 'aspectsRegister',
    mapsTo: ['GRI 3-1', 'GRI 3-2', 'ESRS IRO-1'],
    partialTargets: ['ESRS IRO-1'], // informs the DMA but does not replace it (spec §4.3)
    contentType: 'narrative',
    extractionHint: 'The environmental aspects & impacts register: activities, aspects, impacts, significance scoring method and thresholds, which aspects were rated significant.',
    draftingGuidance: 'Describe the process used to identify environmental aspects and evaluate significance (GRI 3-1) and enumerate the material topics that emerge (GRI 3-2). For ESRS IRO-1, present the register as INPUT to the double-materiality assessment — state explicitly that a full DMA also considers financial materiality and stakeholder input, which the register alone does not cover.',
    confidenceDefault: 0.75,
  },
  {
    id: '14001-6.1.3-compliance',
    isoStandard: '14001', editions: ['2015', '2026'],
    clause: '6.1.3', clauseTitle: 'Compliance obligations register',
    recordType: 'complianceRegister',
    mapsTo: ['GRI 2-27', 'ESRS G1'],
    partialTargets: [],
    contentType: 'both',
    extractionHint: 'Compliance obligations register: applicable legal and other requirements, evaluation of compliance status, any identified non-compliances, fines or sanctions.',
    draftingGuidance: 'Report the process for identifying and evaluating compliance obligations, and any confirmed instances of non-compliance with laws and regulations including fines (GRI 2-27). Quantify incidents and fines where the register contains them; otherwise state that no significant instances were identified in the period covered by the register.',
    confidenceDefault: 0.75,
  },
  {
    id: '14001-6.2-objectives',
    isoStandard: '14001', editions: ['2015', '2026'],
    clause: '6.2', clauseTitle: 'Objectives & targets',
    recordType: 'objectives',
    mapsTo: ['GRI 3-3', 'GRI 305-5', 'ESRS E1-4'],
    partialTargets: [],
    contentType: 'both',
    extractionHint: 'Environmental objectives and targets: what is targeted, baseline, target year, responsible function, progress status, resources assigned.',
    draftingGuidance: 'Describe how the organisation manages its material environmental topics through objectives (GRI 3-3). Where objectives quantify emission reductions, report baseline, target and achieved reduction (GRI 305-5 / ESRS E1-4). Distinguish clearly between committed targets and aspirational objectives.',
    confidenceDefault: 0.75,
  },
  {
    id: '14001-9.1-monitoring',
    isoStandard: '14001', editions: ['2015', '2026'],
    clause: '9.1', clauseTitle: 'Monitoring & measurement',
    recordType: 'monitoring',
    mapsTo: ['GRI 302', 'GRI 303', 'GRI 305', 'GRI 306'],
    partialTargets: [],
    contentType: 'metric',
    extractionHint: 'Monitoring and measurement records: energy consumption, water withdrawal/discharge, emissions measurements, waste quantities by stream and disposal route, measurement methods and frequencies.',
    draftingGuidance: 'Surface the quantitative series as candidate values for the energy (302), water (303), emissions (305) and waste (306) disclosures. Always carry units and measurement method. These values feed the metric layer — flag any figure whose method or boundary is unclear rather than normalising silently.',
    confidenceDefault: 0.7,
  },
  {
    id: '14001-9.3-mgmtreview',
    isoStandard: '14001', editions: ['2015', '2026'],
    clause: '9.3', clauseTitle: 'Management review',
    recordType: 'mgmtReview',
    mapsTo: ['GRI 2-12', 'GRI 2-13', 'GRI 2-14'],
    partialTargets: [],
    contentType: 'narrative',
    extractionHint: 'Management review minutes: who attended (roles), what environmental performance information was reviewed, decisions and actions agreed, frequency of reviews.',
    draftingGuidance: 'Describe the role of top management in overseeing the management of impacts (GRI 2-12), how responsibility is delegated (GRI 2-13), and the review/approval of reported information (GRI 2-14), grounded in the review cadence, attendance and decisions recorded in the minutes.',
    confidenceDefault: 0.7,
  },
  {
    id: '14001-10.2-nonconformity',
    isoStandard: '14001', editions: ['2015', '2026'],
    clause: '10.2', clauseTitle: 'Nonconformity & corrective action',
    recordType: 'nonconformity',
    mapsTo: ['GRI 2-25', 'GRI 2-27'],
    partialTargets: [],
    contentType: 'both',
    extractionHint: 'Nonconformity and corrective-action log: what was found, root cause, corrective action, closure status.',
    draftingGuidance: 'Describe the processes to remediate negative impacts (GRI 2-25) using the corrective-action workflow as evidence. Where nonconformities relate to legal requirements, cross-reference GRI 2-27 counts.',
    confidenceDefault: 0.7,
  },

  // ─── ISO 14001:2026-only rows (transition-relevant) ─────────────────
  {
    id: '14001-2026-climate-context',
    isoStandard: '14001', editions: ['2026'],
    clause: '4.1 / 4.2', clauseTitle: 'Climate context analysis',
    recordType: 'contextAnalysis',
    mapsTo: ['ESRS E1', 'IFRS S2', 'TCFD STR-a'],
    partialTargets: [],
    contentType: 'narrative',
    extractionHint: '2026-edition context analysis: how climate change (physical and transition) is considered among internal/external issues and interested-party needs.',
    draftingGuidance: 'Draft the climate-context narrative: how climate-related risks and opportunities were identified at organisational and site level, over what time horizons, and how they influence the management system scope. Map language to ESRS E1 SBM-3-style risk description without inventing quantified financial effects.',
    confidenceDefault: 0.7,
  },
  {
    id: '14001-2026-biodiversity-context',
    isoStandard: '14001', editions: ['2026'],
    clause: '4.1', clauseTitle: 'Biodiversity & resources in context',
    // GRI 101: Biodiversity 2024 — NOT GRI 304 (superseded; 101 mandatory since 1 Jan 2026)
    recordType: 'contextAnalysis',
    mapsTo: ['ESRS E4', 'GRI 101', 'ESRS E5'],
    partialTargets: [],
    contentType: 'narrative',
    extractionHint: '2026-edition context analysis coverage of biodiversity and resource availability: sites near sensitive areas, dependency on scarce resources.',
    draftingGuidance: 'Draft the biodiversity and resource-availability context: which sites were screened against protected/sensitive areas, what dependencies and impacts were identified, and how resource availability (materials, water) is considered. Target GRI 101: Biodiversity 2024 terminology — never reference the superseded GRI 304.',
    confidenceDefault: 0.65,
  },
  {
    id: '14001-2026-lifecycle',
    isoStandard: '14001', editions: ['2026'],
    clause: '6.1.2', clauseTitle: 'Life-cycle perspective',
    recordType: 'aspectsRegister',
    mapsTo: ['GRI 301', 'ESRS E5'],
    partialTargets: [],
    contentType: 'both',
    extractionHint: 'Life-cycle considerations in the aspects register: upstream/downstream stages considered, product end-of-life, material circularity.',
    draftingGuidance: 'Describe how a life-cycle perspective is applied when determining aspects (which value-chain stages are covered) and surface any material-flow quantities for GRI 301 / ESRS E5 resource inflow-outflow disclosures.',
    confidenceDefault: 0.65,
  },

  // ─── ISO 45001 — Occupational health & safety ───────────────────────
  {
    id: '45001-system',
    isoStandard: '45001', editions: ['any'],
    clause: '4.4', clauseTitle: 'The OH&S management system',
    recordType: 'ohsSystem',
    mapsTo: ['GRI 403-1'],
    partialTargets: [],
    contentType: 'narrative',
    extractionHint: 'Description of the OH&S management system: scope, certification status, workers covered.',
    draftingGuidance: 'State that an OH&S management system has been implemented, whether it is certified to ISO 45001 (cite the certificate), its scope and which workers/sites it covers (GRI 403-1).',
    confidenceDefault: 0.9,
  },
  {
    id: '45001-6.1.2-hazard',
    isoStandard: '45001', editions: ['any'],
    clause: '6.1.2', clauseTitle: 'Hazard identification & risk assessment',
    recordType: 'hazardRisk',
    mapsTo: ['GRI 403-2'],
    partialTargets: [],
    contentType: 'narrative',
    extractionHint: 'Hazard identification methodology, risk assessment matrix/criteria, processes for workers to report hazards and remove themselves from danger.',
    draftingGuidance: 'Describe the hazard-identification and risk-assessment processes, their quality assurance, how workers report hazards, and the protection from reprisals (GRI 403-2). Use the documented methodology; do not generalise beyond it.',
    confidenceDefault: 0.85,
  },
  {
    id: '45001-health-services',
    isoStandard: '45001', editions: ['any'],
    clause: '8.1', clauseTitle: 'Occupational health services',
    recordType: 'healthServices',
    mapsTo: ['GRI 403-3'],
    partialTargets: [],
    contentType: 'narrative',
    extractionHint: 'Occupational health services documentation: functions provided, access arrangements, confidentiality of health data.',
    draftingGuidance: 'Describe the occupational health services functions, how they contribute to hazard elimination, and how worker access and data confidentiality are ensured (GRI 403-3).',
    confidenceDefault: 0.8,
  },
  {
    id: '45001-5.4-participation',
    isoStandard: '45001', editions: ['any'],
    clause: '5.4', clauseTitle: 'Worker participation & consultation',
    recordType: 'workerParticipation',
    mapsTo: ['GRI 403-4'],
    partialTargets: [],
    contentType: 'narrative',
    extractionHint: 'Worker participation and consultation arrangements: OH&S committees, frequency, worker representatives, decision areas consulted on.',
    draftingGuidance: 'Describe the processes for worker participation and consultation in OH&S, including any formal joint committees, their composition, meeting frequency and remit (GRI 403-4).',
    confidenceDefault: 0.85,
  },
  {
    id: '45001-7.2-training',
    isoStandard: '45001', editions: ['any'],
    clause: '7.2', clauseTitle: 'OH&S training records',
    recordType: 'trainingRecords',
    mapsTo: ['GRI 403-5', 'GRI 404-1'],
    partialTargets: ['GRI 404-1'], // OH&S hours only — not total training hours
    contentType: 'both',
    extractionHint: 'OH&S training records: courses delivered, who was trained, hours, generic vs hazard-specific training.',
    draftingGuidance: 'Describe worker OH&S training (GRI 403-5) with course types and coverage. Training hours may PARTIALLY feed GRI 404-1 — label them as OH&S-specific hours, not total training hours.',
    confidenceDefault: 0.8,
  },
  {
    id: '45001-8.1.4-contractors',
    isoStandard: '45001', editions: ['any'],
    clause: '8.1.4', clauseTitle: 'Contractor / value-chain control',
    recordType: 'contractorControl',
    mapsTo: ['GRI 403-8'],
    partialTargets: [],
    contentType: 'narrative',
    extractionHint: 'Procurement/contractor control procedures: how contractor workers are covered by the OH&S system, coordination duties.',
    draftingGuidance: 'State which workers (employees, contractors, others) are covered by the OH&S management system and whether it is internally audited / externally certified (GRI 403-8), using the contractor-control procedures as evidence for coverage claims.',
    confidenceDefault: 0.75,
  },
  {
    id: '45001-incidents',
    isoStandard: '45001', editions: ['any'],
    clause: '10.2', clauseTitle: 'Incident register',
    recordType: 'incidentRegister',
    mapsTo: ['GRI 403-9', 'GRI 403-10', 'ESRS S1-14'],
    partialTargets: [],
    contentType: 'metric',
    extractionHint: 'Incident register rows: date, type (injury / ill health / near miss), severity, lost time, hours worked if available.',
    draftingGuidance: 'Provide the quantitative work-related injury (403-9) and ill-health (403-10) figures: counts by severity, fatalities, lost-time cases, and rates where hours-worked data exists. Carry the register period explicitly.',
    confidenceDefault: 0.85,
  },

  // ─── ISO 50001 — Energy management ──────────────────────────────────
  {
    id: '50001-energy-review',
    isoStandard: '50001', editions: ['any'],
    clause: '6.3–6.5', clauseTitle: 'Energy review, baseline & EnPIs',
    recordType: 'energyReview',
    mapsTo: ['GRI 302-1', 'GRI 302-3', 'GRI 302-4', 'ESRS E1-5'],
    partialTargets: [],
    contentType: 'metric',
    extractionHint: 'Energy review: consumption by source, significant energy uses, baseline year and values, energy performance indicators, improvement actions and savings.',
    draftingGuidance: 'Surface energy consumption within the organisation (302-1), energy intensity (302-3, using the documented EnPI), and reductions achieved (302-4, vs the documented baseline). Keep source units and conversion factors; state the baseline year.',
    confidenceDefault: 0.85,
  },

  // ─── ISO 14064-1 — GHG inventories ─────────────────────────────────
  {
    id: '14064-ghg-inventory',
    isoStandard: '14064-1', editions: ['any'],
    clause: 'Inventory report', clauseTitle: 'Verified GHG inventory',
    recordType: 'ghgInventory',
    mapsTo: ['GRI 305-1', 'GRI 305-2', 'GRI 305-3', 'ESRS E1-6', 'IFRS S2'],
    partialTargets: [],
    contentType: 'metric',
    extractionHint: 'GHG inventory report: Scope 1/2/3 totals by gas, consolidation boundary, base year, verification level (limited/reasonable) and verifier.',
    draftingGuidance: 'Provide the Scope 1, 2 and 3 figures with boundary, methodology and verification status. A verified 14064-1 inventory is the strongest evidence in the crosswalk — cite the verifier and assurance level.',
    confidenceDefault: 0.95,
  },

  // ─── ISO 14046 — Water footprint ────────────────────────────────────
  {
    id: '14046-water',
    isoStandard: '14046', editions: ['any'],
    clause: 'Study report', clauseTitle: 'Water footprint',
    recordType: 'waterFootprint',
    mapsTo: ['GRI 303-3', 'GRI 303-5', 'ESRS E3'],
    partialTargets: [],
    contentType: 'metric',
    extractionHint: 'Water footprint study: withdrawal by source, consumption, water-stressed area assessment.',
    draftingGuidance: 'Provide water withdrawal (303-3) and consumption (303-5) figures with source breakdown and any water-stress context from the study.',
    confidenceDefault: 0.8,
  },

  // ─── ISO 37001 — Anti-bribery ───────────────────────────────────────
  {
    id: '37001-antibribery',
    isoStandard: '37001', editions: ['any'],
    clause: 'ABMS records', clauseTitle: 'Anti-bribery controls, training, incidents',
    recordType: 'antiBribery',
    mapsTo: ['GRI 205-1', 'GRI 205-2', 'GRI 205-3', 'ESRS G1-3'],
    partialTargets: [],
    contentType: 'both',
    extractionHint: 'Anti-bribery management system records: risk assessments, controls, training coverage, reported incidents and outcomes.',
    draftingGuidance: 'Describe operations assessed for corruption risk (205-1), communication and training coverage (205-2), and confirmed incidents with actions taken (205-3 / ESRS G1-3). Quantify training coverage and incident counts from the records.',
    confidenceDefault: 0.8,
  },

  // ─── ISO 9001 — Quality (supplier control only) ─────────────────────
  {
    id: '9001-8.4-suppliers',
    isoStandard: '9001', editions: ['any'],
    clause: '8.4', clauseTitle: 'Supplier evaluation & control',
    recordType: 'supplierEvaluation',
    mapsTo: ['GRI 308-1', 'GRI 414-1'],
    partialTargets: ['GRI 308-1', 'GRI 414-1'], // quality-focused evaluation; env/social criteria usually partial
    contentType: 'narrative',
    extractionHint: 'Supplier evaluation and control procedures: selection criteria, monitoring, re-evaluation cadence.',
    draftingGuidance: 'Describe the supplier evaluation process. Only claim environmental (308-1) or social (414-1) screening to the extent the documented criteria actually include such requirements — 9001 evaluation is quality-centric, so mark this as partial evidence.',
    confidenceDefault: 0.6,
  },
];

// ─── Gap-to-action map (C6) ────────────────────────────────────────────
// Disclosure themes ISO does NOT cover, with the platform action that
// closes each gap.  Matched by disclosure-code prefix.
const GAP_ACTIONS = [
  { match: ['GRI 305-3', 'E1-6'], theme: 'Scope 3 detail', action: 'Upload Scope 3 activity data in E1 — Climate Change, and invite suppliers via the Supplier Scope 3 Portal.', module: 'E1 / Suppliers' },
  { match: ['405-1', 'S1-9'], theme: 'Workforce diversity', action: 'Upload workforce composition and diversity data in S1 — Own Workforce.', module: 'S1' },
  { match: ['405-2'], theme: 'Gender pay gap', action: 'Collect basic salary and remuneration data by gender; upload via S1 — Own Workforce.', module: 'S1' },
  { match: ['2-9', 'GOV'], theme: 'Board composition', action: 'Upload board & leadership data in Governance — Board & Leadership.', module: 'G1' },
  { match: ['G1-4', '205-3', '206-1'], theme: 'Business conduct incidents', action: 'Upload incident and case registers in Governance — Ethics & Compliance.', module: 'G1' },
  { match: ['G1-1'], theme: 'Policy register', action: 'Upload your governance policy inventory in Governance — Ethics & Compliance.', module: 'G1' },
  { match: ['207'], theme: 'Tax', action: 'Tax transparency data is collected during report preparation — add it in the Reports module.', module: 'Reports' },
  { match: ['415'], theme: 'Political contributions', action: 'Record political contributions in Governance — Ethics & Compliance (incident/policy register).', module: 'G1' },
  { match: ['IRO-1', '3-1', '3-2'], theme: 'Double materiality', action: 'Run the materiality workflow — the ISO aspects register is an input, not a substitute, for the DMA.', module: 'Reports' },
];

// ─── Helper functions ─────────────────────────────────────────────────

/** Normalise an edition string ('2015' | '2026' | 'unknown'). */
function normaliseEdition(edition) {
  const e = String(edition || '').trim();
  if (e.includes('2026')) return '2026';
  if (e.includes('2015')) return '2015';
  return 'unknown';
}

/**
 * All crosswalk rows applicable to a certificate of the given standard +
 * edition.  Unknown editions get the conservative base set (2015 rows for
 * 14001; 'any' rows for other standards).
 */
function mappingsFor(isoStandard, isoEdition) {
  const std = String(isoStandard).replace(/^ISO\s*/i, '').trim();
  const edition = normaliseEdition(isoEdition);
  return CROSSWALK.filter((row) => {
    if (row.isoStandard !== std) return false;
    if (row.editions.includes('any')) return true;
    if (edition === 'unknown') return row.editions.includes('2015'); // conservative
    return row.editions.includes(edition);
  });
}

/** All rows for a set of certificates ({isoStandard, isoEdition}[]), deduped by row id. */
function mappingsForCertificates(certificates) {
  const seen = new Map();
  for (const cert of certificates) {
    for (const row of mappingsFor(cert.isoStandard, cert.isoEdition)) {
      if (!seen.has(row.id)) seen.set(row.id, row);
    }
  }
  return [...seen.values()];
}

/**
 * Does a crosswalk target code cover a registry disclosure code?
 * Handles prefix semantics: a crosswalk target 'GRI 302' covers 'GRI 302-1';
 * 'ESRS E1' covers 'E1-5'; exact codes match exactly.
 */
function targetCovers(targetCode, disclosureCode) {
  const t = targetCode.replace(/^GRI\s+/i, '').replace(/^ESRS\s+/i, '').trim();
  const d = disclosureCode.replace(/^GRI\s+/i, '').replace(/^ESRS\s+/i, '').trim();
  if (t === d) return true;
  // Prefix match: '302' covers '302-1'; 'E1' covers 'E1-5' but not 'E12-x'
  return d.startsWith(t + '-') || d.startsWith(t + '.');
}

/**
 * Coverage computation (C5): given held certificates and the platform's
 * STANDARDS registry, classify every required disclosure of the selected
 * standard/topics as populated / partial / not_available from ISO.
 *
 * Pure registry math — no model call (kept free per spec §10).
 */
function computeCoverage(certificates, standardKey, selectedTopics, STANDARDS) {
  const standard = STANDARDS[standardKey];
  if (!standard) throw new Error(`Unknown standard: ${standardKey}`);

  const rows = mappingsForCertificates(certificates);
  const topics = selectedTopics && selectedTopics.length > 0 ? selectedTopics : Object.keys(standard.topics);

  const disclosures = [];
  for (const topicKey of topics) {
    const topic = standard.topics[topicKey];
    if (!topic) continue;
    for (const disc of topic.disclosures) {
      const matching = [];
      for (const row of rows) {
        for (const target of row.mapsTo) {
          if (targetCovers(target, disc.code)) {
            matching.push({ row, target, partial: row.partialTargets.includes(target) });
          }
        }
      }

      let state = 'not_available';
      if (matching.length > 0) {
        const hasFull = matching.some((m) => !m.partial);
        // A metric disclosure served only by narrative evidence (or vice versa) is partial
        const typeCompatible = matching.some((m) =>
          m.row.contentType === 'both' ||
          (disc.type === 'narrative' && m.row.contentType === 'narrative') ||
          (disc.type === 'metric' && m.row.contentType === 'metric'));
        state = hasFull && typeCompatible ? 'populated' : 'partial';
      }

      disclosures.push({
        topic: topicKey,
        code: disc.code,
        name: disc.name,
        type: disc.type,
        state,
        sources: matching.map((m) => ({
          mappingId: m.row.id,
          isoStandard: m.row.isoStandard,
          clause: m.row.clause,
          clauseTitle: m.row.clauseTitle,
          recordType: m.row.recordType,
          partial: m.partial,
        })),
      });
    }
  }

  const populated = disclosures.filter((d) => d.state === 'populated');
  const partial = disclosures.filter((d) => d.state === 'partial');
  const gaps = disclosures
    .filter((d) => d.state === 'not_available')
    .map((d) => ({ ...d, recommendedAction: gapActionFor(d.code) }));

  return {
    registryVersion: REGISTRY_META.version,
    registrySignedOff: REGISTRY_META.signedOff,
    standard: standardKey,
    required: disclosures.length,
    populated: populated.length,
    partial: partial.length,
    notAvailable: gaps.length,
    coveragePct: disclosures.length > 0
      ? Math.round(((populated.length + partial.length * 0.5) / disclosures.length) * 100)
      : 0,
    disclosures,
    gaps,
    framing: 'From ISO management-system documentation you typically hold the evidence behind roughly two-thirds of the qualitative management-approach disclosures; the quantitative layer (Scope 3, workforce diversity, pay equity) still has to be built in the platform.',
  };
}

/** Gap-to-action lookup (C6). */
function gapActionFor(disclosureCode) {
  for (const g of GAP_ACTIONS) {
    if (g.match.some((m) => disclosureCode.includes(m))) {
      return { theme: g.theme, action: g.action, module: g.module };
    }
  }
  return {
    theme: 'Platform data collection',
    action: 'This disclosure has no ISO source. Collect it through the matching platform module (E1 climate, S1 workforce, G1 governance) or draft it in the Reports module.',
    module: 'Platform',
  };
}

// ─── Reverse bridge themes (C7) — ISO 14001:2026 transition ───────────
const REVERSE_THEMES = {
  climate: {
    label: 'Climate change context',
    targetClauses: ['4.1', '4.2', '6.1.2'],
    requiredData: 'Scope 1/2/3 emissions and energy data (E1 module)',
    description: 'Converts platform-held emissions and energy data into 14001:2026 context entries and aspect rows (e.g. physical climate risk at a named site).',
  },
  biodiversity: {
    label: 'Biodiversity context',
    targetClauses: ['4.1', '6.1.2'],
    requiredData: 'Site-vs-protected-area screening (Biodiversity module)',
    description: 'Documents biodiversity consideration in the context analysis — the same work as ESRS E4 / GRI 101: Biodiversity 2024.',
  },
  resource: {
    label: 'Resource availability',
    targetClauses: ['4.1', '6.1.2'],
    requiredData: 'Material-flow / procurement data (PCF module)',
    description: 'Resource-availability aspect rows from material-flow data.',
  },
  lifecycle: {
    label: 'Life-cycle perspective',
    targetClauses: ['6.1.2'],
    requiredData: 'Product carbon footprint calculations (PCF module)',
    description: 'Life-cycle perspective note grounded in cradle-to-gate PCF results.',
  },
};

const NON_CERTIFICATION_DISCLAIMER =
  'This evidence pack supports a transition audit; it does not certify conformity with ISO 14001:2026. ' +
  'Certification decisions are made exclusively by an accredited certification body. ' +
  'All content is DRAFT material for incorporation into the organisation\'s EMS documentation after review.';

module.exports = {
  REGISTRY_META,
  RECORD_TYPES,
  CROSSWALK,
  GAP_ACTIONS,
  REVERSE_THEMES,
  NON_CERTIFICATION_DISCLAIMER,
  normaliseEdition,
  mappingsFor,
  mappingsForCertificates,
  targetCovers,
  computeCoverage,
  gapActionFor,
};
