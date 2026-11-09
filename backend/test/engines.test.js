const test = require('node:test');
const assert = require('node:assert/strict');
const library = require('../src/rules/library.json');
const money = require('../src/lib/money');
const dates = require('../src/lib/dates');
const vat = require('../src/engines/vat');
const cit = require('../src/engines/cit');
const wht = require('../src/engines/wht');
const pit = require('../src/engines/pit');
const excise = require('../src/engines/excise');
const fawtara = require('../src/engines/fawtara');
const obligations = require('../src/engines/obligations');
const totp = require('../src/lib/totp');

const rules = Object.fromEntries(library.rules.map((r) => [r.key, r.value]));
const tx = (o) => ({ id: Math.random().toString(36).slice(2), counterpartyCountry: 'OM', vatBaisa: 0n, hasTaxInvoice: true, ...o });

test('money: baisa parsing and rounding', () => {
  assert.equal(money.toBaisa('1,234.5675'), 1234568n);
  assert.equal(money.toBaisa('(10.000)'), -10000n);
  assert.equal(money.toBaisa('OMR ١٢٫٥'), 12500n);
  assert.equal(money.fromBaisa(-1500n), '-1.500');
  assert.equal(money.applyRate(1000n, 500), 50n);
  assert.equal(money.applyRate(10n, 500), 1n); // 0.5 baisa rounds half up
  assert.equal(money.grossUp(900000n, 1000), 1000000n);
});

test('dates: weekend shift (Fri/Sat) and holidays', () => {
  const cal = { weekendDays: [5, 6], holidays: ['2027-03-07'] };
  assert.equal(dates.iso(dates.shiftToWorkingDay('2027-01-29', cal)), '2027-01-31'); // Fri → Sun
  assert.equal(dates.iso(dates.shiftToWorkingDay('2027-03-07', cal)), '2027-03-08');
  assert.equal(dates.iso(dates.d('15/01/2027')), '2027-01-15');
});

test('VAT classification: reverse charge, export, keywords, mismatch', () => {
  assert.equal(vat.classify(tx({ direction: 'PURCHASE', counterpartyCountry: 'US', isService: true, netBaisa: 100000n }), rules).category, 'REVERSE_CHARGE');
  assert.equal(vat.classify(tx({ direction: 'SALE', counterpartyCountry: 'AE', netBaisa: 100000n }), rules).category, 'ZERO_RATED');
  assert.equal(vat.classify(tx({ direction: 'SALE', description: 'Residential rent March', netBaisa: 100000n }), rules).category, 'EXEMPT');
  assert.equal(vat.classify(tx({ direction: 'SALE', netBaisa: 100000n, vatBaisa: 5000n }), rules).category, 'STANDARD');
  assert.equal(vat.classify(tx({ direction: 'SALE', netBaisa: 100000n }), rules).category, null);
  const flags = vat.qualityFlags(tx({ direction: 'SALE', netBaisa: 100000n, vatBaisa: 7000n, vatCategory: 'STANDARD', counterpartyVat: 'OM12' }), rules);
  assert.ok(flags.find((f) => f.code === 'VAT_RATE_MISMATCH'));
  assert.ok(flags.find((f) => f.code === 'INVALID_VAT_NUMBER'));
});

test('VAT return: worked example with reverse charge, blocked input and credit note', () => {
  const txs = [
    tx({ direction: 'SALE', date: '2027-01-15', netBaisa: 10000000n, vatBaisa: 500000n, vatCategory: 'STANDARD' }),
    tx({ direction: 'SALE', date: '2027-02-01', netBaisa: 2000000n, vatBaisa: 100000n, vatCategory: 'STANDARD', isCreditNote: true }),
    tx({ direction: 'SALE', date: '2027-02-10', netBaisa: 4000000n, vatCategory: 'ZERO_RATED', counterpartyCountry: 'AE' }),
    tx({ direction: 'PURCHASE', date: '2027-01-20', netBaisa: 3000000n, vatBaisa: 150000n, vatCategory: 'STANDARD', counterpartyVat: 'OM1100033445' }),
    tx({ direction: 'PURCHASE', date: '2027-02-20', netBaisa: 1000000n, vatCategory: 'REVERSE_CHARGE', counterpartyCountry: 'US', isService: true }),
    tx({ direction: 'PURCHASE', date: '2027-03-01', netBaisa: 200000n, vatBaisa: 10000n, vatCategory: 'STANDARD', counterpartyVat: 'OM1100055667', description: 'Client entertainment' }),
    tx({ direction: 'PURCHASE', date: '2027-04-02', netBaisa: 999000n, vatBaisa: 49950n, vatCategory: 'STANDARD', counterpartyVat: 'OM1100055667' }), // outside period
  ];
  const r = vat.computeReturn(txs, { periodStart: '2027-01-01', periodEnd: '2027-03-31', rules });
  assert.equal(r.boxes['1a'].value, 8000000n);
  assert.equal(r.boxes['1a'].tax, 400000n);
  assert.equal(r.boxes['1b'].value, 4000000n);
  assert.equal(r.boxes['2a'].tax, 50000n);
  assert.equal(r.boxes['4a'].tax, 450000n);
  assert.equal(r.boxes['5a'].tax, 150000n); // entertainment blocked
  assert.equal(r.boxes['5c'].tax, 50000n);
  assert.equal(r.boxes['5d'].tax, 200000n);
  assert.equal(r.boxes['6a'].tax, 250000n);
  assert.equal(r.transactionCount, 6);
  assert.equal(r.explanation['1a'].count, 2);
});

test('VAT threshold monitor', () => {
  const s = vat.thresholdStatus({ transactions: [tx({ direction: 'SALE', date: '2027-01-10', netBaisa: 32000000n, vatCategory: 'STANDARD' })], asOf: '2027-02-01', rules });
  assert.equal(s.status, 'APPROACHING');
  assert.equal(vat.thresholdStatus({ declaredAnnualBaisa: 40000000n, asOf: '2027-02-01', rules }).status, 'MUST_REGISTER');
});

test('E-invoicing wave', () => {
  assert.equal(obligations.einvoicingWave({ annualSuppliesBaisa: 6000000000n, vatRegistered: true }, rules).date, '2027-04-01');
  assert.equal(obligations.einvoicingWave({ annualSuppliesBaisa: 100000000n, vatRegistered: true }, rules).date, '2027-10-01');
  assert.equal(obligations.einvoicingWave({ vatRegistered: false }, rules).applies, false);
});

test('Obligations + calendar', () => {
  const org = { legalForm: 'LLC', fiscalYearEndMonth: 12, profile: {} };
  const list = obligations.determineObligations(org, { vatRegistered: true, annualSalesOmr: 100000, paysForeignParties: true }, rules);
  assert.deepEqual(list.map((o) => o.taxType).sort(), ['CIT', 'EINVOICING', 'VAT', 'WHT']);
  const cal = obligations.generateCalendar(org, list, rules, { from: new Date('2027-01-05') });
  const q4 = cal.find((r) => r.taxType === 'VAT' && dates.iso(r.periodEnd) === '2026-12-31');
  assert.equal(dates.iso(q4.dueDate), '2027-01-31'); // 30 Jan 2027 is Saturday → Sunday 31
  const citRow = cal.find((r) => r.taxType === 'CIT' && dates.iso(r.periodEnd) === '2026-12-31');
  assert.equal(dates.iso(citRow.dueDate), '2027-05-02'); // 30 Apr 2027 Fri → Sun 2 May
  assert.ok(obligations.toICal('X', cal.map((c, i) => ({ ...c, id: String(i), status: 'NOT_STARTED' })), 'http://x').includes('BEGIN:VEVENT'));
});

test('CIT with losses and small enterprise', () => {
  const r = cit.compute({ taxYear: 2026, accountingProfitBaisa: 100000000n, adjustments: [{ description: 'Entertainment', type: 'ADD', amountBaisa: 5000000n }], lossesBroughtForward: [{ year: 2019, amountBaisa: 10000000n }, { year: 2023, amountBaisa: 20000000n }] }, rules);
  assert.equal(r.taxableIncomeBaisa, 85000000n);
  assert.equal(r.grossTaxBaisa, 12750000n);
  assert.equal(r.lossesExpired.length, 1);
  const se = cit.smallEnterpriseCheck({ paidUpCapitalBaisa: 20000000n, grossIncomeBaisa: 80000000n, averageEmployees: 10, activity: 'retail', omaniOwnedOrSoleProprietor: true }, rules);
  assert.equal(se.eligible, true);
});

test('WHT with treaty and gross-up', () => {
  const r = wht.compute({ amountBaisa: 9000000n, category: 'ROYALTIES', country: 'GB', treatyCertValid: true, netOfTax: false }, rules);
  assert.equal(r.rateBp, 800);
  assert.equal(r.whtBaisa, 720000n);
  const g = wht.compute({ amountBaisa: 9000000n, category: 'ROYALTIES', country: 'US', netOfTax: true }, rules);
  assert.equal(g.grossBaisa, 10000000n);
  assert.equal(g.whtBaisa, 1000000n);
  assert.equal(wht.compute({ amountBaisa: 100n, category: 'ROYALTIES', country: 'OM' }, rules).whtBaisa, 0n);
});

test('PIT', () => {
  assert.equal(pit.amIAffected({ estimatedGrossOmr: 30000 }, rules).affected, false);
  const a = pit.amIAffected({ estimatedGrossOmr: 55000 }, rules);
  assert.equal(a.estimatedTaxOmr, 650);
  const r = pit.compute({ incomes: [{ category: 'EMPLOYMENT', amountBaisa: 60000000n }], deductions: [{ category: 'EDUCATION', amountBaisa: 4000000n }] }, rules);
  assert.equal(r.taxBaisa, 700000n);
  assert.equal(pit.residency([{ from: '2028-01-01', to: '2028-07-01' }], 2028, rules).resident, true);
});

test('Excise', () => {
  const r = excise.compute([{ category: 'TOBACCO', quantity: 10, unitPriceBaisa: 2000n }, { category: 'CARBONATED', quantity: 100, unitPriceBaisa: 300n }], rules);
  assert.equal(r.totalExciseBaisa, 20000n + 15000n);
  assert.equal(excise.reconcileStamps({ ordered: 100, applied: 80, upcomingShipmentUnits: 50 }).alerts.length, 1);
});

test('Fawtara: build, validate, XML, QR', () => {
  const calc = fawtara.computeLines([{ description: 'Desk', quantity: 2, unitPriceOmr: '100.500', vatCategory: 'STANDARD' }, { description: 'Export crate', quantity: 1, unitPriceOmr: 10, vatCategory: 'ZERO_RATED' }], rules);
  assert.equal(calc.netBaisa, 211000n);
  assert.equal(calc.vatBaisa, 10050n);
  const inv = { docType: 'INVOICE', kind: 'B2B', number: 'INV-1', issueDate: new Date('2027-10-02'), seller: { name: 'Al Noor', vatNumber: 'OM1100012345', address: 'Muscat' }, buyer: { name: 'Buyer', vatNumber: 'OM1100099887', address: 'Sohar', country: 'OM' }, ...calc };
  let v = fawtara.validate(inv, rules);
  assert.equal(v.valid, false);
  assert.ok(v.errors.find((e) => e.rule === 'BR-E-10'));
  inv.lines[1].exemptionReason = 'Export of goods';
  v = fawtara.validate(inv, rules);
  assert.equal(v.valid, true, JSON.stringify(v.errors));
  const xml = fawtara.buildXml(inv, rules);
  assert.match(xml, /<cbc:InvoiceTypeCode>380<\/cbc:InvoiceTypeCode>/);
  assert.match(xml, /<cbc:PayableAmount currencyID="OMR">221.050<\/cbc:PayableAmount>/);
  assert.equal(fawtara.sha256(xml).length, 64);
  assert.ok(Buffer.from(fawtara.qrPayload(inv), 'base64').toString().includes('OM1100012345'));
});

test('TOTP round trip', () => {
  const s = totp.generateSecret();
  assert.equal(totp.verifyTotp(s, totp.totp(s)), true);
  assert.equal(totp.verifyTotp(s, '000000') && totp.totp(s) !== '000000', false);
  // RFC 6238 test vector (SHA1, T=59s): 94287082 → last 6 digits 287082
  assert.equal(totp.totp(totp.base32Encode(Buffer.from('12345678901234567890')), 59000), '287082');
});
