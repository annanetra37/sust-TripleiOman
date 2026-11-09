'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// buildingEnergy.js — shared fuel → kWh → kgCO₂e conversion for buildings
//
// Single source of truth for building energy maths.  The Building Energy page
// (GET /api/real-estate/assets/:id/intensity), the CRREM engine and the ROI
// module all call this module, so the same bill always yields the same kWh on
// every screen.
//
// Every factor carries { value, source, year, status }:
//   status 'standard'        — physical constant or published default (IPCC)
//   status 'legacy'          — value inherited from earlier Triple I code,
//                              source not documented; replace when possible
//   status 'pending_source'  — country value not yet supplied; value is null
//                              and the default for the fuel is used instead,
//                              with a warning in the response
//
// Armenian factors (BE-4) live in data/buildingEnergyFactors.json so the
// energy expert can fill in sourced values without a code change.
// ─────────────────────────────────────────────────────────────────────────────

const path = require('path');
const fs = require('fs');

const KWH_PER_TJ = 277777.78;

// ─── Fuels and accepted units ───────────────────────────────────────────────

const FUELS = {
  electricity:   { label: 'Electricity',            units: ['kWh', 'MWh'] },
  natural_gas:   { label: 'Natural gas',            units: ['m3', 'kWh'] },
  district_heat: { label: 'District heat',          units: ['kWh', 'MWh', 'Gcal'] },
  district_cool: { label: 'District cooling',       units: ['kWh', 'MWh'] },
  lpg:           { label: 'LPG',                    units: ['litre', 'kg'] },
  biomass:       { label: 'Wood / biomass',         units: ['kg', 'm3'] },
  oil:           { label: 'Diesel / heating oil',   units: ['litre'] },
};

// Normalise free-text units to the canonical spellings above.
function normaliseUnit(unit) {
  const u = String(unit || '').trim().toLowerCase().replace(/\s+/g, '').replace('³', '3');
  if (u === 'kwh') return 'kWh';
  if (u === 'mwh') return 'MWh';
  if (u === 'gcal') return 'Gcal';
  if (u === 'm3' || u === 'nm3' || u === 'scm' || u === 'm3stacked' || u === 'stackedm3' || u === 'm3_stacked') return 'm3';
  if (u === 'l' || u === 'litre' || u === 'liter' || u === 'litres' || u === 'liters') return 'litre';
  if (u === 'kg') return 'kg';
  return null;
}

function isValidFuel(fuel) {
  return Object.prototype.hasOwnProperty.call(FUELS, fuel);
}

function isValidUnit(fuel, unit) {
  const n = normaliseUnit(unit);
  return !!n && isValidFuel(fuel) && FUELS[fuel].units.includes(n);
}

// ─── Default factors ────────────────────────────────────────────────────────

const IPCC = 'IPCC 2006 Guidelines, Vol. 2 Energy, Tables 1.2 / 1.4 (default NCV and CO₂ factor)';
const PHYS = 'Unit definition';
const LEGACY = 'Legacy Triple I default (earlier crremEngine code) — source not documented';

const std = (value, source, year = null) => ({ value, source, year, status: 'standard' });
const legacy = (value) => ({ value, source: LEGACY, year: null, status: 'legacy' });

// kWh per unit, by fuel → unit.
const DEFAULT_TO_KWH = {
  electricity:   { kWh: std(1, PHYS), MWh: std(1000, PHYS) },
  natural_gas:   { kWh: std(1, PHYS), m3: legacy(10.55) },
  district_heat: { kWh: std(1, PHYS), MWh: std(1000, PHYS), Gcal: std(1163, PHYS) },
  district_cool: { kWh: std(1, PHYS), MWh: std(1000, PHYS) },
  // IPCC default NCVs: LPG 47.3 TJ/Gg, wood 15.6 TJ/Gg (per kg = TJ/Gg / 1e6).
  lpg:           { kg: std(47.3e-6 * KWH_PER_TJ, IPCC, 2006), litre: { value: null, source: 'Needs LPG density — not yet sourced', year: null, status: 'pending_source' } },
  biomass:       { kg: std(15.6e-6 * KWH_PER_TJ, IPCC, 2006), m3: { value: null, source: 'Needs stacked-wood density — not yet sourced', year: null, status: 'pending_source' } },
  oil:           { litre: legacy(10) },
};

// kgCO₂ per kWh of fuel (CO₂ only for combustion fuels, IPCC defaults).
const DEFAULT_EMISSION = {
  natural_gas:   std(56100 / KWH_PER_TJ, IPCC, 2006),                  // 56,100 kg/TJ
  lpg:           std(63100 / KWH_PER_TJ, IPCC, 2006),                  // 63,100 kg/TJ
  oil:           std(74100 / KWH_PER_TJ, IPCC, 2006),                  // 74,100 kg/TJ (gas/diesel oil)
  biomass:       std(112000 / KWH_PER_TJ, IPCC, 2006),                 // biogenic — reported separately
  district_heat: legacy(0.15),
  district_cool: legacy(0.05),
};

// Grid factors (kgCO₂e/kWh) — inherited from the CRREM engine.
const DEFAULT_GRID = {
  DE: legacy(0.381), FR: legacy(0.052), NL: legacy(0.328), US: legacy(0.389),
  UK: legacy(0.207), EU: legacy(0.238), CN: legacy(0.612), GLO: legacy(0.450),
};

const BIOGENIC_FUELS = new Set(['biomass']);

// ─── Country overrides (data/buildingEnergyFactors.json) ────────────────────

let countryCache = null;
function loadCountryFactors() {
  if (countryCache) return countryCache;
  const file = path.join(__dirname, '..', 'data', 'buildingEnergyFactors.json');
  try {
    countryCache = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).countries || {} : {};
  } catch (err) {
    console.error('[buildingEnergy] Failed to read buildingEnergyFactors.json:', err.message);
    countryCache = {};
  }
  return countryCache;
}

// Test hook — lets unit tests inject country factors.
function _setCountryFactors(countries) { countryCache = countries; }

function countryEntry(country, group, key) {
  const c = loadCountryFactors()[String(country || '').toUpperCase()];
  return c && c[group] ? c[group][key] : undefined;
}

// Pick the country value when it is sourced, else the default plus a warning.
function resolve(countryValue, defaultValue, what, country) {
  if (countryValue && countryValue.value != null) {
    return { factor: { ...countryValue, status: countryValue.status || 'sourced', country }, warning: null };
  }
  if (countryValue && countryValue.value == null) {
    const fallback = defaultValue && defaultValue.value != null
      ? ` — using default ${round(defaultValue.value, 4)} (${defaultValue.status})`
      : '';
    return {
      factor: defaultValue,
      warning: `${country} ${what} is pending a published source${fallback}.`,
    };
  }
  return { factor: defaultValue, warning: null };
}

/** kWh per unit for a fuel/unit in a country. */
function conversionFactor(fuel, unit, country) {
  const u = normaliseUnit(unit);
  const def = DEFAULT_TO_KWH[fuel] && DEFAULT_TO_KWH[fuel][u];
  return resolve(countryEntry(country, 'toKwh', `${fuel}:${u}`), def, `${FUELS[fuel]?.label || fuel} conversion (${u} → kWh)`, country);
}

/** kgCO₂e per kWh for a fuel in a country. */
function emissionFactor(fuel, country) {
  if (fuel === 'electricity') {
    const cc = String(country || '').toUpperCase();
    return resolve(countryEntry(cc, 'emission', 'electricity'), DEFAULT_GRID[cc] || DEFAULT_GRID.GLO, 'electricity grid factor', cc);
  }
  return resolve(countryEntry(country, 'emission', fuel), DEFAULT_EMISSION[fuel], `${FUELS[fuel]?.label || fuel} emission factor`, country);
}

/**
 * Convert one record to kWh and kgCO₂e.
 * Returns { kwh, kgCo2e, biogenicKgCo2, factors: [...], warnings: [...] }.
 * kwh is null when no conversion factor exists for the unit.
 */
function convertRecord(record, country) {
  const warnings = [];
  const conv = conversionFactor(record.fuel, record.unit, country);
  const em = emissionFactor(record.fuel, country);
  if (conv.warning) warnings.push(conv.warning);
  if (em.warning) warnings.push(em.warning);

  const toKwh = conv.factor && conv.factor.value != null ? conv.factor.value : null;
  if (toKwh == null) {
    warnings.push(`No kWh conversion for ${FUELS[record.fuel]?.label || record.fuel} in ${normaliseUnit(record.unit) || record.unit}; record excluded.`);
    return { kwh: null, kgCo2e: 0, biogenicKgCo2: 0, toKwh: null, kgCo2ePerKwh: null, convFactor: conv.factor, emFactor: em.factor, warnings };
  }
  const kwh = record.quantity * toKwh;
  const ef = em.factor && em.factor.value != null ? em.factor.value : 0;
  const biogenic = BIOGENIC_FUELS.has(record.fuel);
  return {
    kwh,
    kgCo2e: biogenic ? 0 : kwh * ef,
    biogenicKgCo2: biogenic ? kwh * ef : 0,
    toKwh,
    kgCo2ePerKwh: ef,
    convFactor: conv.factor,
    emFactor: em.factor,
    warnings,
  };
}

/**
 * Unit-only kWh conversion for callers that do not know the fuel (ROI module).
 * Gas volumes use the natural-gas factor for the given country.
 */
function unitToKwh(quantity, unit, country = 'GLO') {
  if (!quantity || quantity <= 0) return 0;
  const raw = String(unit || '').toLowerCase();
  const n = normaliseUnit(unit);
  if (n === 'kWh') return quantity;
  if (n === 'MWh') return quantity * 1000;
  if (n === 'Gcal') return quantity * 1163;
  if (n === 'm3') return quantity * (conversionFactor('natural_gas', 'm3', country).factor?.value || 0);
  if (raw.includes('mwh')) return quantity * 1000;
  if (raw.includes('kwh')) return quantity;
  if (raw.includes('gj')) return quantity * 277.778;
  if (raw.includes('m3') || raw.includes('m³')) return quantity * (conversionFactor('natural_gas', 'm3', country).factor?.value || 0);
  if (raw.includes('litre') && (raw.includes('diesel') || raw.includes('dies'))) return quantity * 10;
  if (raw.includes('litre') && raw.includes('petrol')) return quantity * 9.1;
  if (raw.includes('litre')) return quantity * 9;
  return 0;
}

// ─── Period handling ────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, '0');
const monthKey = (y, m) => `${y}-${pad(m)}`;
function parseMonthKey(k) { const [y, m] = k.split('-').map(Number); return { y, m }; }
function addMonths(k, n) {
  const { y, m } = parseMonthKey(k);
  const idx = y * 12 + (m - 1) + n;
  return monthKey(Math.floor(idx / 12), (idx % 12) + 1);
}
function monthRange(from, to) {
  const out = [];
  for (let k = from; k <= to; k = addMonths(k, 1)) out.push(k);
  return out;
}
const toUtcDay = (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/**
 * Split a record into month shares: [{ month, share, annual }].
 * periodStart/periodEnd → pro rata by days (inclusive).
 * month only → one month.  year only → 12 equal shares, flagged annual.
 */
function splitRecord(record) {
  if (record.periodStart && record.periodEnd) {
    const start = toUtcDay(new Date(record.periodStart));
    const end = toUtcDay(new Date(record.periodEnd));
    if (end >= start) {
      const DAY = 86400000;
      const total = (end - start) / DAY + 1;
      const shares = {};
      for (let t = start; t <= end; t += DAY) {
        const d = new Date(t);
        const k = monthKey(d.getUTCFullYear(), d.getUTCMonth() + 1);
        shares[k] = (shares[k] || 0) + 1 / total;
      }
      return Object.entries(shares).map(([month, share]) => ({ month, share, annual: false }));
    }
  }
  if (record.month) return [{ month: monthKey(record.year, record.month), share: 1, annual: false }];
  return Array.from({ length: 12 }, (_, i) => ({ month: monthKey(record.year, i + 1), share: 1 / 12, annual: true }));
}

// ─── Intensity summary ──────────────────────────────────────────────────────

function round(n, dp = 2) {
  if (n == null || !isFinite(n)) return null;
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function emptyPeriod(from, to) {
  return { from, to, months: monthRange(from, to), kwh: 0, byFuel: {}, cost: {}, kgCo2e: 0, biogenicKgCo2: 0, monthsWithData: new Set(), recordIds: new Set(), annualRecords: 0 };
}

/**
 * Build the before/after intensity summary for one asset.
 *
 * @param {object} asset   RealEstateAsset (country, grossFloorAreaM2, heatedAreaM2, retrofitDate)
 * @param {object[]} records AssetEnergyRecord rows
 * @param {object} opts    { tariffs: { fuel: { price, currency } }, fx: { [currency]: { perUsd } } }
 */
function computeIntensity(asset, records, opts = {}) {
  const country = String(asset.country || 'GLO').toUpperCase();
  const area = asset.heatedAreaM2 > 0 ? asset.heatedAreaM2 : asset.grossFloorAreaM2;
  const areaBasis = asset.heatedAreaM2 > 0 ? 'heated' : 'gross';
  const warnings = new Set();
  const factorsUsed = new Map();

  // Allocate every record to months.
  const monthly = {};          // month → { byFuel: {fuel: kwh}, kgCo2e }
  const allocations = [];      // { recordId, month, kwh, kgCo2e, biogenic, cost, currency, fuel, annual }
  let annualCount = 0;
  for (const r of records) {
    const conv = convertRecord(r, country);
    conv.warnings.forEach((w) => warnings.add(w));
    const fkey = `${r.fuel}:${normaliseUnit(r.unit)}`;
    if (!factorsUsed.has(fkey)) {
      factorsUsed.set(fkey, {
        fuel: r.fuel,
        unit: normaliseUnit(r.unit),
        toKwh: round(conv.toKwh, 4),
        toKwhSource: conv.convFactor?.source || null,
        toKwhYear: conv.convFactor?.year || null,
        toKwhStatus: conv.convFactor?.status || 'missing',
        kgCo2ePerKwh: round(conv.kgCo2ePerKwh, 4),
        emissionSource: conv.emFactor?.source || null,
        emissionYear: conv.emFactor?.year || null,
        emissionStatus: conv.emFactor?.status || 'missing',
        biogenic: BIOGENIC_FUELS.has(r.fuel),
      });
    }
    if (conv.kwh == null) continue;
    const parts = splitRecord(r);
    if (parts[0]?.annual) annualCount++;
    for (const p of parts) {
      allocations.push({
        recordId: r.id, month: p.month, fuel: r.fuel, annual: p.annual,
        kwh: conv.kwh * p.share, kgCo2e: conv.kgCo2e * p.share, biogenic: conv.biogenicKgCo2 * p.share,
        cost: r.cost != null ? r.cost * p.share : null, currency: r.currency || null,
      });
    }
  }
  if (annualCount) warnings.add(`${annualCount} annual record(s) spread evenly across 12 months.`);
  if (!(area > 0)) warnings.add('Building has no floor area — kWh/m² cannot be calculated.');

  for (const a of allocations) {
    if (!monthly[a.month]) monthly[a.month] = { byFuel: {} };
    monthly[a.month].byFuel[a.fuel] = (monthly[a.month].byFuel[a.fuel] || 0) + a.kwh;
  }

  // Windows.
  let retrofitMonth = null;
  let baseline = null;
  let post = null;
  const dataMonths = Object.keys(monthly).sort();
  if (asset.retrofitDate) {
    const d = new Date(asset.retrofitDate);
    retrofitMonth = monthKey(d.getUTCFullYear(), d.getUTCMonth() + 1);
    baseline = emptyPeriod(addMonths(retrofitMonth, -12), addMonths(retrofitMonth, -1));
    post = emptyPeriod(addMonths(retrofitMonth, 1), addMonths(retrofitMonth, 12));
  } else if (dataMonths.length) {
    const last = dataMonths[dataMonths.length - 1];
    baseline = emptyPeriod(addMonths(last, -11), last);
  }

  const periodOf = (m) => {
    if (baseline && m >= baseline.from && m <= baseline.to) return baseline;
    if (post && m >= post.from && m <= post.to) return post;
    return null;
  };
  for (const a of allocations) {
    const p = periodOf(a.month);
    if (!p) continue;
    p.kwh += a.kwh;
    p.byFuel[a.fuel] = (p.byFuel[a.fuel] || 0) + a.kwh;
    p.kgCo2e += a.kgCo2e;
    p.biogenicKgCo2 += a.biogenic;
    if (a.cost != null) {
      const cur = a.currency || 'AMD';
      p.cost[cur] = (p.cost[cur] || 0) + a.cost;
    }
    p.monthsWithData.add(a.month);
    p.recordIds.add(a.recordId);
    if (a.annual) p.annualRecords++;
  }

  const recordById = new Map(records.map((r) => [r.id, r]));
  const fx = opts.fx || {};
  const toUsd = (amount, cur) => {
    if (amount == null) return null;
    if (cur === 'USD') return amount;
    const rate = fx[cur] && fx[cur].perUsd;
    return rate ? amount / rate : null;
  };

  const finish = (p, label) => {
    if (!p) return null;
    const missing = p.months.filter((m) => !p.monthsWithData.has(m));
    if (missing.length) warnings.add(`${label} period has ${p.months.length - missing.length} of 12 months.`);
    const byFuel = {};
    for (const [f, k] of Object.entries(p.byFuel)) byFuel[f] = { kwh: round(k, 0), kwhPerM2: area > 0 ? round(k / area, 2) : null };
    const cost = {};
    for (const [c, v] of Object.entries(p.cost)) cost[c] = round(v, 0);
    const empty = missing.length === p.months.length;
    return {
      from: p.from, to: p.to,
      monthsCovered: p.months.length - missing.length,
      missingMonths: missing,
      kwh: empty ? null : round(p.kwh, 0),
      kwhPerM2: area > 0 && !empty ? round(p.kwh / area, 2) : null,
      byFuel,
      cost,
      tco2e: round(p.kgCo2e / 1000, 3),
      biogenicTco2: round(p.biogenicKgCo2 / 1000, 3),
      _raw: p,
    };
  };

  const b = finish(baseline, asset.retrofitDate ? 'Baseline' : 'Latest 12-month');
  const a = finish(post, 'Post-retrofit');

  // Savings.
  let change = null;
  // No comparison when either period has no data at all (would read as -100%).
  if (b && a && b.monthsCovered > 0 && a.monthsCovered > 0) {
    const kwhSaved = b._raw.kwh - a._raw.kwh;
    const costSaved = costSavings(b._raw, a._raw, recordById, opts.tariffs || {}, warnings);
    const primaryCur = costSaved ? costSaved.currency : null;
    change = {
      kwhPerM2Pct: b._raw.kwh > 0 ? round(((a._raw.kwh - b._raw.kwh) / b._raw.kwh) * 100, 1) : null,
      kwhPerM2Saved: area > 0 ? round(kwhSaved / area, 2) : null,
      kwhSaved: round(kwhSaved, 0),
      costSaved: costSaved
        ? { [primaryCur]: round(costSaved.amount, 0), USD: round(toUsd(costSaved.amount, primaryCur), 0), currency: primaryCur, estimated: costSaved.estimated }
        : null,
      tco2eAvoided: round((b._raw.kgCo2e - a._raw.kgCo2e) / 1000, 3),
    };
    if (costSaved && primaryCur !== 'USD' && !(fx[primaryCur] && fx[primaryCur].perUsd)) {
      warnings.add(`No ${primaryCur}→USD exchange rate configured; USD savings not shown.`);
    }
  }

  // Monthly series for the chart (baseline + retrofit month + post, or latest 12).
  const seriesFrom = b ? b.from : null;
  const seriesTo = a ? a.to : b ? b.to : null;
  const monthlyOut = seriesFrom
    ? monthRange(seriesFrom, seriesTo).map((m) => {
      const byFuelKwhPerM2 = {};
      const src = monthly[m] ? monthly[m].byFuel : {};
      for (const [f, k] of Object.entries(src)) byFuelKwhPerM2[f] = area > 0 ? round(k / area, 3) : null;
      const period = m === retrofitMonth ? 'retrofit' : (baseline && m >= baseline.from && m <= baseline.to) ? 'baseline' : 'post';
      return { month: m, byFuelKwhPerM2, period };
    })
    : [];

  const strip = (p) => { if (p) delete p._raw; return p; };
  return {
    assetId: asset.id,
    areaM2: area || null,
    areaBasis,
    country,
    retrofitDate: asset.retrofitDate ? new Date(asset.retrofitDate).toISOString().slice(0, 10) : null,
    retrofitMonth,
    baseline: strip(b),
    post: strip(a),
    change,
    monthly: monthlyOut,
    factors: [...factorsUsed.values()],
    weatherNormalised: false,
    warnings: [...warnings],
  };
}

// Cost saved: actual bill costs when every record in both periods has a cost
// in one currency; otherwise per-fuel tariffs (labelled estimated); else null.
function costSavings(base, post, recordById, tariffs, warnings) {
  const ids = [...base.recordIds, ...post.recordIds];
  const recs = ids.map((id) => recordById.get(id)).filter(Boolean);
  const currencies = new Set(recs.map((r) => r.currency || 'AMD'));
  if (recs.length && recs.every((r) => r.cost != null) && currencies.size === 1) {
    const cur = [...currencies][0];
    return { amount: (base.cost[cur] || 0) - (post.cost[cur] || 0), currency: cur, estimated: false };
  }
  const fuels = new Set([...Object.keys(base.byFuel), ...Object.keys(post.byFuel)]);
  const missing = [...fuels].filter((f) => !(tariffs[f] && tariffs[f].price > 0));
  const tariffCurrencies = new Set([...fuels].map((f) => tariffs[f]?.currency).filter(Boolean));
  if (!fuels.size || missing.length || tariffCurrencies.size !== 1) {
    warnings.add(missing.length
      ? `Cost saving not shown: some bills have no cost and no tariff is set for ${missing.map((f) => FUELS[f]?.label || f).join(', ')}.`
      : 'Cost saving not shown: bills mix currencies.');
    return null;
  }
  let amount = 0;
  for (const f of fuels) amount += ((base.byFuel[f] || 0) - (post.byFuel[f] || 0)) * tariffs[f].price;
  return { amount, currency: [...tariffCurrencies][0], estimated: true };
}

/** FX config from the factor file (e.g. AMD per USD), only sourced entries. */
function fxRates() {
  const file = path.join(__dirname, '..', 'data', 'buildingEnergyFactors.json');
  try {
    const raw = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).fx || {} : {};
    const out = {};
    for (const [cur, v] of Object.entries(raw)) if (v && v.perUsd) out[cur] = v;
    return out;
  } catch { return {}; }
}

module.exports = {
  FUELS,
  normaliseUnit,
  isValidFuel,
  isValidUnit,
  conversionFactor,
  emissionFactor,
  convertRecord,
  unitToKwh,
  splitRecord,
  computeIntensity,
  fxRates,
  _setCountryFactors,
};
