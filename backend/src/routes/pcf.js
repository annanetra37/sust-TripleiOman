'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// pcf.js — Product Carbon Footprint routes (PCF-02)
//
//   POST   /api/pcf/products                      — create a product
//   GET    /api/pcf/products                      — list company products
//   GET    /api/pcf/products/:id                  — product detail + BOM + calcs
//   PUT    /api/pcf/products/:id                  — update product metadata
//   DELETE /api/pcf/products/:id                  — delete product + cascade
//   POST   /api/pcf/products/:id/bom-upload       — AI-mapped BOM import
//   POST   /api/pcf/products/:id/bom-generate     — AI BOM from description
//   GET    /api/pcf/factors                       — search emission factors
//   PUT    /api/pcf/bom-items/:id                 — update a single BOM row
//   DELETE /api/pcf/bom-items/:id                 — delete a single BOM row
// ─────────────────────────────────────────────────────────────────────────────

const router = require('express').Router();
const multer = require('multer');
const XLSX = require('xlsx');
const prisma = require('../config/prisma');
const { authenticate } = require('../middleware/auth');
const { requireFeature } = require('../middleware/tier');
const { formatError } = require('../utils/errors');
const { logActivity } = require('../utils/activityLog');
const { trackedAICall } = require('../utils/costTracker');
const { deductCredits } = require('../middleware/credits');
const estimator = require('../utils/estimator');
const config = require('../config');
const Anthropic = require('@anthropic-ai/sdk').default;
const jwt = require('jsonwebtoken');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Auth that also accepts ?token= query param (for PDF/JSON exports opened in new tabs).
async function authWithToken(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return authenticate(req, res, next);
  const token = req.query.token;
  if (token) {
    try {
      const payload = jwt.verify(token, config.jwt.secret);
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, email: true, role: true, isActive: true, companyId: true, firstName: true, lastName: true },
      });
      if (!user || !user.isActive) return res.status(401).json({ error: 'Authentication required.' });
      req.user = user;
      return next();
    } catch { return res.status(401).json({ error: 'Invalid or expired token.' }); }
  }
  return authenticate(req, res, next);
}

router.use(authWithToken);

let aiClient;
function getAI() {
  if (!aiClient) aiClient = new Anthropic({ apiKey: config.anthropic.apiKey });
  return aiClient;
}

// ─── Product CRUD ───────────────────────────────────────────────────────────

router.post('/products', async (req, res) => {
  try {
    const { sku, name, sector, functionalUnit, declaredUnit, massKg, lifetimeYears, orgUnitId, methodology } = req.body;
    if (!sku || !name) return res.status(400).json({ error: 'SKU and name are required.' });

    const product = await prisma.product.create({
      data: {
        companyId: req.user.companyId,
        sku,
        name,
        sector: sector || 'generic',
        functionalUnit: functionalUnit || '1 piece',
        declaredUnit: declaredUnit || functionalUnit || '1 piece',
        massKg: massKg ? parseFloat(massKg) : null,
        lifetimeYears: lifetimeYears ? parseFloat(lifetimeYears) : null,
        orgUnitId: orgUnitId || null,
        methodology: methodology || 'ISO_14067',
      },
    });
    logActivity(req.user.id, req.user.companyId, 'PCF_PRODUCT_CREATE', `Created product ${sku}: ${name}`, { productId: product.id, sku }, req.ip);
    res.status(201).json(product);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: `A product with SKU "${req.body.sku}" already exists.` });
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.get('/products', async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: { companyId: req.user.companyId },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { boms: true, calculations: true } },
        calculations: { orderBy: { runAt: 'desc' }, take: 1, select: { totalKgCo2e: true, primaryDataPct: true, status: true, runAt: true } },
      },
    });
    res.json(products.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      sector: p.sector,
      functionalUnit: p.functionalUnit,
      massKg: p.massKg,
      methodology: p.methodology,
      bomCount: p._count.boms,
      calcCount: p._count.calculations,
      latestCalc: p.calculations[0] || null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })));
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.get('/products/:id', async (req, res) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.id, companyId: req.user.companyId },
      include: {
        boms: {
          orderBy: { sortOrder: 'asc' },
          include: { component: true },
        },
        processes: { orderBy: { lifecycleStage: 'asc' } },
        calculations: { orderBy: { runAt: 'desc' }, take: 10 },
      },
    });
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    res.json(product);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.put('/products/:id', async (req, res) => {
  try {
    const existing = await prisma.product.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!existing) return res.status(404).json({ error: 'Product not found.' });
    const allowed = ['name', 'sector', 'functionalUnit', 'declaredUnit', 'massKg', 'lifetimeYears', 'methodology'];
    const data = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) data[k] = ['massKg', 'lifetimeYears'].includes(k) ? (req.body[k] ? parseFloat(req.body[k]) : null) : req.body[k];
    }
    const updated = await prisma.product.update({ where: { id: req.params.id }, data });
    res.json(updated);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.delete('/products/:id', async (req, res) => {
  try {
    const existing = await prisma.product.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!existing) return res.status(404).json({ error: 'Product not found.' });
    await prisma.product.delete({ where: { id: req.params.id } });
    logActivity(req.user.id, req.user.companyId, 'PCF_PRODUCT_DELETE', `Deleted product ${existing.sku}: ${existing.name}`, { productId: existing.id, sku: existing.sku }, req.ip);
    res.json({ message: 'Product deleted.' });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── BOM Upload with AI Material Classifier ─────────────────────────────────

router.post('/products/:id/bom-upload', upload.single('file'), async (req, res) => {
  try {
    const product = await prisma.product.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    if (!req.file) return res.status(400).json({ error: 'No file provided.' });

    // Credit check
    const creditCost = 2; // PCF_BOM_UPLOAD flat rate
    const company = await prisma.company.findUnique({ where: { id: req.user.companyId }, select: { creditBalance: true } });
    if ((company?.creditBalance ?? 0) < creditCost) {
      return res.status(403).json({ error: 'Insufficient credits', required: creditCost, available: company?.creditBalance ?? 0 });
    }

    // Parse Excel/CSV
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (rawRows.length === 0) return res.status(400).json({ error: 'File is empty or unreadable.' });

    const columns = Object.keys(rawRows[0]);
    const sampleRows = rawRows.slice(0, 8);

    // Step 1: AI schema mapping + material classification
    const classifierPrompt = `You are a sustainability and materials expert. You are given a Bill of Materials (BOM) spreadsheet for a ${product.sector} product.

## Source Columns
${JSON.stringify(columns)}

## Sample Rows (up to 8)
${JSON.stringify(sampleRows, null, 2)}

## Your Task
For EACH row in the data, classify and map the fields:

1. **componentName**: The component or part name (from the most descriptive column)
2. **materialClass**: A normalised material tag matching one of these known classes (pick the closest):
   aluminum_6061, aluminum_6061_rec, aluminum_adc12, copper_primary, copper_recycled, copper_wire,
   steel_low_alloy, steel_304, gold, silver, tin, tantalum, tungsten, nickel,
   pcb_fr4_1_2_layer, pcb_fr4_4_layer, pcb_fr4_6_layer, pcb_fr4_8_layer, solder_sac305,
   si_wafer_300mm, si_wafer_200mm, dram_ddr4_8gb, dram_ddr5_16gb, nand_512gb_tlc, nand_1tb_qlc,
   mcu_lowpower, cpu_server, capacitor_elec, capacitor_mlcc, resistor_smd, connector,
   li_ion_nmc, li_ion_lfp, nimh_battery,
   plastic_pc, plastic_abs, plastic_hdpe, plastic_pp, plastic_pvc,
   packaging_cardboard, packaging_eps,
   grid_electricity_vn, grid_electricity_my, grid_electricity_cn, grid_electricity_tw, grid_electricity_us, grid_electricity_eu, grid_electricity_de,
   natural_gas, fuel_diesel,
   OTHER (use "other_<description>" if nothing matches)
3. **quantity**: The numeric quantity (weight, count, length, area)
4. **unit**: The unit (kg, pcs, m, m2, kWh, etc.)
5. **lifecycleStage**: One of A1 (raw material), A2 (transport), A3 (manufacturing), A4 (distribution), B1 (use), C1 (end-of-life). Default A1 for raw materials/components.
6. **supplierName**: If a supplier/vendor column exists
7. **originCountry**: If a country/origin column exists (ISO 2-letter or full name)
8. **confidence**: 0.0 to 1.0 — how confident you are in the materialClass mapping

Handle ANY language, abbreviations, part numbers mixed with descriptions. Map EVERY row, never skip.

Return ONLY valid JSON array:
[
  {
    "rowIndex": 0,
    "componentName": "PCB Main Board 6-layer",
    "materialClass": "pcb_fr4_6_layer",
    "quantity": 0.045,
    "unit": "kg",
    "lifecycleStage": "A1",
    "supplierName": "Foxconn",
    "originCountry": "TW",
    "confidence": 0.92,
    "originalText": "first 80 chars of the source row for traceability"
  }
]`;

    const costCtx = {
      companyId: req.user.companyId,
      userId: req.user.id,
      operation: 'PCF_BOM_CLASSIFY',
      metadata: { productId: product.id, sku: product.sku, rowCount: rawRows.length },
    };

    // Send ALL rows (capped at 500) to the classifier
    const fullPrompt = `${classifierPrompt}\n\n## ALL ROWS (${rawRows.length} total)\n${JSON.stringify(rawRows.slice(0, 500), null, 2)}`;
    const response = await trackedAICall(
      getAI(),
      { model: config.anthropic.model, max_tokens: 8192, thinking: { type: 'disabled' }, messages: [{ role: 'user', content: fullPrompt }] },
      costCtx,
    );

    const aiText = response.content.find((b) => b.type === 'text')?.text || '';
    const jsonMatch = aiText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return res.status(500).json({ error: 'AI classifier returned unparseable response.' });

    let classified;
    try { classified = JSON.parse(jsonMatch[0]); } catch { return res.status(500).json({ error: 'AI response is not valid JSON.' }); }

    // Step 2: For each classified row, find/create Component + BOM item
    // Clear existing BOM for this product (full replace on re-upload)
    await prisma.billOfMaterialsItem.deleteMany({ where: { productId: product.id } });

    const results = [];
    for (let i = 0; i < classified.length; i++) {
      const row = classified[i];
      if (!row.componentName || !row.materialClass) continue;

      // Find or create Component
      let component = await prisma.component.findFirst({
        where: { companyId: req.user.companyId, name: row.componentName, materialClass: row.materialClass },
      });
      if (!component) {
        component = await prisma.component.create({
          data: {
            companyId: req.user.companyId,
            name: row.componentName,
            materialClass: row.materialClass,
            supplierName: row.supplierName || null,
            originCountry: row.originCountry || null,
          },
        });
      }

      // Find best matching EmissionFactor
      const factor = await prisma.emissionFactor.findFirst({
        where: { materialClass: row.materialClass },
        orderBy: { vintage: 'desc' },
      });

      const bomItem = await prisma.billOfMaterialsItem.create({
        data: {
          productId: product.id,
          componentId: component.id,
          quantity: parseFloat(row.quantity) || 0,
          unit: row.unit || 'kg',
          lifecycleStage: row.lifecycleStage || 'A1',
          chosenFactorId: factor?.id || null,
          sortOrder: i,
        },
      });

      results.push({
        bomItemId: bomItem.id,
        rowIndex: row.rowIndex ?? i,
        componentName: row.componentName,
        materialClass: row.materialClass,
        quantity: bomItem.quantity,
        unit: bomItem.unit,
        lifecycleStage: bomItem.lifecycleStage,
        supplierName: row.supplierName || null,
        originCountry: row.originCountry || null,
        confidence: row.confidence ?? 0,
        originalText: row.originalText || '',
        factor: factor ? { id: factor.id, value: factor.value, unit: factor.unit, source: factor.source } : null,
        componentId: component.id,
      });
    }

    // Deduct credits
    await deductCredits(req.user.companyId, req.user.id, creditCost, 'PCF_BOM_UPLOAD',
      `BOM upload for ${product.sku}: ${results.length} components classified — ${creditCost} credits`, null);

    logActivity(req.user.id, req.user.companyId, 'PCF_BOM_UPLOAD',
      `BOM uploaded for product ${product.sku}: ${rawRows.length} rows → ${results.length} classified components`,
      { productId: product.id, sku: product.sku, inputRows: rawRows.length, classified: results.length }, req.ip);

    res.json({
      productId: product.id,
      inputRows: rawRows.length,
      classifiedRows: results.length,
      items: results,
    });
  } catch (err) {
    console.error('[PCF] BOM upload error:', err);
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── AI BOM Generator — no spreadsheet required ─────────────────────────────
// For customers who don't have a formal BOM ready.  User supplies a natural-
// language description of the product (and any structural hints they have)
// and Claude proposes a BOM using the same canonical materialClass tags the
// upload path uses.  The user reviews + edits in the same confidence table.
//
// Same 2-credit cost as bom-upload — the work is equivalent.
router.post('/products/:id/bom-generate', async (req, res) => {
  try {
    const product = await prisma.product.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    const { description, massHint, originCountry, supplierHint } = req.body || {};
    if (!description || description.trim().length < 15) {
      return res.status(400).json({ error: 'Description is required (at least 15 characters). Describe the product, its form factor, and any known components.' });
    }

    const creditCost = 2;
    const company = await prisma.company.findUnique({ where: { id: req.user.companyId }, select: { creditBalance: true } });
    if ((company?.creditBalance ?? 0) < creditCost) {
      return res.status(403).json({ error: 'Insufficient credits', required: creditCost, available: company?.creditBalance ?? 0 });
    }

    const prompt = `You are a Life Cycle Assessment expert proposing a realistic Bill of Materials for a product based on an engineer's description. Use industry-standard assumptions from published LCA studies.

## Product metadata
- SKU: ${product.sku}
- Name: ${product.name}
- Sector: ${product.sector}
- Functional unit: ${product.functionalUnit}
- Total product mass (kg): ${product.massKg ?? massHint ?? 'unknown — infer from the description'}
- Lifetime (years): ${product.lifetimeYears ?? 'unknown'}

## User's description
${description}

${supplierHint ? `## Known supplier(s)\n${supplierHint}\n` : ''}${originCountry ? `## Assembly country\n${originCountry}\n` : ''}

## Your task
Propose a realistic Bill of Materials.  Return every component you expect to be present, with realistic quantities that SUM to the total product mass (if known).  Use industry-standard proportions for electronics (e.g., a consumer SSD is ~40% enclosure metal, ~25% PCB, ~20% NAND/DRAM chips, ~10% connectors + passives, ~5% packaging).

For EACH component, map to the closest canonical materialClass from this list:
aluminum_6061, aluminum_6061_rec, aluminum_adc12, copper_primary, copper_recycled, copper_wire,
steel_low_alloy, steel_304, gold, silver, tin, tantalum, tungsten, nickel,
pcb_fr4_1_2_layer, pcb_fr4_4_layer, pcb_fr4_6_layer, pcb_fr4_8_layer, solder_sac305,
si_wafer_300mm, si_wafer_200mm, dram_ddr4_8gb, dram_ddr5_16gb, nand_512gb_tlc, nand_1tb_qlc,
mcu_lowpower, cpu_server, capacitor_elec, capacitor_mlcc, resistor_smd, connector,
li_ion_nmc, li_ion_lfp, nimh_battery,
plastic_pc, plastic_abs, plastic_hdpe, plastic_pp, plastic_pvc,
packaging_cardboard, packaging_eps,
grid_electricity_vn, grid_electricity_my, grid_electricity_cn, grid_electricity_tw, grid_electricity_us, grid_electricity_eu, grid_electricity_de,
natural_gas, fuel_diesel.
Use "other_<description>" only if genuinely nothing matches.

For each row, also provide:
- componentName: short descriptive name
- quantity: numeric
- unit: "kg" for mass-based, "pcs" for counted parts, "kWh" for energy, "m" for cable, "m2" for surface area
- lifecycleStage: A1 (raw material) | A2 (inbound transport) | A3 (manufacturing/assembly energy) | A4 (distribution) | B1 (use phase) | C1 (end-of-life)
- confidence: 0.0–1.0 — your certainty given the description (use a LOW confidence for things you're guessing, high for things explicitly stated)
- reasoning: one-line rationale

Include A3 "assembly energy" as a ProcessStep-style row using grid_electricity_* based on originCountry (if provided), typically 10-30 kWh for small consumer electronics, 50-200 kWh for larger devices.

Return ONLY valid JSON array:
[
  {
    "componentName": "Aluminum enclosure casing",
    "materialClass": "aluminum_6061",
    "quantity": 0.048,
    "unit": "kg",
    "lifecycleStage": "A1",
    "confidence": 0.75,
    "reasoning": "Typical consumer SSD enclosure is machined aluminum, ~40% of 120g body"
  }
]`;

    const costCtx = {
      companyId: req.user.companyId,
      userId: req.user.id,
      operation: 'PCF_BOM_GENERATE',
      metadata: { productId: product.id, sku: product.sku, descriptionLength: description.length },
    };

    const response = await trackedAICall(
      getAI(),
      { model: config.anthropic.model, max_tokens: 8192, thinking: { type: 'disabled' }, messages: [{ role: 'user', content: prompt }] },
      costCtx,
    );

    const aiText = response.content.find((b) => b.type === 'text')?.text || '';
    const jsonMatch = aiText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return res.status(500).json({ error: 'AI BOM generator returned unparseable response.' });

    let proposed;
    try { proposed = JSON.parse(jsonMatch[0]); } catch {
      return res.status(500).json({ error: 'AI response is not valid JSON.' });
    }

    // Clear existing BOM (a generated BOM replaces any prior BOM for this
    // product — users who want to merge should keep the previous upload).
    await prisma.billOfMaterialsItem.deleteMany({ where: { productId: product.id } });

    const results = [];
    for (let i = 0; i < proposed.length; i++) {
      const row = proposed[i];
      if (!row.componentName || !row.materialClass) continue;

      let component = await prisma.component.findFirst({
        where: { companyId: req.user.companyId, name: row.componentName, materialClass: row.materialClass },
      });
      if (!component) {
        component = await prisma.component.create({
          data: {
            companyId: req.user.companyId,
            name: row.componentName,
            materialClass: row.materialClass,
            supplierName: supplierHint || null,
            originCountry: originCountry || null,
            primaryDataFlag: false, // AI-generated — never primary data
          },
        });
      }

      // Match factor.  For grid_electricity_*, region is implicit in the class.
      const factor = await prisma.emissionFactor.findFirst({
        where: { materialClass: row.materialClass },
        orderBy: { vintage: 'desc' },
      });

      const bomItem = await prisma.billOfMaterialsItem.create({
        data: {
          productId: product.id,
          componentId: component.id,
          quantity: parseFloat(row.quantity) || 0,
          unit: row.unit || 'kg',
          lifecycleStage: row.lifecycleStage || 'A1',
          chosenFactorId: factor?.id || null,
          sortOrder: i,
        },
      });

      results.push({
        bomItemId: bomItem.id,
        rowIndex: i,
        componentName: row.componentName,
        materialClass: row.materialClass,
        quantity: bomItem.quantity,
        unit: bomItem.unit,
        lifecycleStage: bomItem.lifecycleStage,
        confidence: row.confidence ?? 0.5,
        reasoning: row.reasoning || '',
        originalText: row.reasoning || '',
        factor: factor ? { id: factor.id, value: factor.value, unit: factor.unit, source: factor.source } : null,
        componentId: component.id,
      });
    }

    await deductCredits(req.user.companyId, req.user.id, creditCost, 'PCF_BOM_GENERATE',
      `AI BOM generation for ${product.sku}: ${results.length} components proposed — ${creditCost} credits`, null);

    logActivity(req.user.id, req.user.companyId, 'PCF_BOM_GENERATE',
      `AI BOM generated for product ${product.sku}: ${results.length} components from description`,
      { productId: product.id, sku: product.sku, componentsProposed: results.length, descriptionLength: description.length }, req.ip);

    res.json({
      productId: product.id,
      generated: true,
      classifiedRows: results.length,
      items: results,
    });
  } catch (err) {
    console.error('[PCF] BOM generate error:', err);
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── BOM Item inline edit ───────────────────────────────────────────────────

router.put('/bom-items/:id', async (req, res) => {
  try {
    const item = await prisma.billOfMaterialsItem.findUnique({
      where: { id: req.params.id },
      include: { product: { select: { companyId: true } } },
    });
    if (!item || item.product.companyId !== req.user.companyId) {
      return res.status(404).json({ error: 'BOM item not found.' });
    }
    const data = {};
    if (req.body.quantity !== undefined) data.quantity = parseFloat(req.body.quantity);
    if (req.body.unit !== undefined) data.unit = req.body.unit;
    if (req.body.lifecycleStage !== undefined) data.lifecycleStage = req.body.lifecycleStage;
    if (req.body.scrapRatePct !== undefined) data.scrapRatePct = parseFloat(req.body.scrapRatePct);
    if (req.body.chosenFactorId !== undefined) data.chosenFactorId = req.body.chosenFactorId || null;

    const updated = await prisma.billOfMaterialsItem.update({ where: { id: req.params.id }, data });
    res.json(updated);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.delete('/bom-items/:id', async (req, res) => {
  try {
    const item = await prisma.billOfMaterialsItem.findUnique({
      where: { id: req.params.id },
      include: { product: { select: { companyId: true } } },
    });
    if (!item || item.product.companyId !== req.user.companyId) {
      return res.status(404).json({ error: 'BOM item not found.' });
    }
    await prisma.billOfMaterialsItem.delete({ where: { id: req.params.id } });
    res.json({ message: 'BOM item deleted.' });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Emission Factor search ─────────────────────────────────────────────────

router.get('/factors', async (req, res) => {
  try {
    const { q, materialClass, region, limit } = req.query;
    const where = {};
    if (materialClass) where.materialClass = materialClass;
    if (region) where.region = region;
    if (q) {
      where.OR = [
        { activityName: { contains: q, mode: 'insensitive' } },
        { materialClass: { contains: q, mode: 'insensitive' } },
      ];
    }
    const factors = await prisma.emissionFactor.findMany({
      where,
      orderBy: [{ vintage: 'desc' }, { activityName: 'asc' }],
      take: parseInt(limit) || 20,
    });
    res.json(factors);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── PCF Calculation (PCF-03) ───────────────────────────────────────────────

const pcfEngine = require('../services/pcfEngine');

router.post('/products/:id/calculate', async (req, res) => {
  try {
    const product = await prisma.product.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    // Credit check — 1 credit per calculation run
    const creditCost = 1;
    const company = await prisma.company.findUnique({ where: { id: req.user.companyId }, select: { creditBalance: true } });
    if ((company?.creditBalance ?? 0) < creditCost) {
      return res.status(403).json({ error: 'Insufficient credits', required: creditCost, available: company?.creditBalance ?? 0 });
    }

    const calc = await pcfEngine.runAndSave(product.id);

    await deductCredits(req.user.companyId, req.user.id, creditCost, 'PCF_CALCULATION',
      `PCF calc for ${product.sku}: ${calc.totalKgCo2e} kgCO2e — ${creditCost} credit`, null);

    logActivity(req.user.id, req.user.companyId, 'PCF_CALCULATE',
      `Calculated PCF for ${product.sku}: ${calc.totalKgCo2e} kgCO2e (p5=${calc.uncertaintyLow}, p95=${calc.uncertaintyHigh})`,
      { productId: product.id, calculationId: calc.id }, req.ip);

    res.json(calc);
  } catch (err) {
    console.error('[PCF] Calculation error:', err);
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── PCF What-If Simulator (PCF-04) ─────────────────────────────────────────
// Stateless — nothing is persisted.  Runs the engine twice (baseline +
// scenario) in memory and returns a diff.  No credit cost.

router.post('/products/:id/simulate', async (req, res) => {
  try {
    const product = await prisma.product.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    const overrides = req.body || {};
    // Basic shape validation — reject unknown top-level keys to fail fast
    // on client bugs instead of silently ignoring them.
    const allowedKeys = new Set(['factorSwaps', 'materialSwaps', 'scrapRateChanges', 'processOverrides', 'regionSwap']);
    for (const k of Object.keys(overrides)) {
      if (!allowedKeys.has(k)) {
        return res.status(400).json({ error: `Unknown override key: "${k}". Allowed: ${[...allowedKeys].join(', ')}` });
      }
    }

    const result = await pcfEngine.simulatePcf(product.id, overrides);
    res.json(result);
  } catch (err) {
    console.error('[PCF] Simulate error:', err);
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Saved Scenarios (PCF-04 extension) ─────────────────────────────────────
// Save, list, and delete what-if scenarios so users can revisit them.

router.post('/products/:id/scenarios', async (req, res) => {
  try {
    const product = await prisma.product.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    const { name, overrides } = req.body || {};
    if (!name || !overrides) return res.status(400).json({ error: 'Name and overrides are required.' });

    // Run the simulator to capture the results at save-time.
    const sim = await pcfEngine.simulatePcf(product.id, overrides);

    const scenario = await prisma.savedScenario.create({
      data: {
        productId: product.id,
        name,
        overrides,
        baselineResult: sim.baseline,
        scenarioResult: sim.scenario,
        deltaKgCo2e: sim.delta.kgCo2e,
        deltaPct: sim.delta.pct,
      },
    });

    logActivity(req.user.id, req.user.companyId, 'PCF_SCENARIO_SAVE',
      `Saved what-if scenario "${name}" for ${product.sku}: delta ${sim.delta.kgCo2e} kgCO2e (${sim.delta.pct}%)`,
      { productId: product.id, scenarioId: scenario.id }, req.ip);

    res.status(201).json(scenario);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.get('/products/:id/scenarios', async (req, res) => {
  try {
    const product = await prisma.product.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    const scenarios = await prisma.savedScenario.findMany({
      where: { productId: product.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json(scenarios);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.delete('/scenarios/:scenarioId', async (req, res) => {
  try {
    const scenario = await prisma.savedScenario.findUnique({
      where: { id: req.params.scenarioId },
      include: { product: { select: { companyId: true, sku: true } } },
    });
    if (!scenario || scenario.product.companyId !== req.user.companyId) {
      return res.status(404).json({ error: 'Scenario not found.' });
    }
    await prisma.savedScenario.delete({ where: { id: req.params.scenarioId } });
    res.json({ message: 'Scenario deleted.' });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── PCF Export — PDF + PACT JSON (PCF-07) ──────────────────────────────────

const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

router.get('/calculations/:calcId/export', async (req, res) => {
  try {
    const calc = await prisma.pcfCalculation.findUnique({
      where: { id: req.params.calcId },
      include: { product: { include: { company: true } } },
    });
    if (!calc || calc.product.companyId !== req.user.companyId) {
      return res.status(404).json({ error: 'Calculation not found.' });
    }

    const format = (req.query.format || 'pdf').toLowerCase();
    const product = calc.product;
    const company = product.company;

    // ─── PACT Pathfinder v2 JSON ────────────────────────────────
    if (format === 'json' || format === 'pact') {
      const pact = {
        specVersion: '2.0.0',
        id: calc.id,
        version: 1,
        created: calc.runAt.toISOString(),
        status: calc.status === 'verified' ? 'Active' : 'Draft',
        companyName: company.name,
        companyIds: company.tickerSymbol ? [`urn:epc:id:sgln:${company.tickerSymbol}`] : [],
        productDescription: product.name,
        productIds: [`urn:sku:${product.sku}`],
        productCategoryCpc: '',
        productNameCompany: product.name,
        comment: `Calculated by Triple I ESG Portal (engine v${calc.engineVersion})`,
        pcf: {
          declaredUnit: product.declaredUnit || product.functionalUnit,
          unitaryProductAmount: '1',
          referencePeriodStart: `${new Date(calc.runAt).getFullYear()}-01-01T00:00:00Z`,
          referencePeriodEnd: `${new Date(calc.runAt).getFullYear()}-12-31T23:59:59Z`,
          pcfExcludingBiogenic: String(calc.totalKgCo2e),
          pcfIncludingBiogenic: String(calc.totalKgCo2e),
          fossilGhgEmissions: String(calc.totalKgCo2e),
          biogenicCarbonContent: '0',
          biogenicCarbonEmissionsOtherThanCO2: '0',
          biogenicCarbonWithdrawal: '0',
          dlucGhgEmissions: '0',
          landManagementGhgEmissions: '0',
          otherBiogenicGhgEmissions: '0',
          ipcSubCategory: '',
          boundaryProcessesDescription: 'Cradle-to-gate (A1-A3)',
          characterizationFactors: 'AR6',
          crossSectoralStandardsUsed: [product.methodology || 'ISO Standard 14067'],
          productOrSectorSpecificRules: [],
          exemptedEmissionsPercent: 0,
          exemptedEmissionsDescription: '',
          primaryDataShare: calc.primaryDataPct,
          secondaryEmissionFactorSources: [...new Set((calc.factorSnapshot || []).map((f) => f.source))],
          uncertaintyAssessmentDescription: `Monte Carlo (${1000} iterations): p5=${calc.uncertaintyLow}, p50=${calc.totalKgCo2e}, p95=${calc.uncertaintyHigh}`,
        },
        assurance: calc.status === 'verified'
          ? { coverage: 'product line', level: 'limited', boundary: 'Cradle-to-Gate' }
          : null,
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${product.sku}_PCF_PACT.json"`);
      return res.json(pact);
    }

    // ─── PDF Product Carbon Footprint Statement ─────────────────
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${product.sku}_PCF_Statement.pdf"`);
    doc.pipe(res);

    // Company logo
    if (company.logoPath) {
      const uploadsDir = path.join(__dirname, '../../uploads');
      const logoFile = path.join(uploadsDir, company.logoPath);
      try {
        if (fs.existsSync(logoFile)) {
          doc.image(logoFile, { fit: [120, 60], align: 'left' });
          doc.moveDown(1);
        }
      } catch {}
    }

    // Title
    doc.fontSize(22).font('Helvetica-Bold').fillColor('#003700')
       .text('Product Carbon Footprint Statement', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica').fillColor('#666')
       .text(`${product.name} (${product.sku})`, { align: 'center' });
    doc.moveDown(2);

    // Summary box
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#003700').text('Summary');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor('#333');
    doc.text(`Declared unit: ${product.declaredUnit || product.functionalUnit}`);
    doc.text(`Methodology: ${product.methodology}`);
    doc.text(`Boundary: Cradle-to-gate (A1–A3)`);
    doc.text(`Calculation date: ${new Date(calc.runAt).toLocaleDateString()}`);
    doc.text(`Engine version: ${calc.engineVersion}`);
    doc.text(`Status: ${calc.status}`);
    doc.moveDown(1);

    // Big number
    doc.fontSize(28).font('Helvetica-Bold').fillColor('#003700')
       .text(`${calc.totalKgCo2e} kgCO2e`, { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor('#666')
       .text(`Uncertainty range: ${calc.uncertaintyLow} – ${calc.uncertaintyHigh} kgCO2e (p5–p95)`, { align: 'center' });
    doc.text(`Primary data share: ${Math.round(calc.primaryDataPct * 100)}%`, { align: 'center' });
    doc.moveDown(2);

    // Breakdown by lifecycle stage
    const stages = calc.breakdownByStage || {};
    if (Object.keys(stages).length > 0) {
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#003700').text('Lifecycle Stage Breakdown');
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica').fillColor('#333');
      for (const [stage, kg] of Object.entries(stages)) {
        const pct = calc.totalKgCo2e > 0 ? ((kg / calc.totalKgCo2e) * 100).toFixed(1) : '0';
        doc.text(`  ${stage}: ${kg} kgCO2e (${pct}%)`, { indent: 15 });
      }
      doc.moveDown(1);
    }

    // Top 10 components
    const comps = (calc.breakdownByComp || []).slice(0, 10);
    if (comps.length > 0) {
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#003700').text('Top Contributing Components');
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica').fillColor('#333');
      for (const c of comps) {
        doc.text(`  ${c.name} (${c.materialClass}): ${c.kgCo2e} kgCO2e — ${c.pct}%`, { indent: 15 });
      }
      doc.moveDown(1);
    }

    // Footer
    doc.moveDown(2);
    doc.fontSize(8).fillColor('#999')
       .text(`Generated by Triple I ESG Portal on ${new Date().toISOString().split('T')[0]}.`, { align: 'center' });
    doc.text(`${company.name} | ${product.sku} | Confidential`, { align: 'center' });

    doc.end();
  } catch (err) {
    console.error('[PCF] Export error:', err);
    if (!res.headersSent) {
      const { status, error } = formatError(err);
      res.status(status).json({ error });
    }
  }
});

module.exports = router;
