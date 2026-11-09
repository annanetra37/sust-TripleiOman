'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// sectorLoader.js
// Scans `backend/src/sectors/<sector>/` folders, reads the pack.json + kpis.json
// + materiality.json + factors.json bundles, and upserts the content into the
// database.  Runs on server boot (idempotent) and can be invoked manually via
// CLI (`node src/services/sectorLoader.js reload`).
//
// Design principle (spec §0.3): "Sector packs are data, not code."
// Adding a new sector must NOT require a frontend or backend redeploy — just
// drop a new folder and run the seeder.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const prisma = require('../config/prisma');

const SECTORS_DIR = path.join(__dirname, '..', 'sectors');

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`[sectorLoader] Invalid JSON at ${filePath}: ${err.message}`);
    return null;
  }
}

// List sector keys by scanning the sectors directory.
function listSectorKeys() {
  if (!fs.existsSync(SECTORS_DIR)) return [];
  return fs
    .readdirSync(SECTORS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

// Load one pack's content from disk.  Returns { pack, kpis, materiality, factors }
// or null if the pack.json is missing / invalid.
function loadPackFromDisk(key) {
  const dir = path.join(SECTORS_DIR, key);
  const pack = readJson(path.join(dir, 'pack.json'));
  if (!pack || !pack.key) {
    console.warn(`[sectorLoader] Skipping "${key}" — missing or invalid pack.json`);
    return null;
  }
  const kpis = readJson(path.join(dir, 'kpis.json')) || [];
  const materiality = readJson(path.join(dir, 'materiality.json')) || [];
  const factors = readJson(path.join(dir, 'factors.json')) || [];
  return { pack, kpis, materiality, factors };
}

// Upsert a SectorPack row + its SectorKpi children.  Replaces KPIs on every
// run so renames/removals in the JSON propagate.  Leaves EmissionFactor rows
// intact unless explicitly forced — factor versions are append-only.
async function upsertPack(bundle, { seedFactors = true } = {}) {
  const { pack, kpis, materiality, factors } = bundle;

  const manifest = {
    description: pack.description,
    frameworks: pack.frameworks || [],
    lifecycleStagesActive: pack.lifecycleStagesActive || [],
    functionalUnits: pack.functionalUnits || [],
    reportTemplates: pack.reportTemplates || [],
    materialityStarters: materiality,
    license: pack.license || null,
  };

  const row = await prisma.sectorPack.upsert({
    where: { key: pack.key },
    create: {
      key: pack.key,
      name: pack.name,
      version: pack.version,
      enabled: pack.enabled !== false,
      manifest,
    },
    update: {
      name: pack.name,
      version: pack.version,
      enabled: pack.enabled !== false,
      manifest,
    },
  });

  // Replace KPI set atomically — simpler + safer than diffing.
  await prisma.sectorKpi.deleteMany({ where: { packId: row.id } });
  if (kpis.length > 0) {
    await prisma.sectorKpi.createMany({
      data: kpis.map((k, i) => ({
        packId: row.id,
        code: k.code,
        name: k.name,
        unit: k.unit,
        framework: k.framework,
        category: k.category,
        formula: k.formula || null,
        aggregation: k.aggregation || null,
        sortOrder: k.sortOrder ?? i * 10,
      })),
    });
  }

  let factorsSeeded = 0;
  if (seedFactors && factors.length > 0) {
    for (const f of factors) {
      // No natural key on EmissionFactor — use (source, activityName, region, vintage)
      // as a logical key to avoid duplicates on re-seed.
      const existing = await prisma.emissionFactor.findFirst({
        where: {
          source: f.source,
          activityName: f.activityName,
          region: f.region,
          vintage: f.vintage,
        },
        select: { id: true },
      });
      const data = {
        source: f.source,
        activityName: f.activityName,
        materialClass: f.materialClass || null,
        region: f.region,
        value: f.value,
        unit: f.unit,
        functionalUnit: f.functionalUnit,
        vintage: f.vintage,
        uncertaintyStd: f.uncertaintyStd ?? null,
        notes: f.notes || null,
      };
      if (existing) {
        await prisma.emissionFactor.update({ where: { id: existing.id }, data });
      } else {
        await prisma.emissionFactor.create({ data });
        factorsSeeded++;
      }
    }
  }

  return { packId: row.id, kpisSeeded: kpis.length, factorsSeeded };
}

// Main entry point — load every pack found on disk.  Swallows individual pack
// errors so a malformed pack doesn't prevent boot.
async function loadAllPacks() {
  const keys = listSectorKeys();
  const results = [];
  for (const key of keys) {
    const bundle = loadPackFromDisk(key);
    if (!bundle) continue;
    try {
      const result = await upsertPack(bundle);
      results.push({ key, ok: true, ...result });
      console.log(`[sectorLoader] ${key}: pack v${bundle.pack.version}, ${result.kpisSeeded} KPI(s), ${result.factorsSeeded} new factor(s)`);
    } catch (err) {
      console.error(`[sectorLoader] Failed to load "${key}":`, err.message);
      results.push({ key, ok: false, error: err.message });
    }
  }
  return results;
}

// CLI invocation: `node src/services/sectorLoader.js reload`
if (require.main === module) {
  (async () => {
    const result = await loadAllPacks();
    console.log('[sectorLoader] Done.', JSON.stringify(result, null, 2));
    await prisma.$disconnect();
    process.exit(0);
  })().catch((err) => {
    console.error('[sectorLoader] Fatal:', err);
    process.exit(1);
  });
}

module.exports = {
  loadAllPacks,
  loadPackFromDisk,
  listSectorKeys,
  upsertPack,
  SECTORS_DIR,
};
