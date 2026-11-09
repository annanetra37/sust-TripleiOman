/**
 * Seeds the rules library and (optionally) a demo organisation with sample data.
 *   node src/prisma/seed.js           → rules only
 *   node src/prisma/seed.js --demo    → rules + demo users/org (password: Demo12345!)
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');
const rulesSvc = require('../services/rules');
const obligationsSvc = require('../services/obligations');

async function main() {
  const created = await rulesSvc.seed();
  console.log(`[seed] rules library: ${created} rule(s) created`);
  if (!process.argv.includes('--demo')) return;

  const pw = await bcrypt.hash('Demo12345!', 12);
  const mk = (email, fullName, extra = {}) => prisma.user.upsert({ where: { email }, update: {}, create: { email, fullName, passwordHash: pw, emailVerified: true, ...extra } });
  const fatma = await mk('fatma@demo.om', 'Fatma Al Balushi');
  const ahmed = await mk('ahmed@demo.om', 'Ahmed Al Harthy');
  const sara = await mk('sara@demo.om', 'Sara (Accountant)');
  await mk('staff@triplei.om', 'Triple i Oman Staff', { platformRole: 'PLATFORM_ADMIN' });

  let org = await prisma.organisation.findFirst({ where: { crNumber: '1234567' } });
  if (!org) {
    org = await prisma.organisation.create({ data: {
      legalNameEn: 'Al Noor Trading LLC', legalNameAr: 'شركة النور للتجارة ش.م.م', crNumber: '1234567', legalForm: 'LLC', activities: 'Wholesale of office furniture and supplies',
      address: 'Way 3015, Al Khuwair', governorate: 'Muscat', tin: '12345678', vatNumber: 'OM1100012345', vatRegistered: true, annualSuppliesBaisa: 420000000n, employees: 6,
      profile: { vatRegistered: true, annualSalesOmr: 420000, importsGoods: true, paysForeignParties: true, exciseGoods: false, employees: 6, isSmallEnterprise: false, completedAt: new Date().toISOString() },
      memberships: { create: [{ userId: fatma.id, role: 'OWNER' }, { userId: ahmed.id, role: 'APPROVER' }, { userId: sara.id, role: 'EXTERNAL_ACCOUNTANT' }] },
    } });
    await obligationsSvc.refresh(org);
    const now = new Date();
    const y = now.getUTCFullYear(); const m = now.getUTCMonth();
    const day = (offset) => new Date(Date.UTC(y, m - offset, 10));
    const tx = (direction, date, invoiceNumber, counterpartyName, counterpartyVat, country, description, net, vat, extra = {}) => ({ organisationId: org.id, direction, date, invoiceNumber, counterpartyName, counterpartyVat, counterpartyCountry: country, description, netBaisa: BigInt(net * 1000), vatBaisa: BigInt(Math.round(vat * 1000)), ...extra });
    await prisma.transaction.createMany({ data: [
      tx('SALE', day(1), 'INV-2001', 'Muscat Hotels SAOG', 'OM1100099887', 'OM', 'Office furniture', 12000, 600, { vatCategory: 'STANDARD', categorySource: 'RULE' }),
      tx('SALE', day(1), 'INV-2002', 'Gulf Buyer FZE', null, 'AE', 'Export of goods', 8000, 0, { vatCategory: 'ZERO_RATED', categorySource: 'RULE' }),
      tx('SALE', day(2), 'INV-2003', 'Sohar Clinic', 'OM1100011223', 'OM', 'Desks and chairs', 4500, 225, { vatCategory: 'STANDARD', categorySource: 'RULE' }),
      tx('PURCHASE', day(1), 'P-551', 'Oman Wood Industries', 'OM1100033445', 'OM', 'Raw materials', 6000, 300, { vatCategory: 'STANDARD', categorySource: 'RULE' }),
      tx('PURCHASE', day(2), 'US-901', 'Cloud CRM Inc', null, 'US', 'Software subscription', 400, 0, { vatCategory: 'REVERSE_CHARGE', categorySource: 'RULE', isService: true }),
      tx('PURCHASE', day(2), 'H-12', 'Grand Hotel', 'OM1100055667', 'OM', 'Client entertainment dinner', 300, 15, { vatCategory: 'STANDARD', categorySource: 'RULE' }),
    ] });
    await prisma.party.createMany({ data: [
      { organisationId: org.id, kind: 'CUSTOMER', nameEn: 'Muscat Hotels SAOG', nameAr: 'فنادق مسقط ش.م.ع.ع', vatNumber: 'OM1100099887', country: 'OM', address: 'Shatti Al Qurum', city: 'Muscat' },
      { organisationId: org.id, kind: 'SUPPLIER', nameEn: 'Cloud CRM Inc', country: 'US', address: 'San Francisco' },
      { organisationId: org.id, kind: 'SUPPLIER', nameEn: 'Design Rights Ltd', country: 'GB', address: 'London', residencyCertExpiry: new Date(Date.UTC(y + 1, 0, 1)) },
    ] });
  }
  console.log('[seed] demo ready — sign in as fatma@demo.om / ahmed@demo.om / sara@demo.om / staff@triplei.om with password Demo12345!');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
