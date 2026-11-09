/**
 * Tax rules service. Rules live in the TaxRule table, versioned with effective dates and
 * four-eyes approval (plan E2-04). The bundled library.json seeds version 1 on first boot.
 */
const prisma = require('../config/prisma');
const library = require('../rules/library.json');
const { d } = require('../lib/dates');

let cache = null;
let cacheAt = 0;
const TTL = 60 * 1000;

async function load(force = false) {
  if (!force && cache && Date.now() - cacheAt < TTL) return cache;
  try {
    const rows = await prisma.taxRule.findMany({ where: { status: 'APPROVED' }, orderBy: [{ key: 'asc' }, { version: 'desc' }] });
    if (rows.length) {
      cache = rows;
      cacheAt = Date.now();
      return cache;
    }
  } catch (err) {
    console.warn('[rules] DB unavailable, using bundled library:', err.message);
  }
  cache = library.rules.map((r) => ({
    key: r.key, version: 1, effectiveFrom: d(r.effectiveFrom), effectiveTo: null,
    value: r.value, sourceCitation: r.source, status: 'APPROVED', verify: !!r.verify,
  }));
  cacheAt = Date.now();
  return cache;
}

function invalidate() { cache = null; }

/** Seed the bundled library as approved v1 for any key not yet in the DB. Idempotent. */
async function seed() {
  let created = 0;
  for (const r of library.rules) {
    const exists = await prisma.taxRule.findFirst({ where: { key: r.key } });
    if (exists) continue;
    await prisma.taxRule.create({
      data: {
        key: r.key, version: 1, effectiveFrom: d(r.effectiveFrom), value: r.value,
        sourceCitation: r.source + (r.verify ? ' [VERIFY]' : ''),
        changeNote: 'Initial rules library v1', status: 'APPROVED', approvedAt: new Date(),
      },
    });
    created++;
  }
  invalidate();
  return created;
}

/**
 * Get a rule value as of a date. Returns { value, version, key, source }.
 * Picks the highest approved version whose effective window contains `asOf`.
 */
async function getRule(key, asOf = new Date()) {
  const rows = (await load()).filter((r) => r.key === key);
  if (!rows.length) throw new Error(`Tax rule not found: ${key}`);
  const t = d(asOf).getTime();
  const match = rows
    .filter((r) => d(r.effectiveFrom).getTime() <= t && (!r.effectiveTo || d(r.effectiveTo).getTime() >= t))
    .sort((a, b) => b.version - a.version)[0]
    // before the earliest effective date (e.g. PIT before 2028) fall back to the earliest version
    || rows.sort((a, b) => d(a.effectiveFrom) - d(b.effectiveFrom))[0];
  return { key, value: match.value, version: match.version, source: match.sourceCitation, effectiveFrom: match.effectiveFrom };
}

async function get(key, asOf) { return (await getRule(key, asOf)).value; }

/** Resolve several rules at once and return values + a versions map for reproducibility. */
async function resolve(keys, asOf) {
  const values = {};
  const versions = {};
  for (const k of keys) {
    const r = await getRule(k, asOf);
    values[k] = r.value;
    versions[k] = r.version;
  }
  return { values, versions };
}

module.exports = { load, seed, getRule, get, resolve, invalidate, library };

/** All rule values as of a date, plus versions (for storing with a return). */
async function all(asOf) {
  return resolve(library.rules.map((r) => r.key), asOf);
}
module.exports.all = all;
