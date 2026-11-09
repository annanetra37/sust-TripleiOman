'use strict';

// Unit tests for services/buildingEnergy.js — run with `npm test`.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const be = require('../src/services/buildingEnergy');

const AM_SOURCED = {
  AM: {
    toKwh: { 'natural_gas:m3': { value: 9.5, source: 'Test source', year: 2024 } },
    emission: { electricity: { value: 0.2, source: 'Test grid', year: 2023 } },
  },
};

beforeEach(() => be._setCountryFactors({}));

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('units are normalised, including m³ and nm3', () => {
  assert.equal(be.normaliseUnit('m³'), 'm3');
  assert.equal(be.normaliseUnit('M3'), 'm3');
  assert.equal(be.normaliseUnit('nm3'), 'm3');
  assert.equal(be.normaliseUnit('kwh'), 'kWh');
  assert.equal(be.normaliseUnit('Litres'), 'litre');
  assert.equal(be.normaliseUnit('furlongs'), null);
  assert.ok(be.isValidUnit('natural_gas', 'm³'));
  assert.ok(!be.isValidUnit('electricity', 'm3'));
});

test('every fuel and accepted unit converts or reports why not', () => {
  for (const [fuel, def] of Object.entries(be.FUELS)) {
    for (const unit of def.units) {
      const c = be.convertRecord({ fuel, unit, quantity: 10, year: 2025, month: 1 }, 'DE');
      if (c.kwh == null) assert.ok(c.warnings.some((w) => w.includes('No kWh conversion')), `${fuel}/${unit}`);
      else assert.ok(c.kwh > 0, `${fuel}/${unit}`);
    }
  }
});

test('physical conversions', () => {
  close(be.convertRecord({ fuel: 'electricity', unit: 'MWh', quantity: 2 }, 'DE').kwh, 2000);
  close(be.convertRecord({ fuel: 'district_heat', unit: 'Gcal', quantity: 1 }, 'DE').kwh, 1163);
  close(be.convertRecord({ fuel: 'lpg', unit: 'kg', quantity: 1 }, 'DE').kwh, 47.3 / 3.6, 1e-3);
});

test('biomass is reported as biogenic, not in kgCO2e', () => {
  const c = be.convertRecord({ fuel: 'biomass', unit: 'kg', quantity: 100 }, 'AM');
  assert.equal(c.kgCo2e, 0);
  assert.ok(c.biogenicKgCo2 > 0);
});

test('Armenian gas uses the sourced factor when present', () => {
  be._setCountryFactors(AM_SOURCED);
  const c = be.convertRecord({ fuel: 'natural_gas', unit: 'm3', quantity: 100 }, 'AM');
  close(c.kwh, 950);
  assert.equal(c.convFactor.source, 'Test source');
  assert.equal(c.warnings.length, 0);
  close(be.convertRecord({ fuel: 'electricity', unit: 'kWh', quantity: 100 }, 'AM').kgCo2e, 20);
});

test('pending Armenian factor falls back to the default with a warning', () => {
  be._setCountryFactors({ AM: { toKwh: { 'natural_gas:m3': { value: null } } } });
  const c = be.convertRecord({ fuel: 'natural_gas', unit: 'm3', quantity: 100 }, 'AM');
  close(c.kwh, 1055);
  assert.ok(c.warnings.some((w) => w.includes('pending a published source')));
});

test('pro-rata split by days across months', () => {
  const parts = be.splitRecord({ year: 2025, periodStart: '2025-01-22', periodEnd: '2025-02-10' });
  const jan = parts.find((p) => p.month === '2025-01');
  const feb = parts.find((p) => p.month === '2025-02');
  close(jan.share, 10 / 20);
  close(feb.share, 10 / 20);
});

test('annual records spread evenly and are flagged', () => {
  const parts = be.splitRecord({ year: 2024 });
  assert.equal(parts.length, 12);
  assert.ok(parts.every((p) => p.annual && Math.abs(p.share - 1 / 12) < 1e-9));
});

function series(fromY, fromM, n, gasFn, assetId = 'a') {
  const recs = [];
  let y = fromY; let m = fromM;
  for (let i = 0; i < n; i++) {
    recs.push({ id: `${assetId}-g${i}`, year: y, month: m, fuel: 'natural_gas', unit: 'm3', quantity: gasFn(y, m), cost: gasFn(y, m) * 150, currency: 'AMD' });
    recs.push({ id: `${assetId}-e${i}`, year: y, month: m, fuel: 'electricity', unit: 'kWh', quantity: 1000, cost: 48000, currency: 'AMD' });
    m++; if (m === 13) { m = 1; y++; }
  }
  return recs;
}

test('before/after intensity with retrofit month excluded', () => {
  be._setCountryFactors(AM_SOURCED);
  const asset = { id: 'a', country: 'AM', grossFloorAreaM2: 1200, heatedAreaM2: 1000, retrofitDate: '2024-08-15' };
  const recs = series(2023, 8, 25, (y, m) => ((y === 2024 && m > 8) || y === 2025 ? 600 : 1000));
  const r = be.computeIntensity(asset, recs);
  assert.equal(r.areaBasis, 'heated');
  assert.equal(r.baseline.from, '2023-08');
  assert.equal(r.baseline.to, '2024-07');
  assert.equal(r.post.from, '2024-09');
  assert.equal(r.post.to, '2025-08');
  assert.equal(r.baseline.monthsCovered, 12);
  assert.equal(r.post.monthsCovered, 12);
  // baseline: 12 × (1000 m³ × 9.5 + 1000 kWh) = 126,000 kWh over 1000 m²
  assert.equal(r.baseline.kwh, 126000);
  assert.equal(r.baseline.kwhPerM2, 126);
  assert.equal(r.post.kwh, 12 * (600 * 9.5 + 1000));
  assert.equal(r.change.kwhSaved, 126000 - 80400);
  assert.equal(r.change.costSaved.AMD, 12 * 400 * 150);
  assert.equal(r.change.costSaved.estimated, false);
  assert.ok(r.monthly.some((m) => m.month === '2024-08' && m.period === 'retrofit'));
  assert.ok(r.change.tco2eAvoided > 0);
  assert.equal(r.weatherNormalised, false);
});

test('coverage warning when a period has fewer than 12 months', () => {
  const asset = { id: 'a', country: 'DE', grossFloorAreaM2: 1000, retrofitDate: '2024-08-01' };
  const recs = series(2023, 8, 22, () => 500);
  const r = be.computeIntensity(asset, recs);
  assert.equal(r.post.monthsCovered, 9);
  assert.ok(r.warnings.includes('Post-retrofit period has 9 of 12 months.'));
  assert.deepEqual(r.post.missingMonths, ['2025-06', '2025-07', '2025-08']);
});

test('empty post period gives no comparison, not -100%', () => {
  const asset = { id: 'a', country: 'DE', grossFloorAreaM2: 1000, retrofitDate: '2025-03-10' };
  const r = be.computeIntensity(asset, series(2024, 3, 12, () => 500));
  assert.equal(r.post.monthsCovered, 0);
  assert.equal(r.post.kwh, null);
  assert.equal(r.post.kwhPerM2, null);
  assert.equal(r.change, null);
});

test('no retrofit date → latest 12 months only', () => {
  const asset = { id: 'a', country: 'DE', grossFloorAreaM2: 500 };
  const r = be.computeIntensity(asset, series(2024, 1, 18, () => 100));
  assert.equal(r.post, null);
  assert.equal(r.baseline.from, '2024-07');
  assert.equal(r.baseline.to, '2025-06');
  assert.equal(r.change, null);
});

test('missing area gives null intensity and a warning', () => {
  const r = be.computeIntensity({ id: 'a', country: 'DE', grossFloorAreaM2: 0 }, series(2024, 1, 12, () => 100));
  assert.equal(r.baseline.kwhPerM2, null);
  assert.ok(r.warnings.some((w) => w.includes('no floor area')));
});

test('missing costs fall back to tariffs and are labelled estimated', () => {
  const asset = { id: 'a', country: 'DE', grossFloorAreaM2: 1000, retrofitDate: '2024-08-01' };
  const recs = series(2023, 8, 25, () => 500).map((r) => ({ ...r, cost: null }));
  const none = be.computeIntensity(asset, recs);
  assert.equal(none.change.costSaved, null);
  const est = be.computeIntensity(asset, recs, { tariffs: { natural_gas: { price: 0.05, currency: 'EUR' }, electricity: { price: 0.2, currency: 'EUR' } } });
  assert.equal(est.change.costSaved.estimated, true);
  assert.equal(est.change.costSaved.currency, 'EUR');
});

test('CRREM annual totals and intensity endpoint agree on kWh', () => {
  be._setCountryFactors(AM_SOURCED);
  const crrem = require('../src/services/crremEngine');
  const asset = { id: 'a', country: 'AM', grossFloorAreaM2: 1000 };
  const recs = series(2025, 1, 12, (y, m) => 100 * m);
  recs.push({ id: 'x', year: 2025, month: 3, fuel: 'electricity', unit: 'MWh', quantity: 2 });
  const fromCrrem = crrem.annualTotals(asset, recs)[2025].kwh;
  const fromIntensity = be.computeIntensity(asset, recs).baseline.kwh;
  assert.equal(Math.round(fromCrrem), fromIntensity);
});

test('CRREM has no pathway for Armenia (no silent global fallback)', () => {
  const crrem = require('../src/services/crremEngine');
  assert.equal(crrem.hasPathway('AM', 'school'), false);
  assert.equal(crrem.hasPathway('DE', 'office'), true);
  assert.equal(crrem.getPathway('AM', 'office', '1.5C'), null);
});

test('unitToKwh (ROI) converts gas m³ instead of returning 0', () => {
  assert.ok(be.unitToKwh(100, 'm3') > 0);
  assert.equal(be.unitToKwh(5, 'MWh'), 5000);
  assert.equal(be.unitToKwh(10, 'GJ'), 2777.78);
  assert.equal(be.unitToKwh(10, 'litres diesel'), 100);
});
