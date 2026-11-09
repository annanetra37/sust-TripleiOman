/**
 * Preparation Guide definitions — "Where to Start".
 *
 * Each topic has a few questions; the answers filter/condition the
 * checklist so the user ends with a personalized "have this in hand"
 * list. Every item says WHAT to get, WHO in the company typically has
 * it, in what FORMAT, and WHERE in the platform it gets connected.
 *
 * `when(answers)` decides whether an item appears; omit it for items
 * that always apply.
 */

export const PREP_TOPICS = [
  // ─── E1 Climate ─────────────────────────────────────────────────────
  {
    key: 'e1',
    label: 'Climate & Emissions (E1)',
    tagline: 'Scope 1/2/3 emissions from bills, fuel data, and travel records',
    color: 'green',
    emoji: '🌍',
    questions: [
      {
        key: 'sources', label: 'Which emission sources does your company have?', type: 'multi',
        options: [
          { value: 'vehicles', label: 'Own vehicles, generators, or on-site fuel (gas, diesel, LPG)' },
          { value: 'electricity', label: 'Purchased electricity / district heating' },
          { value: 'travel', label: 'Business travel (flights, hotels, rail)' },
          { value: 'supply', label: 'Purchased goods / supply chain (Scope 3)' },
        ],
      },
      {
        key: 'billFormat', label: 'How do your energy bills and receipts arrive?', type: 'single',
        options: [
          { value: 'pdf', label: 'PDFs / paper invoices and receipts' },
          { value: 'sheet', label: 'Consolidated spreadsheet exports (from facilities or accounting)' },
          { value: 'system', label: 'In an energy platform or database we can connect' },
        ],
      },
      {
        key: 'inventory', label: 'Do you already have a GHG inventory from a previous year?', type: 'single',
        options: [
          { value: 'verified', label: 'Yes — externally verified (e.g. ISO 14064)' },
          { value: 'internal', label: 'Yes — internal calculation only' },
          { value: 'none', label: 'No — this is our first time' },
        ],
      },
    ],
    items: [
      {
        id: 'e1-orgunits',
        title: 'Define your organizational units first',
        detail: 'Sites/entities you will report per (e.g. HQ Austria, Plant Vietnam). Every upload is tagged to one.',
        owner: 'You (Admin)', format: 'In-app setup',
        uploadPath: '/settings?tab=org-units', uploadLabel: 'Settings → Organizational Units',
      },
      {
        id: 'e1-electricity',
        title: 'Electricity & heating consumption per site',
        detail: 'kWh per month/quarter per site, or the utility invoices themselves. Include supplier name if you have green-tariff contracts.',
        owner: 'Facilities / Office management', format: 'PDF invoices or Excel export',
        uploadPath: '/platform/E/environmental-1', uploadLabel: 'E1 — Climate upload',
        when: (a) => (a.sources || []).includes('electricity'),
      },
      {
        id: 'e1-fuel',
        title: 'Fuel data: fleet fuel card report or purchase log',
        detail: 'Litres of diesel/petrol/LPG by vehicle or site, or fuel invoices. Generator fuel counts too.',
        owner: 'Fleet manager / Facilities', format: 'Excel/CSV or PDF receipts',
        uploadPath: '/platform/E/environmental-1', uploadLabel: 'E1 — Climate upload',
        when: (a) => (a.sources || []).includes('vehicles'),
      },
      {
        id: 'e1-travel',
        title: 'Business travel records',
        detail: 'Travel agency export (flights with origin/destination/class) or the travel invoices/receipts themselves.',
        owner: 'HR / Travel desk / Accounting', format: 'Excel export or PDF receipts (AI Document Extract handles receipts)',
        uploadPath: '/platform/E/environmental-1', uploadLabel: 'E1 — Climate upload (Doc Extract for receipts)',
        when: (a) => (a.sources || []).includes('travel'),
      },
      {
        id: 'e1-spend',
        title: 'Purchased goods: procurement spend or supplier data',
        detail: 'Spend by category (for spend-based Scope 3) or supplier contact list to request primary data via the Supplier Portal.',
        owner: 'Procurement', format: 'Excel/CSV',
        uploadPath: '/suppliers', uploadLabel: 'Suppliers — Scope 3 Portal',
        when: (a) => (a.sources || []).includes('supply'),
      },
      {
        id: 'e1-dbconn',
        title: 'Database/API credentials for your energy platform',
        detail: 'Host, database name, and a read-only user for PostgreSQL/MySQL/SQL Server/REST source.',
        owner: 'IT', format: 'Connection credentials',
        uploadPath: '/connections', uploadLabel: 'Data Connections',
        when: (a) => a.billFormat === 'system',
      },
      {
        id: 'e1-prior',
        title: 'Last year\'s GHG inventory report',
        detail: 'Used as your baseline and for year-over-year comparison in reports. If ISO 14064-verified, also upload it in the ISO Bridge as evidence.',
        owner: 'Sustainability / QM', format: 'PDF or Excel',
        uploadPath: '/platform/E/environmental-1', uploadLabel: 'E1 — Climate upload',
        when: (a) => a.inventory === 'verified' || a.inventory === 'internal',
      },
      {
        id: 'e1-targets',
        title: 'Any existing reduction targets or commitments',
        detail: 'Target year, base year, reduction % — even informal board commitments. Entered as SBTi targets.',
        owner: 'Sustainability / Management', format: 'In-app entry',
        uploadPath: '/sbti-targets', uploadLabel: 'SBTi Targets',
      },
    ],
  },

  // ─── S1 Workforce ───────────────────────────────────────────────────
  {
    key: 's1',
    label: 'Own Workforce (S1)',
    tagline: 'Headcount, diversity, training, turnover, and safety data',
    color: 'indigo',
    emoji: '👥',
    questions: [
      {
        key: 'hris', label: 'Where does your workforce data live?', type: 'single',
        options: [
          { value: 'hris', label: 'An HR system that can export Excel (Personio, Workday, SAP…)' },
          { value: 'excel', label: 'Excel files maintained by HR' },
          { value: 'none', label: 'Not centrally tracked yet' },
        ],
      },
      {
        key: 'areas', label: 'Which areas do you want to report?', type: 'multi',
        options: [
          { value: 'composition', label: 'Headcount & diversity (gender, contract type)' },
          { value: 'training', label: 'Training hours' },
          { value: 'turnover', label: 'Hires & leavers (turnover)' },
          { value: 'safety', label: 'Work accidents & injuries' },
        ],
      },
    ],
    items: [
      {
        id: 's1-composition',
        title: 'Headcount export by gender and contract type',
        detail: 'One row per group: year, gender, contract type (permanent/temporary/part-time), country, count. Any column names work — the AI maps them.',
        owner: 'HR', format: 'Excel/CSV (any language)',
        uploadPath: '/platform/S/social-1', uploadLabel: 'S1 — Workforce upload',
        when: (a) => (a.areas || []).includes('composition'),
      },
      {
        id: 's1-training',
        title: 'Training log from your LMS or HR files',
        detail: 'Training hours and participants, ideally split by gender. An LMS completion export works directly.',
        owner: 'HR / L&D', format: 'Excel/CSV',
        uploadPath: '/platform/S/social-1', uploadLabel: 'S1 — Workforce upload',
        when: (a) => (a.areas || []).includes('training'),
      },
      {
        id: 's1-turnover',
        title: 'Leavers list with reason',
        detail: 'Leavers per period with voluntary vs involuntary flag (resigned vs terminated) and gender.',
        owner: 'HR', format: 'Excel/CSV',
        uploadPath: '/platform/S/social-1', uploadLabel: 'S1 — Workforce upload',
        when: (a) => (a.areas || []).includes('turnover'),
      },
      {
        id: 's1-injuries',
        title: 'Accident / injury log',
        detail: 'Incidents with type and severity (fatal / lost-time / first aid). If you are ISO 45001 certified, this is your incident register — upload it to the ISO Bridge too.',
        owner: 'EHS / Safety officer', format: 'Excel/CSV',
        uploadPath: '/platform/S/social-1', uploadLabel: 'S1 — Workforce upload',
        when: (a) => (a.areas || []).includes('safety'),
      },
      {
        id: 's1-hris-conn',
        title: 'Ask IT whether the HR system can be connected directly',
        detail: 'A read-only database or API connection removes manual exports.',
        owner: 'IT + HR', format: 'Connection credentials',
        uploadPath: '/connections', uploadLabel: 'Data Connections',
        when: (a) => a.hris === 'hris',
      },
      {
        id: 's1-start-tracking',
        title: 'Start a simple tracking sheet now',
        detail: 'If nothing is tracked yet: one Excel tab per area (headcount, training, leavers, incidents) is enough — the AI needs no special template.',
        owner: 'HR', format: 'Excel',
        uploadPath: '/platform/S/social-1', uploadLabel: 'S1 — Workforce upload',
        when: (a) => a.hris === 'none',
      },
    ],
  },

  // ─── G1 Governance ──────────────────────────────────────────────────
  {
    key: 'g1',
    label: 'Governance (G1)',
    tagline: 'Board composition, ethics training, incidents, policy register',
    color: 'amber',
    emoji: '🏛️',
    questions: [
      {
        key: 'board', label: 'Where is your board/leadership register kept?', type: 'single',
        options: [
          { value: 'secretary', label: 'Corporate secretary / legal keeps a member register' },
          { value: 'report', label: 'It is only in the annual report / commercial register' },
          { value: 'none', label: 'No formal register (small company)' },
        ],
      },
      {
        key: 'training', label: 'Is compliance/ethics training tracked?', type: 'single',
        options: [
          { value: 'lms', label: 'Yes — in an LMS / e-learning platform' },
          { value: 'sheet', label: 'Yes — in spreadsheets' },
          { value: 'none', label: 'Not yet' },
        ],
      },
      {
        key: 'whistle', label: 'Do you have a whistleblower or incident-reporting channel?', type: 'single',
        options: [
          { value: 'log', label: 'Yes, with a case log' },
          { value: 'nolog', label: 'Yes, but cases are not logged centrally' },
          { value: 'none', label: 'No' },
        ],
      },
    ],
    items: [
      {
        id: 'g1-board',
        title: 'Board & leadership member list',
        detail: 'One row per member (or group): role (executive/non-executive/chair), gender, independent yes/no, tenure, age band. The policies themselves are documents — but this is a LIST, which is why it arrives as a spreadsheet.',
        owner: 'Corporate secretary / Legal', format: 'Excel/CSV',
        uploadPath: '/platform/G/governance-1', uploadLabel: 'Governance upload',
      },
      {
        id: 'g1-board-extract',
        title: 'Extract the member list from the annual report',
        detail: 'Copy the governance section of the annual report into a simple sheet (name/role/gender/independence). 15 minutes of work.',
        owner: 'You + annual report', format: 'Excel',
        uploadPath: '/platform/G/governance-1', uploadLabel: 'Governance upload',
        when: (a) => a.board === 'report' || a.board === 'none',
      },
      {
        id: 'g1-training',
        title: 'Ethics/compliance training completion export',
        detail: 'Topic (anti-corruption, code of conduct, data privacy), audience, number trained, completion rate. LMS exports work directly.',
        owner: 'Compliance / HR / L&D', format: 'Excel/CSV',
        uploadPath: '/platform/G/governance-1', uploadLabel: 'Governance upload',
        when: (a) => a.training !== 'none',
      },
      {
        id: 'g1-training-start',
        title: 'Run your first code-of-conduct training and record it',
        detail: 'GRI 205-2 asks for training coverage — even a first all-hands session with an attendance list is reportable data.',
        owner: 'Compliance / HR', format: 'Attendance list → Excel',
        uploadPath: '/platform/G/governance-1', uploadLabel: 'Governance upload',
        when: (a) => a.training === 'none',
      },
      {
        id: 'g1-incidents',
        title: 'Incident / whistleblower case register',
        detail: 'Cases with type (corruption, data privacy, conflict of interest…), status, action taken, fines if any. Anonymized rows are fine — counts are what reports need.',
        owner: 'Legal / Compliance officer', format: 'Excel/CSV',
        uploadPath: '/platform/G/governance-1', uploadLabel: 'Governance upload',
        when: (a) => a.whistle === 'log',
      },
      {
        id: 'g1-incident-log-start',
        title: 'Create a central case log',
        detail: 'Reports require confirmed-incident counts. Start a simple register: date, type, status, action. Zero incidents is also a reportable answer — but only if you track.',
        owner: 'Legal / Compliance officer', format: 'Excel',
        uploadPath: '/platform/G/governance-1', uploadLabel: 'Governance upload',
        when: (a) => a.whistle === 'nolog' || a.whistle === 'none',
      },
      {
        id: 'g1-policies',
        title: 'Policy inventory (the list, not the PDFs)',
        detail: 'Which governance policies exist (code of conduct, anti-corruption, whistleblower, data privacy, supplier code), status, board approval, last review year. The policy DOCUMENTS belong in the ISO Bridge if you are 37001/14001 certified.',
        owner: 'Legal', format: 'Excel/CSV',
        uploadPath: '/platform/G/governance-1', uploadLabel: 'Governance upload',
      },
    ],
  },

  // ─── PCF ────────────────────────────────────────────────────────────
  {
    key: 'pcf',
    label: 'Product Carbon Footprint (PCF)',
    tagline: 'Cradle-to-gate footprint per product from BOM and production data',
    color: 'purple',
    emoji: '📦',
    questions: [
      {
        key: 'bom', label: 'Do you have a bill of materials (BOM) for your products?', type: 'single',
        options: [
          { value: 'erp', label: 'Yes — exportable from our ERP' },
          { value: 'docs', label: 'Partially — in supplier documents / engineering files' },
          { value: 'none', label: 'No — but we can describe the product' },
        ],
      },
      {
        key: 'energy', label: 'Do you know the assembly energy per unit?', type: 'single',
        options: [
          { value: 'yes', label: 'Yes — production tracks kWh per unit or per batch' },
          { value: 'no', label: 'No — only total site electricity' },
        ],
      },
    ],
    items: [
      {
        id: 'pcf-master',
        title: 'Product master data',
        detail: 'SKU, product name, sector, functional unit, total mass. Needed to create the product before any BOM.',
        owner: 'Product management', format: 'In-app entry',
        uploadPath: '/products', uploadLabel: 'Products & BOM',
      },
      {
        id: 'pcf-bom',
        title: 'BOM export with materials and quantities',
        detail: 'Part name, material, quantity, unit/mass per part. Scrap rates per part if available. Any ERP export format works.',
        owner: 'Engineering / ERP admin', format: 'Excel/CSV',
        uploadPath: '/products', uploadLabel: 'Products & BOM upload',
        when: (a) => a.bom === 'erp' || a.bom === 'docs',
      },
      {
        id: 'pcf-describe',
        title: 'A precise product description for AI BOM generation',
        detail: 'Materials, approximate weight, main components — the AI proposes a BOM you then refine. Good enough for a first estimate.',
        owner: 'Engineering', format: 'Text description in-app',
        uploadPath: '/products', uploadLabel: 'Products — Generate BOM with AI',
        when: (a) => a.bom === 'none',
      },
      {
        id: 'pcf-energy',
        title: 'Assembly energy per unit (or per batch)',
        detail: 'kWh per unit produced, and the production country (grid mix matters). If unknown: total site kWh ÷ units produced is an accepted start.',
        owner: 'Production / Facilities', format: 'Number + country',
        uploadPath: '/products', uploadLabel: 'Products — process steps',
      },
      {
        id: 'pcf-suppliers',
        title: 'Supplier contacts for primary component data',
        detail: 'For your top components by mass: supplier name + contact email, to request real PCF data instead of database averages.',
        owner: 'Procurement', format: 'Contact list',
        uploadPath: '/suppliers', uploadLabel: 'Supplier Portal',
      },
    ],
  },

  // ─── ISO Bridge ─────────────────────────────────────────────────────
  {
    key: 'isoBridge',
    label: 'ISO Bridge',
    tagline: 'Turn ISO certificates and registers into report content',
    color: 'teal',
    emoji: '🪪',
    questions: [
      {
        key: 'certs', label: 'Which ISO certificates does your company hold?', type: 'multi',
        options: [
          { value: '14001', label: 'ISO 14001 (environment)' },
          { value: '45001', label: 'ISO 45001 (health & safety)' },
          { value: '50001', label: 'ISO 50001 (energy)' },
          { value: '14064', label: 'ISO 14064 (GHG inventory)' },
          { value: '37001', label: 'ISO 37001 (anti-bribery)' },
          { value: '9001', label: 'ISO 9001 (quality)' },
        ],
      },
    ],
    items: [
      {
        id: 'iso-certs',
        title: 'The certificate PDFs themselves',
        detail: 'Every held certificate as PDF/scan. Check the edition on each (14001: 2015 vs 2026 matters a lot).',
        owner: 'QM / HSE manager', format: 'PDF or scan',
        uploadPath: '/iso-bridge', uploadLabel: 'ISO Bridge — Certificates tab',
        when: (a) => (a.certs || []).length > 0,
      },
      {
        id: 'iso-aspects',
        title: 'Environmental aspects & impacts register',
        detail: 'The 14001 clause 6.1.2 register — your de-facto materiality analysis. The single most valuable document.',
        owner: 'Environmental / QM manager', format: 'PDF or Excel (any language)',
        uploadPath: '/iso-bridge', uploadLabel: 'ISO Bridge — Evidence tab',
        when: (a) => (a.certs || []).includes('14001'),
      },
      {
        id: 'iso-incidents',
        title: '45001 incident register + OH&S documents',
        detail: 'Incident register, hazard/risk assessment, training records, safety-committee minutes — these pre-write GRI 403-1 through 403-9.',
        owner: 'Safety officer', format: 'PDF or Excel',
        uploadPath: '/iso-bridge', uploadLabel: 'ISO Bridge — Evidence tab',
        when: (a) => (a.certs || []).includes('45001'),
      },
      {
        id: 'iso-energy',
        title: '50001 energy review with baseline and EnPIs',
        detail: 'Consumption by source, baseline year, energy performance indicators — feeds GRI 302 and ESRS E1-5.',
        owner: 'Energy manager', format: 'PDF or Excel',
        uploadPath: '/iso-bridge', uploadLabel: 'ISO Bridge — Evidence tab',
        when: (a) => (a.certs || []).includes('50001'),
      },
      {
        id: 'iso-ghg',
        title: 'Verified GHG inventory report (14064)',
        detail: 'The strongest possible evidence for Scope 1/2/3 disclosures — includes verifier and assurance level.',
        owner: 'Sustainability / QM', format: 'PDF',
        uploadPath: '/iso-bridge', uploadLabel: 'ISO Bridge — Evidence tab',
        when: (a) => (a.certs || []).includes('14064'),
      },
      {
        id: 'iso-abms',
        title: '37001 anti-bribery records',
        detail: 'Risk assessments, training coverage, incident outcomes — feeds GRI 205 and ESRS G1-3.',
        owner: 'Compliance officer', format: 'PDF or Excel',
        uploadPath: '/iso-bridge', uploadLabel: 'ISO Bridge — Evidence tab',
        when: (a) => (a.certs || []).includes('37001'),
      },
      {
        id: 'iso-mgmtreview',
        title: 'Latest management review minutes',
        detail: 'Feeds the governance-oversight disclosures (GRI 2-12/2-13/2-14). Any certified standard produces these.',
        owner: 'QM manager', format: 'PDF',
        uploadPath: '/iso-bridge', uploadLabel: 'ISO Bridge — Evidence tab',
        when: (a) => (a.certs || []).length > 0,
      },
    ],
  },

  // ─── Reports ────────────────────────────────────────────────────────
  {
    key: 'reports',
    label: 'Report Generation',
    tagline: 'Everything needed before you press Generate',
    color: 'brand',
    emoji: '📄',
    questions: [
      {
        key: 'standard', label: 'Which standard do you need to report against?', type: 'single',
        options: [
          { value: 'GRI', label: 'GRI — voluntary global standard (most common start)' },
          { value: 'ESRS', label: 'ESRS — EU CSRD-mandated' },
          { value: 'TCFD', label: 'TCFD — climate-focused financial disclosures' },
          { value: 'ISSB', label: 'ISSB — IFRS S1/S2 (investors)' },
        ],
      },
      {
        key: 'audience', label: 'Who asked for the report?', type: 'single',
        options: [
          { value: 'customer', label: 'A customer / OEM questionnaire' },
          { value: 'regulator', label: 'Regulation (CSRD or national law)' },
          { value: 'internal', label: 'Management / voluntary' },
        ],
      },
    ],
    items: [
      {
        id: 'rep-profile',
        title: 'Complete the company profile',
        detail: 'Industry, size, HQ, ownership — appears on the report cover and general disclosures.',
        owner: 'You (Admin)', format: 'In-app',
        uploadPath: '/settings', uploadLabel: 'Settings',
      },
      {
        id: 'rep-standard',
        title: 'Set your disclosure standard',
        detail: 'Select the standard in Settings → ESG Standards so KPIs and modules align with it.',
        owner: 'You (Admin)', format: 'In-app',
        uploadPath: '/settings?tab=standards', uploadLabel: 'Settings → ESG Standards',
      },
      {
        id: 'rep-e1',
        title: 'Emissions data for the reporting year (E1)',
        detail: 'The E1 dashboard must show data for the year you will generate. See the Climate topic in this guide.',
        owner: 'Facilities + this guide', format: '—',
        uploadPath: '/dashboard/E/environmental-1', uploadLabel: 'E1 dashboard (verify data)',
      },
      {
        id: 'rep-s1',
        title: 'Workforce data for the reporting year (S1)',
        detail: 'At minimum headcount by gender; turnover and training strengthen the social section.',
        owner: 'HR + this guide', format: '—',
        uploadPath: '/dashboard/S/social-1', uploadLabel: 'S1 dashboard (verify data)',
      },
      {
        id: 'rep-g1',
        title: 'Governance data (G1)',
        detail: 'Board list, training, incidents, policies — fills the governance section instead of placeholders.',
        owner: 'Legal / Compliance + this guide', format: '—',
        uploadPath: '/dashboard/G/governance-1', uploadLabel: 'G1 dashboards (verify data)',
      },
      {
        id: 'rep-iso',
        title: 'Approved ISO Bridge drafts for narrative sections',
        detail: 'If you hold ISO certificates: draft and approve narrative disclosures in the ISO Bridge so the report text is pre-written and cited.',
        owner: 'Sustainability + reviewer', format: '—',
        uploadPath: '/iso-bridge', uploadLabel: 'ISO Bridge',
      },
      {
        id: 'rep-logo',
        title: 'Company logo for the branded cover',
        detail: 'PNG/JPG. Uploaded in Settings → Company Branding.',
        owner: 'Marketing', format: 'PNG/JPG',
        uploadPath: '/settings?tab=branding', uploadLabel: 'Settings → Company Branding',
      },
      {
        id: 'rep-esrs-dma',
        title: 'ESRS only: materiality assessment input',
        detail: 'ESRS expects double materiality. If you are ISO 14001 certified, your aspects register is the best input — ingest it via the ISO Bridge.',
        owner: 'Sustainability', format: 'Workshop output / register',
        uploadPath: '/iso-bridge', uploadLabel: 'ISO Bridge — Evidence',
        when: (a) => a.standard === 'ESRS',
      },
      {
        id: 'rep-deadline',
        title: 'Confirm the exact scope and deadline with the requester',
        detail: 'Customer questionnaires often accept a GRI-referenced report; regulators do not. One email now saves a re-generation later.',
        owner: 'You', format: '—',
        uploadPath: '/reports', uploadLabel: 'Reports',
        when: (a) => a.audience === 'customer' || a.audience === 'regulator',
      },
    ],
  },
];

/** Items applicable for a topic given the current answers. */
export function itemsFor(topic, answers) {
  return topic.items.filter((item) => !item.when || item.when(answers || {}));
}
