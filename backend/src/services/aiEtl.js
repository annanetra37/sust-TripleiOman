/**
 * AI-Powered ETL Pipeline
 *
 * The core intelligence layer. Handles ANY messy sustainability data:
 *
 *   Raw Data (any format, any language, any structure)
 *       ↓
 *   [1] AI Schema Mapping — Claude identifies what each column/field represents
 *       ↓
 *   [2] AI Data Cleaning — normalizes values, fixes types, standardizes enums
 *       ↓
 *   [3] Validation — checks required fields, value ranges, consistency
 *       ↓
 *   [4] Ingestion — inserts clean rows into the correct data model tables
 *
 * Uses Claude (model set via ANTHROPIC_MODEL, default claude-sonnet-5) via the Anthropic SDK for all AI operations.
 */

const Anthropic = require('@anthropic-ai/sdk').default;
const config = require('../config');
const { trackedAICall, logCost } = require('../utils/costTracker');

let client;
function getClient() {
  if (!client) {
    if (!config.anthropic.apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required. Set it in your .env file.');
    }
    client = new Anthropic({ apiKey: config.anthropic.apiKey });
  }
  return client;
}

// ─── Target Schemas ─────────────────────────────────────────
// These define what the AI must map incoming data TO.

const S1_SCHEMAS = {
  workforce_composition: {
    description: 'Employee headcount by gender, contract type, and country',
    fields: {
      year: { type: 'integer', required: true, description: 'Reporting year (e.g. 2024)' },
      quarter: { type: 'integer', required: false, description: 'Quarter 1-4, null if annual' },
      gender: { type: 'enum', required: true, values: ['Male', 'Female', 'Non-binary', 'Not disclosed'], description: 'Employee gender' },
      contractType: { type: 'enum', required: true, values: ['Permanent', 'Temporary', 'Part-time', 'Full-time', 'Contract', 'Intern'], description: 'Employment contract type' },
      country: { type: 'string', required: false, description: 'Country of employment (ISO or full name)' },
      employeeCount: { type: 'integer', required: true, description: 'Number of employees matching this combination' },
    },
  },
  workforce_diversity: {
    description: 'Disability status and type counts by gender',
    fields: {
      year: { type: 'integer', required: true },
      quarter: { type: 'integer', required: false },
      gender: { type: 'enum', required: true, values: ['Male', 'Female', 'Non-binary', 'Not disclosed'] },
      disabilityStatus: { type: 'enum', required: true, values: ['Yes', 'No', 'Not disclosed'] },
      disabilityType: { type: 'string', required: false, description: 'Type of disability if applicable' },
      count: { type: 'integer', required: true },
    },
  },
  employee_training: {
    description: 'Training hours delivered by gender',
    fields: {
      year: { type: 'integer', required: true },
      quarter: { type: 'integer', required: false },
      gender: { type: 'enum', required: true, values: ['Male', 'Female', 'Non-binary', 'Not disclosed'] },
      trainingHours: { type: 'float', required: true, description: 'Total training hours' },
      employeeCount: { type: 'integer', required: true, description: 'Number of employees who received training' },
    },
  },
  employee_turnover: {
    description: 'Employee turnover counts by gender and type',
    fields: {
      year: { type: 'integer', required: true },
      quarter: { type: 'integer', required: false },
      gender: { type: 'enum', required: true, values: ['Male', 'Female', 'Non-binary', 'Not disclosed'] },
      turnoverType: { type: 'enum', required: true, values: ['Voluntary', 'Involuntary'], description: 'Whether the employee left voluntarily or was terminated' },
      count: { type: 'integer', required: true },
    },
  },
  workplace_injuries: {
    description: 'Workplace injury incident counts',
    fields: {
      year: { type: 'integer', required: true },
      quarter: { type: 'integer', required: false },
      injuryType: { type: 'string', required: true, description: 'Type of injury (e.g. Slip/Fall, Burn, Repetitive strain)' },
      injuryStatus: { type: 'enum', required: true, values: ['Fatal', 'Non-fatal', 'Lost-time', 'Medical treatment', 'First aid'] },
      gender: { type: 'enum', required: false, values: ['Male', 'Female', 'Non-binary', 'Not disclosed'] },
      count: { type: 'integer', required: true },
    },
  },
};

const E1_SCHEMA = {
  emission_activity: {
    description: 'Individual emission activity records from energy use, travel, etc.',
    fields: {
      year: { type: 'integer', required: true },
      month: { type: 'integer', required: false, description: '1-12' },
      activityCategory: { type: 'string', required: true, description: 'E.g. Stationary Combustion, Mobile Combustion, Purchased Electricity, Business Travel, Employee Commuting, etc.' },
      activitySubcat: { type: 'string', required: true, description: 'E.g. Natural Gas, Diesel, Grid Electricity, Short-haul Flights, etc.' },
      calcMethod: { type: 'enum', required: true, values: ['consumption', 'expenditure'], description: 'Whether quantity is a physical measurement or monetary spend' },
      quantity: { type: 'float', required: true, description: 'Amount consumed (kWh, litres, km, etc.) or spent' },
      unit: { type: 'string', required: true, description: 'Unit of measurement (kWh, litres, km, tonnes, USD, etc.)' },
      emissionFactor: { type: 'float', required: false, description: 'kg CO2e per unit. If not provided, system will look up.' },
      totalEmissions: { type: 'float', required: false, description: 'Total tCO2e. If not provided, calculated from quantity * factor / 1000.' },
      scope: { type: 'enum', required: true, values: ['Scope 1', 'Scope 2', 'Scope 3'], description: 'GHG Protocol scope classification' },
      currency: { type: 'string', required: false },
      amount: { type: 'float', required: false, description: 'Monetary amount paid' },
    },
  },
};

const E3_SCHEMA = {
  water_activity: {
    description: 'Water withdrawal, discharge, and consumption records by source and site',
    fields: {
      year: { type: 'integer', required: true },
      month: { type: 'integer', required: false },
      source: { type: 'enum', required: true, values: ['surface', 'ground', 'third_party', 'seawater', 'produced', 'rainwater'] },
      flowType: { type: 'enum', required: true, values: ['withdrawal', 'discharge', 'consumption'] },
      quantity: { type: 'float', required: true, description: 'Volume in m³' },
      unit: { type: 'string', required: false, description: 'Unit (m3, litres, ML, gallons)' },
      destination: { type: 'string', required: false },
      quality: { type: 'enum', required: false, values: ['freshwater', 'other_water'] },
      recycledReused: { type: 'boolean', required: false },
    },
  },
};

const G1_SCHEMAS = {
  board_composition: {
    description: 'Board of directors / leadership composition by gender, role, and independence',
    fields: {
      year: { type: 'integer', required: true, description: 'Reporting year (e.g. 2026)' },
      quarter: { type: 'integer', required: false, description: 'Quarter 1-4, null if annual' },
      gender: { type: 'enum', required: true, values: ['Male', 'Female', 'Non-binary', 'Not disclosed'], description: 'Board member gender' },
      role: { type: 'enum', required: true, values: ['Executive', 'Non-executive', 'Chair', 'Vice-chair', 'Committee member'], description: 'Board role. CEO/CFO/managing directors → Executive; supervisory/outside directors → Non-executive' },
      independence: { type: 'enum', required: true, values: ['Independent', 'Non-independent', 'Not disclosed'], description: 'Whether the member is an independent director' },
      ageBand: { type: 'enum', required: false, values: ['Under 30', '30-50', 'Over 50'], description: 'Age band of the member(s)' },
      tenureYears: { type: 'float', required: false, description: 'Tenure on the board in years (average if aggregated)' },
      count: { type: 'integer', required: true, description: 'Number of board members matching this combination' },
    },
  },
  ethics_training: {
    description: 'Ethics / compliance training delivery (anti-corruption, code of conduct, data privacy, etc.)',
    fields: {
      year: { type: 'integer', required: true },
      quarter: { type: 'integer', required: false },
      topic: { type: 'enum', required: true, values: ['Anti-corruption', 'Code of Conduct', 'Data Privacy', 'Anti-competitive', 'Whistleblowing', 'Other'], description: 'Training topic' },
      audience: { type: 'enum', required: true, values: ['Employees', 'Management', 'Board', 'Suppliers'], description: 'Who was trained' },
      employeesTrained: { type: 'integer', required: true, description: 'Number of people who completed the training' },
      totalHeadcount: { type: 'integer', required: false, description: 'Total audience size (for completion rate)' },
      completionRate: { type: 'float', required: false, description: 'Completion rate in percent, if provided directly' },
    },
  },
  governance_incidents: {
    description: 'Business-conduct incidents: corruption, bribery, anti-competitive behavior, whistleblower reports, data privacy cases, and related fines',
    fields: {
      year: { type: 'integer', required: true },
      quarter: { type: 'integer', required: false },
      incidentType: { type: 'enum', required: true, values: ['Corruption', 'Bribery', 'Anti-competitive', 'Whistleblower report', 'Data privacy', 'Conflict of interest', 'Other'], description: 'Type of incident or case' },
      status: { type: 'enum', required: true, values: ['Open', 'Under investigation', 'Substantiated', 'Dismissed', 'Resolved'], description: 'Current case status' },
      actionTaken: { type: 'string', required: false, description: 'Disciplinary or corrective action taken (e.g. dismissal, contract termination)' },
      finesAmount: { type: 'float', required: false, description: 'Monetary fines or penalties in USD (0 if none)' },
      count: { type: 'integer', required: true, description: 'Number of incidents matching this combination' },
    },
  },
  policy_register: {
    description: 'Register of governance policies: which policies exist, their status, board approval, and last review',
    fields: {
      year: { type: 'integer', required: true, description: 'Reporting year the register entry applies to' },
      policyName: { type: 'string', required: true, description: 'Name of the policy document' },
      policyArea: { type: 'enum', required: true, values: ['Anti-corruption', 'Code of Conduct', 'Whistleblower protection', 'Data privacy', 'Supplier code', 'Lobbying', 'Other'], description: 'Governance area the policy covers' },
      status: { type: 'enum', required: true, values: ['In place', 'Draft', 'Under review', 'Not in place'], description: 'Whether the policy is adopted' },
      boardApproved: { type: 'enum', required: false, values: ['Yes', 'No', 'Not disclosed'], description: 'Whether the board approved the policy' },
      lastReviewed: { type: 'integer', required: false, description: 'Year the policy was last reviewed' },
      coverage: { type: 'enum', required: false, values: ['Employees', 'Suppliers', 'All'], description: 'Who the policy applies to' },
    },
  },
};

// ─── Step 1: AI Schema Mapping ──────────────────────────────

async function mapSchema(sampleRows, sourceColumns, targetModule, costCtx) {
  const targetSchemas = targetModule === 'S1' ? S1_SCHEMAS : targetModule === 'G1' ? G1_SCHEMAS : targetModule === 'E3' ? E3_SCHEMA : E1_SCHEMA;

  const prompt = `You are a sustainability data expert. Analyze the uploaded data and map it to the target ESG data model.

## Source Data
Column names: ${JSON.stringify(sourceColumns)}
Sample rows (first 5):
${JSON.stringify(sampleRows.slice(0, 5), null, 2)}

## Target Data Model
${JSON.stringify(targetSchemas, null, 2)}

## Your Task
1. Determine which target table(s) this data maps to. The data may map to ONE or MULTIPLE tables. Analyze the actual content, not just column names.
2. For each target table, map source columns to target fields. Handle:
   - Columns in ANY language (German, French, Arabic, Spanish, etc.)
   - Abbreviations, acronyms, non-standard naming
   - Columns that need splitting (e.g. "Full Name" → firstName + lastName)
   - Columns that need combining
   - Columns with no direct match (ignore them)
   - Multiple possible interpretations (pick the best one)
3. Identify any data transformations needed.

Return ONLY valid JSON in this exact format:
{
  "mappings": [
    {
      "targetTable": "workforce_composition",
      "confidence": 0.92,
      "columnMap": {
        "targetField": "sourceColumn or TRANSFORMATION_DESCRIPTION",
        "year": "Jahr",
        "gender": "Geschlecht",
        "employeeCount": "Anzahl"
      },
      "transformNotes": ["Gender values need translation from German: Männlich→Male, Weiblich→Female", "Year column contains full dates, extract year only"]
    }
  ],
  "unmappedColumns": ["column_x", "column_y"],
  "dataQualityNotes": ["Row 3 has missing gender value", "Some counts appear to be percentages not absolute numbers"]
}`;

  const params = { model: config.anthropic.model, max_tokens: 4096, thinking: { type: 'disabled' }, messages: [{ role: 'user', content: prompt }] };
  const response = costCtx
    ? await trackedAICall(getClient(), params, { ...costCtx, operation: 'AI_SCHEMA_MAP' })
    : await getClient().messages.create(params);

  const text = response.content.find((b) => b.type === 'text')?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI schema mapping returned invalid response');

  return JSON.parse(jsonMatch[0]);
}

// ─── Step 2: AI Data Cleaning & Transformation ──────────────

async function cleanAndTransform(rows, mapping, targetModule, costCtx) {
  const targetSchemas = targetModule === 'S1' ? S1_SCHEMAS : targetModule === 'G1' ? G1_SCHEMAS : targetModule === 'E3' ? E3_SCHEMA : E1_SCHEMA;
  const schema = targetSchemas[mapping.targetTable];

  if (!schema) throw new Error(`Unknown target table: ${mapping.targetTable}`);

  // Process in batches of 50 rows for efficiency
  const BATCH_SIZE = 50;
  const allCleaned = [];

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    const prompt = `You are a data cleaning specialist for ESG/sustainability data. Clean and transform this raw data into the exact target schema.

## Column Mapping
${JSON.stringify(mapping.columnMap, null, 2)}

## Transform Notes
${JSON.stringify(mapping.transformNotes || [], null, 2)}

## Target Schema: ${mapping.targetTable}
${JSON.stringify(schema, null, 2)}

## Raw Data Batch (${batch.length} rows)
${JSON.stringify(batch, null, 2)}

## Instructions
For EACH row, produce a cleaned object matching the target schema exactly. Handle:
- Translate values from any language to English enum values
- Parse dates/years from any format (DD/MM/YYYY, "2024-Q1", "FY2023", etc.)
- Normalize gender: map "M"/"F"/"Male"/"Female"/"Homme"/"Femme"/"Männlich"/"Weiblich"/"ذكر"/"أنثى" etc. to the enum values
- Convert string numbers ("1,234" or "1.234,56") to actual numbers
- Fix contract types: "FT"→"Full-time", "PT"→"Part-time", "Perm"→"Permanent", "Temp"→"Temporary"
- Normalize disability status: "Y"/"Yes"/"true"/"1"→"Yes", "N"/"No"/"false"/"0"→"No"
- Normalize turnover type: "Quit"/"Resigned"/"Left"→"Voluntary", "Fired"/"Terminated"/"Laid off"→"Involuntary"
- Normalize board roles: "CEO"/"CFO"/"Managing Director"→"Executive", "NED"/"Supervisory board"/"Outside director"→"Non-executive", "Chairman"/"Chairwoman"/"President of the board"→"Chair"
- Normalize independence: "Indep."/"Yes"/"unabhängig"/"indépendant"→"Independent", "No"/"Affiliated"/"Insider"→"Non-independent"
- Normalize policy status: "Adopted"/"Active"/"Implemented"→"In place", "Planned"/"Missing"/"None"→"Not in place"
- Normalize incident status: "Closed"/"Concluded"→"Resolved", "Confirmed"/"Upheld"→"Substantiated", "Rejected"/"Unfounded"→"Dismissed"
- Normalize injury severity: map any severity description to the closest enum value
- Normalize scopes: "S1"/"scope1"/"Direct"→"Scope 1", "S2"/"scope2"/"Indirect"→"Scope 2", "S3"/"scope3"/"Value chain"→"Scope 3"
- If a field is required but missing, use sensible defaults or "Not disclosed" for enums
- If a row is clearly garbage/header/total row, skip it
- Parse quantities: remove units from numbers, handle thousands separators

Return ONLY a JSON array of cleaned objects. Skip rows that cannot be meaningfully cleaned.
For skipped rows, include them in a separate "skipped" array with the reason.

{
  "cleaned": [
    {"year": 2024, "gender": "Male", "contractType": "Permanent", "employeeCount": 150, "country": "Germany"},
    ...
  ],
  "skipped": [
    {"row": 3, "reason": "Total/summary row, not individual data"}
  ]
}`;

    const params = { model: config.anthropic.model, max_tokens: 8192, thinking: { type: 'disabled' }, messages: [{ role: 'user', content: prompt }] };
    const response = costCtx
      ? await trackedAICall(getClient(), params, { ...costCtx, operation: 'AI_CLEAN', metadata: { ...costCtx.metadata, batch: i, batchSize: batch.length } })
      : await getClient().messages.create(params);

    const text = response.content.find((b) => b.type === 'text')?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.cleaned) allCleaned.push(...parsed.cleaned);
    }
  }

  return allCleaned;
}

// ─── Step 3: AI Document Extraction ─────────────────────────

async function extractDocumentWithAI(textOrBuffer, mode, costCtx, useVision = false, mimeType = 'application/pdf') {
  const modeInstructions = {
    Travel: `Extract travel/transport data: transport type (flight/train/bus/taxi/car rental), departure city/airport, arrival city/airport, distance in km, number of passengers, ticket fare/cost, currency, date. For flights determine if short-haul (<1500km), medium-haul (1500-4000km), or long-haul (>4000km).`,
    Stay: `Extract accommodation data: hotel/property name, city/location, number of nights, number of rooms, nightly rate, total cost, currency, check-in date, check-out date.`,
    Energy: `Extract energy consumption data from utility bills/invoices. The text may come from OCR and contain errors — work with what you can read.

Look for ANY of these:
- Energy type: electricity, natural gas, district heating (Fernwärme), diesel, petrol, LPG, heating oil
- Quantity: kWh, MWh, kW, litres, m³, therms, gallons — look for numbers near these units
- MWh values: convert to kWh (multiply by 1000)
- Total amount paid: look for EUR, USD, currency symbols near totals
- Billing period: date ranges, "Von... bis..." (German for from...to...)
- Supplier/company name

IMPORTANT RULES:
- Even if OCR quality is poor, extract whatever you CAN read. Don't reject the whole document.
- If you see "MWh" anywhere, that IS energy data — extract it
- German invoices: "Betrag" = amount, "Verbrauch" = consumption, "Grundpreis" = base price, "Arbeitspreis" = usage price, "Energiesteuer" = energy tax, "Fernwärme" = district heating, "Wärmezähler" = heat meter
- For district heating (Fernwärme): use activityCategory="Stationary Combustion", subType="District Heating", scope="Scope 2"
- For electricity: activityCategory="Purchased Electricity", scope="Scope 2"
- For gas/fuel: activityCategory="Stationary Combustion", scope="Scope 1"
- If you can only extract the total amount (e.g. EUR 148.22), still return it with amount field
- NEVER return empty items if you can see ANY numbers, amounts, or energy units in the text`,
    'Company Vehicle': `Extract company vehicle/service vehicle data: vehicle type, fuel type (petrol/diesel/hybrid/electric), distance driven (km or miles), fuel quantity (litres or gallons), vehicle registration/plate number, date, cost, currency. IMPORTANT: For company vehicles, always use activityCategory="Mobile Combustion" and subType="Service Vehicles".`,
  };

  const promptText = `You are an expert at extracting structured emissions data from invoices, receipts, and bills. The document may be in ANY language — including non-Latin scripts, handwritten text, and partially illegible documents.

${useVision ? `## Document
The document image is attached. Read ALL text visible in the image.

CRITICAL — HANDWRITTEN DOCUMENTS:
- The document may contain HANDWRITTEN text (pen, pencil, marker).
- Read handwritten numbers, dates, and amounts with extra care.
- If text is partially illegible, use context clues (pre-printed labels on the form, column headers, currency symbols) to infer the values.
- Hungarian invoices (SZÁMLA): "Bruttó" / "végösszeg" = gross total, "Nettó" = net, "ÁFA" = VAT, "Érték" = value, "Mennyiség" = quantity, "Egységár" = unit price.
- Common European receipt formats: the GROSS TOTAL is usually the largest number at the bottom.
- If the document is a taxi/transport receipt, extract: total fare, date, origin/destination if visible, currency.
- A partial extraction with best-effort numbers is ALWAYS better than returning empty items.` : `## Document Text\n${textOrBuffer.substring(0, 6000)}`}

## Extraction Mode: ${mode}
${modeInstructions[mode]}

## Emission Factors Reference (kg CO2e per unit)
- Short-haul flight: 0.156/passenger-km
- Long-haul flight: 0.195/passenger-km
- Train: 0.037/km
- Bus: 0.089/km
- Taxi/car: 0.149/km
- Hotel: 20.6/room-night
- Grid electricity: 0.233/kWh
- Natural gas: 0.184/kWh, 2.0/m³
- Diesel: 2.68/litre
- Petrol: 2.31/litre
- LPG: 1.56/litre
- Vehicle petrol: 0.171/km or 2.31/litre
- Vehicle diesel: 0.168/km or 2.68/litre

## CRITICAL ACCURACY RULES
1. **Distances must be realistic**:
   - Short-haul flights: 200-1500 km (e.g., London-Paris ≈ 340km, Vienna-Nuremberg ≈ 460km)
   - Medium-haul flights: 1500-4000 km (e.g., London-Istanbul ≈ 2500km)
   - Long-haul flights: 4000-18000 km (e.g., London-NYC ≈ 5500km, London-Tokyo ≈ 9500km)
   - Train journeys in Europe: typically 100-1500 km (Vienna-Nuremberg ≈ 460km by train)
   - If the document mentions specific cities, calculate the REAL geographic distance between them
   - NEVER estimate a European train journey over 2000km or a short-haul flight over 1500km
2. **Verify calculations**: emissions = (quantity × emissionFactor) / 1000 for tCO2e
3. **Use the correct emission factor** based on transport/energy type — don't guess
4. **Hotel nights**: count from check-in to check-out dates; don't confuse room count with nights
5. **Energy**: if meter readings are given, usage = new_reading - old_reading
6. **Currency**: extract the actual currency shown, don't assume USD
7. **Passengers**: default to 1 unless explicitly stated otherwise

## Instructions
Extract ALL emission-relevant data points. Calculate emissions in tCO2e.
Convert non-metric units (miles→km, gallons→litres, MWh→kWh).
Determine GHG Protocol scope (Scope 1/2/3).
Double-check your distance calculations against known geography.

CRITICAL: The document may be handwritten, scanned, photographed at an angle, or OCR'd with errors.
Do your BEST to extract data even from imperfect, blurry, or partially illegible text.
If you can identify ANY quantity, distance, amount, fare, or date — include it.
Do NOT return empty items just because the text is hard to read or in a foreign language.
A partial extraction with your best guess is ALWAYS better than no extraction.

MULTILINGUAL SUPPORT — recognise these common words across languages:
- Total/Summe/Összeg/Összesen/Bruttó/Total/Totale/合計/Итого = total amount
- Taxi/Cab/Fahrt/Utazás/Viaje/Corsa = taxi ride
- Date/Datum/Dátum/Fecha/Data/日付/Дата = date
- EUR/USD/GBP/HUF/Ft/CHF/CZK/PLN = currency

Return ONLY valid JSON:
{
  "items": [
    {
      "subType": "Short-haul Flight",
      "activityCategory": "Business Travel",
      "quantity": 340,
      "unit": "passenger-km",
      "emissionFactor": 0.156,
      "emissions": 0.053,
      "scope": "Scope 3",
      "currency": "EUR",
      "amount": 149.50,
      "date": "2024-03-15",
      "details": {"departure": "Vienna", "arrival": "Nuremberg", "passengers": 1, "distanceKm": 340}
    }
  ],
  "confidence": 0.85,
  "notes": "Invoice is in German, distance verified: Vienna-Nuremberg ≈ 340km"
}

If you cannot extract meaningful data, return {"items": [], "confidence": 0, "notes": "reason"}.`;

  // Build message content — text or vision
  let messageContent;
  if (useVision && Buffer.isBuffer(textOrBuffer)) {
    const base64 = textOrBuffer.toString('base64');
    const mediaType = mimeType || 'image/jpeg';
    const isPdf = mediaType === 'application/pdf';

    // Anthropic API uses 'document' for PDFs and 'image' for images
    const contentBlock = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };

    messageContent = [contentBlock, { type: 'text', text: promptText }];
    console.log(`[DocExtract] Using Claude Vision API (${isPdf ? 'document' : 'image'}: ${mediaType}, ${(textOrBuffer.length / 1024).toFixed(0)} KB)`);
  } else {
    messageContent = promptText;
  }

  const params = { model: config.anthropic.model, max_tokens: 4096, thinking: { type: 'disabled' }, messages: [{ role: 'user', content: messageContent }] };
  const response = costCtx
    ? await trackedAICall(getClient(), params, { ...costCtx, operation: 'AI_DOC_EXTRACT', metadata: { ...costCtx.metadata, mode, useVision } })
    : await getClient().messages.create(params);

  const text2 = response.content.find((b) => b.type === 'text')?.text || '';
  const jsonMatch = text2.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { items: [], confidence: 0, notes: 'Failed to parse AI response' };

  return JSON.parse(jsonMatch[0]);
}

// ─── Step 4: Validation ─────────────────────────────────────

function validateRow(row, schema) {
  const errors = [];

  for (const [field, spec] of Object.entries(schema.fields)) {
    const value = row[field];

    if (spec.required && (value === undefined || value === null || value === '')) {
      errors.push(`Missing required field: ${field}`);
      continue;
    }

    if (value === undefined || value === null) continue;

    if (spec.type === 'integer' && (!Number.isInteger(Number(value)) || isNaN(Number(value)))) {
      errors.push(`${field} must be integer, got: ${value}`);
    }

    if (spec.type === 'float' && isNaN(parseFloat(value))) {
      errors.push(`${field} must be number, got: ${value}`);
    }

    if (spec.type === 'enum' && spec.values && !spec.values.includes(value)) {
      errors.push(`${field} must be one of [${spec.values.join(', ')}], got: ${value}`);
    }
  }

  return errors;
}

function validateAndCoerce(cleanedRows, targetTable, targetModule) {
  const schemas = targetModule === 'S1' ? S1_SCHEMAS : targetModule === 'G1' ? G1_SCHEMAS : targetModule === 'E3' ? E3_SCHEMA : E1_SCHEMA;
  const schema = schemas[targetTable];
  if (!schema) return { valid: [], invalid: [] };

  const valid = [];
  const invalid = [];

  for (const row of cleanedRows) {
    // Coerce types
    const coerced = { ...row };
    for (const [field, spec] of Object.entries(schema.fields)) {
      if (coerced[field] === undefined) continue;

      if (spec.type === 'integer') coerced[field] = parseInt(coerced[field]) || 0;
      if (spec.type === 'float') coerced[field] = parseFloat(coerced[field]) || 0;
      if (spec.type === 'string') coerced[field] = String(coerced[field] || '');

      // Clamp enums to closest match
      if (spec.type === 'enum' && spec.values && !spec.values.includes(coerced[field])) {
        const lower = String(coerced[field]).toLowerCase();
        const match = spec.values.find((v) => v.toLowerCase() === lower);
        if (match) coerced[field] = match;
        else if (spec.required) coerced[field] = spec.values[spec.values.length - 1]; // last is usually "Not disclosed" or default
      }
    }

    const errors = validateRow(coerced, schema);
    if (errors.length === 0) {
      valid.push(coerced);
    } else {
      invalid.push({ row: coerced, errors });
    }
  }

  return { valid, invalid };
}

// ─── Full Pipeline Export ───────────────────────────────────

module.exports = {
  mapSchema,
  cleanAndTransform,
  extractDocumentWithAI,
  validateAndCoerce,
  S1_SCHEMAS,
  G1_SCHEMAS,
  E1_SCHEMA,
  E3_SCHEMA,
};
