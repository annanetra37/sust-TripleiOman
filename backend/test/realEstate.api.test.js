'use strict';

// API tests for /api/real-estate and the lineage bills list.
// Needs a database: DATABASE_URL=postgresql://… npm test
// (skipped when DATABASE_URL is not set).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const skip = !process.env.DATABASE_URL && 'DATABASE_URL not set';

let prisma; let server; let base;
const tokens = {};
const companies = {};

async function call(who, method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tokens[who] ? { Authorization: `Bearer ${tokens[who]}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, body: json };
}

before(async () => {
  if (skip) return;
  const express = require('express');
  const jwt = require('jsonwebtoken');
  const config = require('../src/config');
  prisma = require('../src/config/prisma');

  const app = express();
  app.use(express.json());
  app.use('/api/real-estate', require('../src/routes/realEstate'));
  app.use('/api/lineage', require('../src/routes/lineage'));
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api`;

  const stamp = Date.now();
  for (const [key, tier] of [['a', 'PROFESSIONAL'], ['b', 'PROFESSIONAL'], ['starter', 'STARTER']]) {
    const company = await prisma.company.create({ data: { name: `RE test ${key} ${stamp}`, country: 'AM', industry: 'Test', companySize: '1-50', tier } });
    const user = await prisma.user.create({
      data: { email: `re-${key}-${stamp}@test.local`, passwordHash: 'x', firstName: 'T', lastName: key, role: 'ADMIN', isActive: true, emailVerified: true, companyId: company.id },
    });
    companies[key] = company;
    tokens[key] = jwt.sign({ userId: user.id }, config.jwt.secret, { expiresIn: '1h' });
  }
});

after(async () => {
  if (skip) return;
  server.close();
  const companyIds = Object.values(companies).map((c) => c.id);
  await prisma.activityLog.deleteMany({ where: { companyId: { in: companyIds } } });
  await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  await prisma.$disconnect();
});

const school = {
  name: 'Test School', assetClass: 'school', country: 'am', city: 'Vanadzor',
  grossFloorAreaM2: 1600, heatedAreaM2: 1450, yearBuilt: 1972,
};

test('building lifecycle: create, records, intensity, edit, delete', { skip }, async () => {
  const created = await call('a', 'POST', '/real-estate/assets', school);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.country, 'AM');
  const id = created.body.id;

  // 24 months of gas + electricity via bulk.
  const rows = [];
  for (let i = 0; i < 25; i++) {
    const y = 2023 + Math.floor((7 + i) / 12); const m = ((7 + i) % 12) + 1;
    rows.push({ year: y, month: m, fuel: 'natural_gas', quantity: 1000, unit: 'm³', cost: 150000, currency: 'AMD', sourceDoc: `gas-${y}-${m}.pdf` });
    rows.push({ year: y, month: m, fuel: 'electricity', quantity: 2000, unit: 'kWh', cost: 96000, currency: 'AMD' });
  }
  const bulk = await call('a', 'POST', `/real-estate/assets/${id}/energy/bulk`, rows);
  assert.equal(bulk.status, 201, JSON.stringify(bulk.body));
  assert.equal(bulk.body.imported, 50);

  const upd = await call('a', 'PUT', `/real-estate/assets/${id}`, { retrofitDate: '2024-08-15', retrofitDescription: 'Insulation and windows' });
  assert.equal(upd.status, 200);

  const intensity = await call('a', 'GET', `/real-estate/assets/${id}/intensity`);
  assert.equal(intensity.status, 200);
  assert.equal(intensity.body.retrofitMonth, '2024-08');
  assert.equal(intensity.body.baseline.monthsCovered, 12);
  assert.equal(intensity.body.post.monthsCovered, 12);
  assert.ok(intensity.body.factors.find((f) => f.fuel === 'natural_gas' && f.unit === 'm3'));
  const before = intensity.body.post.kwh;

  // Edit one post-retrofit record → KPIs change.
  const detail = await call('a', 'GET', `/real-estate/assets/${id}`);
  const rec = detail.body.energyRecords.find((r) => r.fuel === 'electricity' && r.year === 2025 && r.month === 1);
  assert.equal(rec.kwh, 2000);
  const put = await call('a', 'PUT', `/real-estate/assets/${id}/energy/${rec.id}`, { quantity: 1000 });
  assert.equal(put.status, 200);
  const after1 = await call('a', 'GET', `/real-estate/assets/${id}/intensity`);
  assert.equal(after1.body.post.kwh, before - 1000);

  // Delete it → coverage still 12 (gas exists that month), kWh drops again.
  const del = await call('a', 'DELETE', `/real-estate/assets/${id}/energy/${rec.id}`);
  assert.equal(del.status, 200);
  const after2 = await call('a', 'GET', `/real-estate/assets/${id}/intensity`);
  assert.equal(after2.body.post.kwh, before - 2000);

  // List view carries the summary.
  const list = await call('a', 'GET', '/real-estate/assets');
  const row = list.body.find((x) => x.id === id);
  assert.ok(row.summary.latestKwhPerM2 > 0);
  assert.ok(row.summary.changePct !== undefined);

  // Activity log written.
  const logs = await prisma.activityLog.findMany({ where: { companyId: companies.a.id } });
  const actions = new Set(logs.map((l) => l.action));
  for (const a of ['RE_ASSET_CREATE', 'RE_ASSET_UPDATE', 'RE_ENERGY_BULK', 'RE_ENERGY_UPDATE', 'RE_ENERGY_DELETE']) assert.ok(actions.has(a), a);

  // Lineage shows bills with a source document.
  const lineage = await call('a', 'GET', '/lineage');
  assert.equal(lineage.status, 200);
  assert.equal(lineage.body.buildingBills.filter((b) => b.assetId === id).length, 25);

  // CRREM refuses Armenia instead of falling back to global office values.
  const crrem = await call('a', 'POST', `/real-estate/assets/${id}/crrem`, { scenario: '1.5C' });
  assert.equal(crrem.status, 422);
  assert.equal(crrem.body.code, 'NO_COUNTRY_PATHWAY');
  const portfolio = await call('a', 'GET', '/real-estate/portfolio/crrem');
  assert.equal(portfolio.body.find((p) => p.assetId === id).skipped, true);

  const gone = await call('a', 'DELETE', `/real-estate/assets/${id}`);
  assert.equal(gone.status, 200);
});

test('validation errors', { skip }, async () => {
  const bad = await call('a', 'POST', '/real-estate/assets', { ...school, assetClass: 'castle', grossFloorAreaM2: 0 });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.errors.some((e) => e.includes('assetClass')));
  assert.ok(bad.body.errors.some((e) => e.includes('grossFloorAreaM2')));

  const { body: asset } = await call('a', 'POST', '/real-estate/assets', school);
  const post = (b) => call('a', 'POST', `/real-estate/assets/${asset.id}/energy`, b);
  assert.equal((await post({ year: 2025, month: 1, fuel: 'natural_gas', quantity: 0, unit: 'm3' })).status, 400);
  assert.equal((await post({ year: 2025, month: 1, fuel: 'natural_gas', quantity: -5, unit: 'm3' })).status, 400);
  assert.equal((await post({ year: 2025, month: 1, fuel: 'coal', quantity: 5, unit: 'kg' })).status, 400);
  assert.equal((await post({ year: 2025, month: 1, fuel: 'electricity', quantity: 5, unit: 'm3' })).status, 400);
  assert.equal((await post({ year: new Date().getUTCFullYear() + 1, month: 1, fuel: 'electricity', quantity: 5, unit: 'kWh' })).status, 400);
  assert.equal((await post({ year: 2025, fuel: 'electricity', quantity: 5, unit: 'kWh', periodStart: '2025-02-01' })).status, 400);
  assert.equal((await post({ year: 2025, fuel: 'electricity', quantity: 5, unit: 'kWh', periodStart: '2025-03-01', periodEnd: '2025-02-01' })).status, 400);
  const ok = await post({ year: 2025, fuel: 'natural_gas', quantity: 500, unit: 'nm3', periodStart: '2025-01-20', periodEnd: '2025-02-19', cost: 75000 });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.unit, 'm3');
  assert.equal(ok.body.currency, 'AMD');

  // Bulk is all-or-nothing.
  const bulk = await call('a', 'POST', `/real-estate/assets/${asset.id}/energy/bulk`, [
    { year: 2024, month: 1, fuel: 'electricity', quantity: 10, unit: 'kWh' },
    { year: 2024, month: 2, fuel: 'electricity', quantity: -1, unit: 'kWh' },
  ]);
  assert.equal(bulk.status, 400);
  assert.equal(bulk.body.rowErrors[0].row, 2);
  const count = await prisma.assetEnergyRecord.count({ where: { assetId: asset.id } });
  assert.equal(count, 1);
  const tooMany = await call('a', 'POST', `/real-estate/assets/${asset.id}/energy/bulk`, Array.from({ length: 501 }, () => ({})));
  assert.equal(tooMany.status, 400);
});

test('another company cannot read or change the building', { skip }, async () => {
  const { body: asset } = await call('a', 'POST', '/real-estate/assets', school);
  const { body: rec } = await call('a', 'POST', `/real-estate/assets/${asset.id}/energy`, { year: 2025, month: 1, fuel: 'electricity', quantity: 5, unit: 'kWh' });
  for (const [m, p, b] of [
    ['GET', `/real-estate/assets/${asset.id}`],
    ['GET', `/real-estate/assets/${asset.id}/intensity`],
    ['PUT', `/real-estate/assets/${asset.id}`, { name: 'x' }],
    ['DELETE', `/real-estate/assets/${asset.id}`],
    ['POST', `/real-estate/assets/${asset.id}/energy`, { year: 2025, month: 1, fuel: 'electricity', quantity: 5, unit: 'kWh' }],
    ['POST', `/real-estate/assets/${asset.id}/energy/bulk`, [{ year: 2025, month: 1, fuel: 'electricity', quantity: 5, unit: 'kWh' }]],
    ['PUT', `/real-estate/assets/${asset.id}/energy/${rec.id}`, { quantity: 1 }],
    ['DELETE', `/real-estate/assets/${asset.id}/energy/${rec.id}`],
  ]) {
    const r = await call('b', m, p, b);
    assert.equal(r.status, 404, `${m} ${p}`);
  }
  const list = await call('b', 'GET', '/real-estate/assets');
  assert.ok(!list.body.some((x) => x.id === asset.id));
  const lineage = await call('b', 'GET', '/lineage');
  assert.ok(!lineage.body.buildingBills.some((x) => x.assetId === asset.id));
  assert.equal((await prisma.assetEnergyRecord.findUnique({ where: { id: rec.id } })).quantity, 5);
});

test('plans without building_energy get FEATURE_NOT_IN_PLAN', { skip }, async () => {
  const r = await call('starter', 'GET', '/real-estate/assets');
  assert.equal(r.status, 403);
  assert.equal(r.body.error, 'FEATURE_NOT_IN_PLAN');
  assert.equal(r.body.feature, 'building_energy');
  const anon = await call('nobody', 'GET', '/real-estate/assets');
  assert.equal(anon.status, 401);
});
