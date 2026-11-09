/**
 * ISO → GRI Mapping Rule Seeder
 *
 * Hardcoded mapping data extracted from
 * /tmp/iso_materials/ISO_to_GRI_Mapping_Matrix_v1.xlsx (v1.0, 2026-05-18).
 *
 * Usage:
 *   node src/services/isoGriSeeder.js          # CLI — seeds the DB
 *   const { seedMappingRules } = require(...)   # programmatic
 */

const prisma = require('../config/prisma');

// ─── Canonical mapping rules (85 rows from 8 ISO standard sheets) ───

const MAPPING_RULES = [
  // ── ISO 14001 (Environmental Management) ──────────────────────
  { isoStandard: 'ISO_14001', isoClause: '6.1.2', isoDataCaptured: 'Environmental aspects register (significant aspects determination, methodology, results)', griCode: 'GRI 3-1, 3-2, 3-3', coverageLevel: 'PARTIAL', notes: 'Provides impact materiality input but lacks financial materiality dimension and stakeholder engagement breadth required for full CSRD double materiality.', tripleIModule: 'Materiality Module' },
  { isoStandard: 'ISO_14001', isoClause: '6.1.3', isoDataCaptured: 'Compliance obligations register (applicable environmental laws, permits, conditions)', griCode: 'GRI 2-27', coverageLevel: 'FULL', notes: 'Direct feed — list of legal requirements and compliance status. Cross-reference with environmental fines/sanctions if any.', tripleIModule: 'Compliance Module' },
  { isoStandard: 'ISO_14001', isoClause: '6.1.4', isoDataCaptured: 'Environmental risk register and planned actions', griCode: 'GRI 2-25, 201-2', coverageLevel: 'PARTIAL', notes: 'Operational environmental risks captured; climate-specific transition and physical risks (TCFD) require separate scenario analysis.', tripleIModule: 'Risk Module' },
  { isoStandard: 'ISO_14001', isoClause: '6.2 / 9.1.1', isoDataCaptured: 'Energy objectives and monitoring (consumption by source, by site)', griCode: 'GRI 302-1', coverageLevel: 'FULL', notes: 'Fuel and electricity consumption typically captured by source and by site. Need to confirm renewable vs non-renewable split for full disclosure.', tripleIModule: 'Energy Module' },
  { isoStandard: 'ISO_14001', isoClause: '9.1.1', isoDataCaptured: 'Energy intensity calculations against operational denominator', griCode: 'GRI 302-3', coverageLevel: 'FULL', notes: 'Most ISO 14001 systems track intensity ratios; may need to convert organization-defined denominator to GRI-aligned denominator.', tripleIModule: 'Energy Module' },
  { isoStandard: 'ISO_14001', isoClause: '6.2 / 10.3', isoDataCaptured: 'Energy reduction initiatives and achieved results', griCode: 'GRI 302-4', coverageLevel: 'FULL', notes: 'Continuous improvement actions tracked under ISO 14001 directly evidence reductions.', tripleIModule: 'Energy Module' },
  { isoStandard: 'ISO_14001', isoClause: '9.1.1', isoDataCaptured: 'Water withdrawal by source (municipal, groundwater, surface, third-party)', griCode: 'GRI 303-3', coverageLevel: 'FULL', notes: 'Generally complete for operational sites. Water-stress assessment using WRI Aqueduct typically not part of ISO 14001 unless added.', tripleIModule: 'Water Module' },
  { isoStandard: 'ISO_14001', isoClause: '9.1.1', isoDataCaptured: 'Water discharge by destination and quality', griCode: 'GRI 303-4', coverageLevel: 'PARTIAL', notes: 'Quantity usually captured; quality parameters (substances of concern) often only for permitted discharges.', tripleIModule: 'Water Module' },
  { isoStandard: 'ISO_14001', isoClause: '9.1.1', isoDataCaptured: 'Water consumption (withdrawal minus discharge)', griCode: 'GRI 303-5', coverageLevel: 'FULL', notes: 'Derivable from withdrawal and discharge data.', tripleIModule: 'Water Module' },
  { isoStandard: 'ISO_14001', isoClause: '9.1.1', isoDataCaptured: 'Direct GHG sources monitoring (combustion, refrigerants, process)', griCode: 'GRI 305-1 (Scope 1)', coverageLevel: 'PARTIAL', notes: 'Activity data typically present; GHG Protocol-aligned calculation methodology and AR6 GWP application require platform processing.', tripleIModule: 'GHG Module' },
  { isoStandard: 'ISO_14001', isoClause: '9.1.1', isoDataCaptured: 'Purchased electricity, heat, steam consumption', griCode: 'GRI 305-2 (Scope 2)', coverageLevel: 'PARTIAL', notes: 'Activity data present. Market-based vs location-based dual reporting (GHG Protocol Scope 2 Guidance) usually NOT in ISO 14001 by default.', tripleIModule: 'GHG Module' },
  { isoStandard: 'ISO_14001', isoClause: '9.1.1', isoDataCaptured: 'Air emissions monitoring (NOx, SOx, VOCs, particulates) — permitted discharges', griCode: 'GRI 305-7', coverageLevel: 'FULL', notes: 'Strong fit when site has permitted air emissions; sites without permits may not track.', tripleIModule: 'Emissions Module' },
  { isoStandard: 'ISO_14001', isoClause: '9.1.1', isoDataCaptured: 'Waste generation by stream and classification (hazardous / non-hazardous)', griCode: 'GRI 306-3', coverageLevel: 'FULL', notes: 'Mandatory under most jurisdictions; well-structured data.', tripleIModule: 'Waste Module' },
  { isoStandard: 'ISO_14001', isoClause: '9.1.1', isoDataCaptured: 'Waste diverted from disposal (recycling, reuse, recovery)', griCode: 'GRI 306-4', coverageLevel: 'FULL', notes: 'Tracked via waste contractor manifests.', tripleIModule: 'Waste Module' },
  { isoStandard: 'ISO_14001', isoClause: '9.1.1', isoDataCaptured: 'Waste directed to disposal (landfill, incineration without recovery)', griCode: 'GRI 306-5', coverageLevel: 'FULL', notes: 'Tracked via waste contractor manifests.', tripleIModule: 'Waste Module' },
  { isoStandard: 'ISO_14001', isoClause: '8.1', isoDataCaptured: 'Materials used by weight or volume (input materials)', griCode: 'GRI 301-1', coverageLevel: 'PARTIAL', notes: 'Captured for major inputs; recycled vs virgin content split often gap.', tripleIModule: 'Materials Module' },
  { isoStandard: 'ISO_14001', isoClause: '8.2 / Incidents', isoDataCaptured: 'Significant spills register', griCode: 'GRI 306-3 (legacy 2016)', coverageLevel: 'FULL', notes: 'Incident logs directly feed.', tripleIModule: 'EHS Module' },
  { isoStandard: 'ISO_14001', isoClause: '6.1.2', isoDataCaptured: 'Sites in or adjacent to protected/sensitive areas (aspects context)', griCode: 'GRI 101-5', coverageLevel: 'PARTIAL', notes: 'Site location and proximity often noted; biodiversity impact assessment typically not formal under ISO 14001. Targets GRI 101: Biodiversity 2024 (supersedes GRI 304).', tripleIModule: 'Biodiversity Module' },
  { isoStandard: 'ISO_14001', isoClause: '5.1 / 5.3', isoDataCaptured: 'Top management commitment, roles and responsibilities', griCode: 'GRI 2-12, 2-13', coverageLevel: 'PARTIAL', notes: 'Demonstrates EMS oversight; broader board-level governance per GRI 2 requires additional disclosure.', tripleIModule: 'Governance Module' },
  { isoStandard: 'ISO_14001', isoClause: '9.2 / 9.3', isoDataCaptured: 'Internal audit and management review records', griCode: 'GRI 2-14', coverageLevel: 'SUPPORTING', notes: 'Evidence of governance oversight cadence and topics reviewed; supports board-level disclosures.', tripleIModule: 'Governance Module' },
  { isoStandard: 'ISO_14001', isoClause: '7.4', isoDataCaptured: 'Internal and external communication procedures', griCode: 'GRI 2-29', coverageLevel: 'SUPPORTING', notes: 'Provides framework but stakeholder engagement under GRI requires broader mapping (employees, communities, investors, etc.).', tripleIModule: 'Stakeholder Module' },
  { isoStandard: 'ISO_14001', isoClause: '10.2', isoDataCaptured: 'Nonconformity and corrective action records', griCode: 'GRI 2-25', coverageLevel: 'FULL', notes: 'Direct feed for processes to remediate negative impacts.', tripleIModule: 'Compliance Module' },

  // ── ISO 45001 (Occupational Health & Safety) ──────────────────
  { isoStandard: 'ISO_45001', isoClause: '6.1.2', isoDataCaptured: 'Hazard identification register', griCode: 'GRI 403-2', coverageLevel: 'FULL', notes: 'Direct feed. Process for hazard identification typically well-documented.', tripleIModule: 'EHS Module' },
  { isoStandard: 'ISO_45001', isoClause: '6.1.2', isoDataCaptured: 'Risk assessment of OH&S risks (likelihood, severity, controls)', griCode: 'GRI 403-2', coverageLevel: 'FULL', notes: 'Methodology and results directly feed.', tripleIModule: 'EHS Module' },
  { isoStandard: 'ISO_45001', isoClause: '5.4', isoDataCaptured: 'Worker consultation and participation procedures', griCode: 'GRI 403-4', coverageLevel: 'FULL', notes: 'Health & safety committees, consultation cadence, scope — directly maps.', tripleIModule: 'EHS Module' },
  { isoStandard: 'ISO_45001', isoClause: '9.1.1 / 10.2', isoDataCaptured: 'Incident investigation records (work-related injuries and ill health)', griCode: 'GRI 403-9, 403-10', coverageLevel: 'FULL', notes: 'Categorization (recordable, lost-time, fatal) and rate calculation typically present. Confirm denominator basis (200k hours vs 1M hours).', tripleIModule: 'EHS Module' },
  { isoStandard: 'ISO_45001', isoClause: '9.1.1', isoDataCaptured: 'Near-miss reporting', griCode: 'Voluntary disclosure', coverageLevel: 'SUPPORTING', notes: 'Not required by GRI but strong leading indicator for ESG investor narratives.', tripleIModule: 'EHS Module' },
  { isoStandard: 'ISO_45001', isoClause: '9.1.1', isoDataCaptured: 'Work-related ill health cases (occupational disease)', griCode: 'GRI 403-10', coverageLevel: 'FULL', notes: 'Mandatory under ISO 45001 — direct feed.', tripleIModule: 'EHS Module' },
  { isoStandard: 'ISO_45001', isoClause: '7.3', isoDataCaptured: 'Worker access to occupational health services', griCode: 'GRI 403-3', coverageLevel: 'FULL', notes: 'Documented under ISO 45001.', tripleIModule: 'EHS Module' },
  { isoStandard: 'ISO_45001', isoClause: '7.2', isoDataCaptured: 'OH&S training (mandatory and role-specific)', griCode: 'GRI 403-5', coverageLevel: 'FULL', notes: 'Training matrix and completion records directly feed.', tripleIModule: 'Training Module' },
  { isoStandard: 'ISO_45001', isoClause: '8.1.3', isoDataCaptured: 'Worker health promotion programs (beyond regulated minimum)', griCode: 'GRI 403-6', coverageLevel: 'FULL', notes: 'Wellness programs documented under ISO 45001 management programmes.', tripleIModule: 'EHS Module' },
  { isoStandard: 'ISO_45001', isoClause: '8.2', isoDataCaptured: 'Emergency preparedness and response procedures', griCode: 'GRI 403-7', coverageLevel: 'FULL', notes: 'Direct mapping.', tripleIModule: 'EHS Module' },
  { isoStandard: 'ISO_45001', isoClause: '8.1.4', isoDataCaptured: 'Contractor and visitor OH&S management', griCode: 'GRI 403-8', coverageLevel: 'FULL', notes: 'ISO 45001 covers workers not directly employed but under organizational control; aligns with GRI 403-8 scope.', tripleIModule: 'EHS Module' },
  { isoStandard: 'ISO_45001', isoClause: '5.1', isoDataCaptured: 'Top management responsibility for OH&S', griCode: 'GRI 403-1, 2-13', coverageLevel: 'FULL', notes: 'Direct evidence of OH&S management system oversight.', tripleIModule: 'Governance Module' },
  { isoStandard: 'ISO_45001', isoClause: '9.3', isoDataCaptured: 'Management review of OH&S performance', griCode: 'GRI 403-1, 2-14', coverageLevel: 'FULL', notes: 'Cadence and content of management reviews directly evidence GRI 2 governance disclosures.', tripleIModule: 'Governance Module' },
  { isoStandard: 'ISO_45001', isoClause: '7.2', isoDataCaptured: 'Training records (broader than safety — competence)', griCode: 'GRI 404-1', coverageLevel: 'PARTIAL', notes: 'Hours and topic-level training captured; average hours by category usually requires aggregation in platform.', tripleIModule: 'Training Module' },
  { isoStandard: 'ISO_45001', isoClause: '7.5 / Incidents', isoDataCaptured: 'Workforce demographic data captured via incident reporting', griCode: 'GRI 405-1 (workforce)', coverageLevel: 'SUPPORTING', notes: 'Incident data often includes role/site but not full diversity demographics required by GRI 405-1.', tripleIModule: 'HR Module' },

  // ── ISO 9001 (Quality Management) ─────────────────────────────
  { isoStandard: 'ISO_9001', isoClause: '8.3', isoDataCaptured: 'Design and development controls including safety considerations', griCode: 'GRI 416-1', coverageLevel: 'PARTIAL', notes: 'Provides evidence of product H&S impact assessment in design phase; coverage % of product/service categories may require aggregation.', tripleIModule: 'Product Module' },
  { isoStandard: 'ISO_9001', isoClause: '8.5.5 / 10.2', isoDataCaptured: 'Product nonconformity and recall records', griCode: 'GRI 416-2', coverageLevel: 'FULL', notes: 'Direct feed for incidents of non-compliance concerning product H&S.', tripleIModule: 'Product Module' },
  { isoStandard: 'ISO_9001', isoClause: '8.5.1', isoDataCaptured: 'Product labelling and information provided to customers', griCode: 'GRI 417-1, 417-2', coverageLevel: 'FULL', notes: 'Quality management system covers labelling controls.', tripleIModule: 'Product Module' },
  { isoStandard: 'ISO_9001', isoClause: '9.1.2', isoDataCaptured: 'Customer satisfaction monitoring (surveys, complaints, NPS)', griCode: 'GRI 2-29 (customer dimension)', coverageLevel: 'SUPPORTING', notes: 'Provides one stakeholder group; GRI 2-29 requires broader stakeholder mapping (employees, investors, communities, regulators, suppliers).', tripleIModule: 'Stakeholder Module' },
  { isoStandard: 'ISO_9001', isoClause: '8.5.3', isoDataCaptured: 'Customer property control (data, materials)', griCode: 'GRI 418-1 (where customer data involved)', coverageLevel: 'PARTIAL', notes: 'ISO 9001 covers customer-supplied materials and data; for personal data, ISO 27001 is the primary source.', tripleIModule: 'Privacy Module' },
  { isoStandard: 'ISO_9001', isoClause: '10.2', isoDataCaptured: 'Customer complaints handling', griCode: 'GRI 416-2, 418-1', coverageLevel: 'FULL', notes: 'Complaint logs directly feed product safety and privacy-related complaint disclosures.', tripleIModule: 'Compliance Module' },
  { isoStandard: 'ISO_9001', isoClause: '5.1 / 5.3', isoDataCaptured: 'Management commitment and quality policy', griCode: 'GRI 2-12, 2-13, 2-23', coverageLevel: 'SUPPORTING', notes: 'Evidence of management system oversight; broader sustainability commitments require separate documentation.', tripleIModule: 'Governance Module' },
  { isoStandard: 'ISO_9001', isoClause: '7.1.6', isoDataCaptured: 'Organizational knowledge', griCode: 'GRI 404-2', coverageLevel: 'SUPPORTING', notes: 'Provides framework for employee skills development.', tripleIModule: 'Training Module' },
  { isoStandard: 'ISO_9001', isoClause: '7.5', isoDataCaptured: 'Documented information control', griCode: 'Disclosure data lineage', coverageLevel: 'FULL', notes: 'ISO 9001 document control directly supports audit-trail requirements for any sustainability disclosure.', tripleIModule: 'Platform-wide' },
  { isoStandard: 'ISO_9001', isoClause: '9.2 / 9.3', isoDataCaptured: 'Internal audit and management review', griCode: 'GRI 2-14, 2-18', coverageLevel: 'PARTIAL', notes: 'Evidence of QMS governance; doesn\'t fully cover sustainability-specific governance.', tripleIModule: 'Governance Module' },

  // ── ISO 50001 (Energy Management) ─────────────────────────────
  { isoStandard: 'ISO_50001', isoClause: '6.3', isoDataCaptured: 'Energy review (uses, consumption, EnPIs, baseline, significant energy uses)', griCode: 'GRI 302-1, 302-3', coverageLevel: 'FULL', notes: 'Strongest possible energy-domain mapping. Energy data is comprehensive, validated, and reviewed.', tripleIModule: 'Energy Module' },
  { isoStandard: 'ISO_50001', isoClause: '6.5', isoDataCaptured: 'Energy baseline', griCode: 'GRI 302-4 baseline', coverageLevel: 'FULL', notes: 'Documented baseline directly serves as GRI reduction baseline; SBTi-compatible if from 2020+.', tripleIModule: 'Energy Module' },
  { isoStandard: 'ISO_50001', isoClause: '6.6', isoDataCaptured: 'Energy performance indicators (EnPIs)', griCode: 'GRI 302-3', coverageLevel: 'FULL', notes: 'Already in intensity ratio format.', tripleIModule: 'Energy Module' },
  { isoStandard: 'ISO_50001', isoClause: '6.2 / 10.2', isoDataCaptured: 'Energy objectives and action plans (efficiency projects)', griCode: 'GRI 302-4', coverageLevel: 'FULL', notes: 'Documented projects and achieved energy reductions.', tripleIModule: 'Energy Module' },
  { isoStandard: 'ISO_50001', isoClause: '9.1', isoDataCaptured: 'Energy consumption monitoring and measurement', griCode: 'GRI 302-1', coverageLevel: 'FULL', notes: 'Continuous monitoring required; granular by source and use.', tripleIModule: 'Energy Module' },
  { isoStandard: 'ISO_50001', isoClause: '6.3', isoDataCaptured: 'Fuel consumption data (natural gas, diesel, petrol, propane, etc.)', griCode: 'GRI 305-1 (Scope 1)', coverageLevel: 'FULL', notes: 'Activity data complete; calculation engine applies emission factors.', tripleIModule: 'GHG Module' },
  { isoStandard: 'ISO_50001', isoClause: '6.3', isoDataCaptured: 'Electricity, heat, steam purchased', griCode: 'GRI 305-2 (Scope 2)', coverageLevel: 'FULL', notes: 'Activity data complete; market vs location-based dual reporting handled in platform.', tripleIModule: 'GHG Module' },
  { isoStandard: 'ISO_50001', isoClause: '6.3', isoDataCaptured: 'Energy from renewable sources (on-site, PPA, EAC)', griCode: 'GRI 302-1 (renewable share)', coverageLevel: 'FULL', notes: 'Mature ISO 50001 systems track renewable share explicitly.', tripleIModule: 'Energy Module' },
  { isoStandard: 'ISO_50001', isoClause: '4.1 / 4.2', isoDataCaptured: 'Context of organization and interested parties (energy-related)', griCode: 'GRI 2-29 (partial)', coverageLevel: 'SUPPORTING', notes: 'Provides energy-stakeholder mapping; broader sustainability stakeholders need separate exercise.', tripleIModule: 'Stakeholder Module' },
  { isoStandard: 'ISO_50001', isoClause: '9.3', isoDataCaptured: 'Energy management review', griCode: 'GRI 2-14', coverageLevel: 'SUPPORTING', notes: 'Evidence of governance oversight on energy/climate matters.', tripleIModule: 'Governance Module' },

  // ── ISO 14064 (GHG Inventory & Verification) ─────────────────
  { isoStandard: 'ISO_14064', isoClause: '5.1', isoDataCaptured: 'Organizational boundaries (operational control / financial control / equity share)', griCode: 'GRI 305 boundary disclosure', coverageLevel: 'FULL', notes: 'ISO 14064-1:2018 aligned with GHG Protocol consolidation approaches.', tripleIModule: 'GHG Module' },
  { isoStandard: 'ISO_14064', isoClause: '5.2', isoDataCaptured: 'Reporting boundaries (Scope 1, 2, 3 categories included/excluded)', griCode: 'GRI 305-1, 305-2, 305-3', coverageLevel: 'FULL', notes: 'Direct alignment with GHG Protocol scopes.', tripleIModule: 'GHG Module' },
  { isoStandard: 'ISO_14064', isoClause: '6.1', isoDataCaptured: 'Direct GHG emissions and removals (Scope 1 equivalent)', griCode: 'GRI 305-1', coverageLevel: 'FULL', notes: 'Identical scope and gases (CO2, CH4, N2O, HFCs, PFCs, SF6, NF3).', tripleIModule: 'GHG Module' },
  { isoStandard: 'ISO_14064', isoClause: '6.2', isoDataCaptured: 'Indirect GHG emissions from imported energy (Scope 2 equivalent)', griCode: 'GRI 305-2', coverageLevel: 'FULL', notes: 'Dual reporting (location/market) required under ISO 14064-1:2018 — fully aligned.', tripleIModule: 'GHG Module' },
  { isoStandard: 'ISO_14064', isoClause: '6.3', isoDataCaptured: 'Other indirect emissions (Scope 3 equivalent — 15 GHG Protocol categories)', griCode: 'GRI 305-3', coverageLevel: 'FULL', notes: 'ISO 14064-1:2018 explicitly references GHG Protocol categories.', tripleIModule: 'GHG Module' },
  { isoStandard: 'ISO_14064', isoClause: '7.1', isoDataCaptured: 'Emission factor sources and documentation', griCode: 'Disclosure methodology', coverageLevel: 'FULL', notes: 'Documented emission factor library with sources and vintages.', tripleIModule: 'GHG Module' },
  { isoStandard: 'ISO_14064', isoClause: '7.2', isoDataCaptured: 'Uncertainty assessment', griCode: 'Disclosure quality', coverageLevel: 'FULL', notes: 'Required by ISO 14064-1 — strengthens audit credibility.', tripleIModule: 'GHG Module' },
  { isoStandard: 'ISO_14064', isoClause: '8.1', isoDataCaptured: 'Base year and recalculation policy', griCode: 'GRI 305 baseline', coverageLevel: 'FULL', notes: 'Required documentation directly serves GRI restatement requirements (2-4).', tripleIModule: 'GHG Module' },
  { isoStandard: 'ISO_14064', isoClause: 'All', isoDataCaptured: 'Independent verification of GHG inventory (limited or reasonable)', griCode: 'External assurance preparedness', coverageLevel: 'FULL', notes: 'ISO 14064-3 verification is excellent preparation for ISAE 3410 limited assurance on GHG numbers. NOT a substitute, but a strong starting point.', tripleIModule: 'Assurance Module' },

  // ── ISO 27001 (Information Security) ──────────────────────────
  { isoStandard: 'ISO_27001', isoClause: 'A.5 / A.6', isoDataCaptured: 'Information security policies and organization', griCode: 'GRI 418 management approach', coverageLevel: 'FULL', notes: 'Direct evidence of governance over data privacy and security.', tripleIModule: 'Privacy Module' },
  { isoStandard: 'ISO_27001', isoClause: 'A.8', isoDataCaptured: 'Asset management including data classification', griCode: 'GRI 418-1 supporting', coverageLevel: 'SUPPORTING', notes: 'Provides controls inventory.', tripleIModule: 'Privacy Module' },
  { isoStandard: 'ISO_27001', isoClause: 'A.5.34', isoDataCaptured: 'Privacy and protection of personal data controls', griCode: 'GRI 418-1', coverageLevel: 'FULL', notes: 'Direct mapping for GDPR/personal data protection.', tripleIModule: 'Privacy Module' },
  { isoStandard: 'ISO_27001', isoClause: 'A.5.27 / 8.16', isoDataCaptured: 'Incident management and monitoring', griCode: 'GRI 418-1 (breach disclosure)', coverageLevel: 'FULL', notes: 'Security incident logs directly evidence data breaches or losses.', tripleIModule: 'Privacy Module' },
  { isoStandard: 'ISO_27001', isoClause: 'A.5.31', isoDataCaptured: 'Legal, statutory, regulatory and contractual requirements', griCode: 'GRI 2-27', coverageLevel: 'FULL', notes: 'Compliance register including data protection laws.', tripleIModule: 'Compliance Module' },
  { isoStandard: 'ISO_27001', isoClause: 'A.6.3', isoDataCaptured: 'Information security awareness, education and training', griCode: 'GRI 404-1 (supporting)', coverageLevel: 'SUPPORTING', notes: 'Training records may feed broader training disclosures.', tripleIModule: 'Training Module' },

  // ── ISO 26000 (Social Responsibility Guidance) ────────────────
  { isoStandard: 'ISO_26000', isoClause: '6.2', isoDataCaptured: 'Organizational governance', griCode: 'GRI 2 (General Disclosures)', coverageLevel: 'SUPPORTING', notes: 'Conceptual framework; specific disclosures require GRI 2-9 through 2-21.', tripleIModule: 'Governance Module' },
  { isoStandard: 'ISO_26000', isoClause: '6.3', isoDataCaptured: 'Human rights', griCode: 'GRI 408, 409, 410, 411, 412', coverageLevel: 'SUPPORTING', notes: 'ISO 26000 provides principles; UNGPs and CSDDD provide operational due diligence requirements.', tripleIModule: 'Human Rights Module' },
  { isoStandard: 'ISO_26000', isoClause: '6.4', isoDataCaptured: 'Labour practices', griCode: 'GRI 401, 402, 403, 404, 405, 406, 407', coverageLevel: 'SUPPORTING', notes: 'Framework alignment with all social topic standards.', tripleIModule: 'Social Module' },
  { isoStandard: 'ISO_26000', isoClause: '6.5', isoDataCaptured: 'The environment', griCode: 'GRI 301-308', coverageLevel: 'SUPPORTING', notes: 'Conceptual framework; ISO 14001 + ISO 50001 + ISO 14064 provide operational data.', tripleIModule: 'Environmental Modules' },
  { isoStandard: 'ISO_26000', isoClause: '6.6', isoDataCaptured: 'Fair operating practices', griCode: 'GRI 205, 206, 207, 308, 414', coverageLevel: 'SUPPORTING', notes: 'Anti-corruption, anti-competition, tax, supplier assessments.', tripleIModule: 'Compliance Module' },
  { isoStandard: 'ISO_26000', isoClause: '6.7', isoDataCaptured: 'Consumer issues', griCode: 'GRI 416, 417, 418', coverageLevel: 'SUPPORTING', notes: 'Product safety, marketing, customer privacy.', tripleIModule: 'Product Module' },
  { isoStandard: 'ISO_26000', isoClause: '6.8', isoDataCaptured: 'Community involvement and development', griCode: 'GRI 413, 203', coverageLevel: 'SUPPORTING', notes: 'Community engagement and economic impact.', tripleIModule: 'Community Module' },

  // ── ISO 20400 (Sustainable Procurement) ───────────────────────
  { isoStandard: 'ISO_20400', isoClause: '5', isoDataCaptured: 'Sustainable procurement policy and accountability', griCode: 'GRI 308 / 414 management approach', coverageLevel: 'FULL', notes: 'Direct evidence of supplier sustainability governance.', tripleIModule: 'Procurement Module' },
  { isoStandard: 'ISO_20400', isoClause: '6', isoDataCaptured: 'Procurement function organization and integration', griCode: 'GRI 2-23 policy commitments', coverageLevel: 'SUPPORTING', notes: 'Evidence of operationalized commitments.', tripleIModule: 'Governance Module' },
  { isoStandard: 'ISO_20400', isoClause: '7.2', isoDataCaptured: 'Supplier sustainability criteria in selection', griCode: 'GRI 308-1, 414-1', coverageLevel: 'FULL', notes: 'Percentage of new suppliers screened against environmental and social criteria.', tripleIModule: 'Procurement Module' },
  { isoStandard: 'ISO_20400', isoClause: '7.3', isoDataCaptured: 'Supplier assessment and audit', griCode: 'GRI 308-2, 414-2', coverageLevel: 'FULL', notes: 'Identification of negative impacts in supply chain and actions taken.', tripleIModule: 'Procurement Module' },
  { isoStandard: 'ISO_20400', isoClause: '7.4 / 7.5', isoDataCaptured: 'Supplier engagement and development', griCode: 'GRI 308-2, 414-2 (corrective actions)', coverageLevel: 'FULL', notes: 'Corrective action plans, capacity building.', tripleIModule: 'Procurement Module' },
  { isoStandard: 'ISO_20400', isoClause: '7.6', isoDataCaptured: 'Supplier emissions and ESG data collection', griCode: 'GRI 305-3 Cat 1 (primary data)', coverageLevel: 'FULL', notes: 'Most relevant ISO standard for upgrading Scope 3 Cat 1 from spend-based to hybrid/primary data.', tripleIModule: 'Scope 3 Module' },
];

// ─── Seed function ──────────────────────────────────────────────

async function seedMappingRules() {
  console.log(`[isoGriSeeder] Seeding ${MAPPING_RULES.length} mapping rules...`);
  let upserted = 0;

  for (const rule of MAPPING_RULES) {
    // IsoGriMappingRule has no compound unique constraint, so use
    // findFirst + create/update instead of upsert.
    const existing = await prisma.isoGriMappingRule.findFirst({
      where: {
        isoStandard: rule.isoStandard,
        isoClause: rule.isoClause,
        griCode: rule.griCode,
        version: '1.0',
      },
    });

    if (existing) {
      await prisma.isoGriMappingRule.update({
        where: { id: existing.id },
        data: {
          isoDataCaptured: rule.isoDataCaptured,
          coverageLevel: rule.coverageLevel,
          notes: rule.notes,
          tripleIModule: rule.tripleIModule,
        },
      });
    } else {
      await prisma.isoGriMappingRule.create({
        data: {
          isoStandard: rule.isoStandard,
          isoClause: rule.isoClause,
          isoDataCaptured: rule.isoDataCaptured,
          griCode: rule.griCode,
          coverageLevel: rule.coverageLevel,
          notes: rule.notes,
          tripleIModule: rule.tripleIModule,
          version: '1.0',
        },
      });
    }
    upserted++;
  }

  console.log(`[isoGriSeeder] Done. ${upserted} rules upserted.`);
  return upserted;
}

// ─── Load rules from DB ─────────────────────────────────────────

async function loadMappingRulesFromDb() {
  return prisma.isoGriMappingRule.findMany({
    orderBy: [{ isoStandard: 'asc' }, { isoClause: 'asc' }],
  });
}

// ─── CLI entry point ────────────────────────────────────────────

if (require.main === module) {
  seedMappingRules()
    .then((count) => {
      console.log(`Seeded ${count} mapping rules.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}

module.exports = { seedMappingRules, loadMappingRulesFromDb, MAPPING_RULES };
