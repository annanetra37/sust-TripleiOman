'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// seedBuildingDemo.js — demo company with one Armenian public building
//
//   node src/prisma/seedBuildingDemo.js [path/to/data.json]
//
// Data file: defaults to src/prisma/buildingDemo.data.json (the real building
// facts and bills approved by the Foundation to Save Energy — not committed
// until supplied).  buildingDemo.example.json has the same shape with
// illustrative numbers; when it is used the building name is suffixed
// "(illustrative data)" so it can never be mistaken for real bills.
//
// Idempotent: re-running replaces the demo company's buildings.
// Refuses to run when NODE_ENV=production.
//
// Env: BUILDING_DEMO_EMAIL (default building-demo@triplei.local)
//      BUILDING_DEMO_PASSWORD (required when the demo user is first created)
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

if (process.env.NODE_ENV === 'production') {
  console.error('seedBuildingDemo: refusing to run with NODE_ENV=production.');
  process.exit(1);
}

const prisma = require('../config/prisma');

const DEMO_COMPANY = 'Building Energy Demo';
const DEMO_EMAIL = process.env.BUILDING_DEMO_EMAIL || 'building-demo@triplei.local';

function loadData() {
  const file = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(__dirname, 'buildingDemo.data.json');
  if (!fs.existsSync(file)) {
    console.error(`seedBuildingDemo: data file not found: ${file}\n` +
      'Save the approved building data there, or pass a path. For a dry run with\n' +
      `illustrative numbers: node src/prisma/seedBuildingDemo.js ${path.join('src', 'prisma', 'buildingDemo.example.json')}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function main() {
  const data = loadData();
  const b = data.building;
  if (!b || !Array.isArray(data.records)) throw new Error('Data file needs "building" and "records".');

  let company = await prisma.company.findFirst({ where: { name: DEMO_COMPANY } });
  if (!company) {
    company = await prisma.company.create({
      data: { name: DEMO_COMPANY, country: 'AM', industry: 'Public buildings', companySize: '1-50', tier: 'PROFESSIONAL' },
    });
  } else if (company.tier === 'STARTER') {
    company = await prisma.company.update({ where: { id: company.id }, data: { tier: 'PROFESSIONAL' } });
  }

  const user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (!user) {
    if (!process.env.BUILDING_DEMO_PASSWORD) throw new Error('Set BUILDING_DEMO_PASSWORD to create the demo user.');
    await prisma.user.create({
      data: {
        email: DEMO_EMAIL, passwordHash: await bcrypt.hash(process.env.BUILDING_DEMO_PASSWORD, 12),
        firstName: 'Demo', lastName: 'Energy', role: 'ADMIN', isActive: true, emailVerified: true, companyId: company.id,
      },
    });
  } else if (user.companyId !== company.id) {
    throw new Error(`${DEMO_EMAIL} belongs to another company; set BUILDING_DEMO_EMAIL.`);
  }

  // Replace previous demo buildings (records cascade).
  await prisma.realEstateAsset.deleteMany({ where: { companyId: company.id } });

  const asset = await prisma.realEstateAsset.create({
    data: {
      companyId: company.id,
      name: data.illustrative ? `${b.name} (illustrative data)` : b.name,
      assetClass: b.assetClass || 'school',
      tenure: b.tenure || 'owned',
      country: b.country || 'AM',
      city: b.city,
      grossFloorAreaM2: b.grossFloorAreaM2,
      heatedAreaM2: b.heatedAreaM2 ?? null,
      yearBuilt: b.yearBuilt ?? null,
      occupancyPct: b.occupancyPct ?? null,
      retrofitDate: b.retrofitDate ? new Date(b.retrofitDate) : null,
      retrofitDescription: b.retrofitDescription ?? null,
      retrofitCost: b.retrofitCost ?? null,
      retrofitCurrency: b.retrofitCurrency ?? null,
    },
  });

  await prisma.assetEnergyRecord.createMany({
    data: data.records.map((r) => ({
      assetId: asset.id,
      year: r.year,
      month: r.month ?? null,
      fuel: r.fuel,
      quantity: r.quantity,
      unit: r.unit,
      cost: r.cost ?? null,
      currency: r.currency ?? (r.cost != null ? 'AMD' : null),
      sourceDoc: r.sourceDoc ?? null,
      periodStart: r.periodStart ? new Date(r.periodStart) : null,
      periodEnd: r.periodEnd ? new Date(r.periodEnd) : null,
    })),
  });

  console.log(`Seeded "${asset.name}" with ${data.records.length} records for ${DEMO_COMPANY} (login: ${DEMO_EMAIL}).`);
}

main()
  .catch((err) => { console.error('seedBuildingDemo failed:', err.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
