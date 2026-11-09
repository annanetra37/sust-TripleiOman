/**
 * End-to-end API flow against a real Postgres (DATABASE_URL). Skipped when no database is configured.
 * signup → org → questionnaire → import → VAT return → four-eyes approval → filing → e-invoice → audit chain.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');

const hasDb = !!process.env.DATABASE_URL || require('fs').existsSync(require('path').join(__dirname, '../.env'));

test('Triple i Oman API end-to-end', { skip: !hasDb && 'DATABASE_URL not set' }, async (t) => {
  process.env.DISABLE_REMINDERS = '1';
  process.env.MFA_REQUIRED = 'false';
  const app = require('../src/app');
  const rules = require('../src/services/rules');
  await rules.seed();
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  t.after(() => server.close());
  const uid = Date.now().toString(36);

  async function call(method, path, { token, org, body, form } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (org) headers['X-Org-Id'] = org;
    if (body) headers['Content-Type'] = 'application/json';
    const res = await fetch(base + path, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : await res.arrayBuffer();
    return { status: res.status, data };
  }
  const signup = async (name) => {
    const r = await call('POST', '/auth/signup', { body: { email: `${name}-${uid}@test.om`, fullName: name, password: 'Passw0rd!123', acceptPrivacy: true, acceptTerms: true } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    return r.data.accessToken;
  };

  const owner = await signup('owner');
  const approver = await signup('approver');

  // Wrong-realm token is rejected (plan E0-02)
  const jwt = require('jsonwebtoken');
  const foreign = jwt.sign({ typ: 'access' }, 'dev-only-oman-access-secret', { issuer: 'triplei-esg', audience: 'api', subject: 'x' });
  assert.equal((await call('GET', '/auth/me', { token: foreign })).status, 401);
  // Neutral login error
  const bad = await call('POST', '/auth/login', { body: { email: `nobody-${uid}@test.om`, password: 'x' } });
  assert.equal(bad.status, 401);
  assert.match(bad.data.error, /couldn't sign you in to Triple i Oman/);

  const org = await call('POST', '/orgs', { token: owner, body: { legalNameEn: `Test Trading ${uid}`, vatNumber: 'OM1100012345', address: 'Muscat', crNumber: '1234567' } });
  assert.equal(org.status, 201, JSON.stringify(org.data));
  const orgId = org.data.id;
  const q = await call('POST', '/orgs/current/questionnaire', { token: owner, org: orgId, body: { vatRegistered: true, annualSalesOmr: 250000, paysForeignParties: true, employees: 5 } });
  assert.deepEqual(q.data.obligations.map((o) => o.taxType).sort(), ['CIT', 'EINVOICING', 'PAYROLL', 'VAT', 'WHT']);

  // Invite the approver
  const inv = await call('POST', '/orgs/current/invitations', { token: owner, org: orgId, body: { email: `approver-${uid}@test.om`, role: 'APPROVER' } });
  assert.equal(inv.status, 201);
  const token = new URLSearchParams(inv.data.devAcceptPath.split('?')[1]).get('token');
  const acc = await call('POST', '/auth/accept-invite', { body: { token, password: 'Passw0rd!123' } });
  assert.equal(acc.status, 200, JSON.stringify(acc.data));
  // Approver cannot write data (RBAC in API)
  assert.equal((await call('POST', '/transactions', { token: approver, org: orgId, body: { direction: 'SALE', date: '2027-01-02', netOmr: 1 } })).status, 403);

  // Import Excel
  const aoa = [['Type (SALE/PURCHASE)', 'Invoice date (YYYY-MM-DD)', 'Invoice number', 'Customer / supplier name', 'Customer / supplier VAT number', 'Country code (OM, AE, IN…)', 'Description', 'Net amount (OMR)', 'VAT amount (OMR)', 'Service? (Y/N)'],
    ['SALE', '2027-01-15', 'INV-1', 'Buyer LLC', 'OM1100099887', 'OM', 'Furniture', '1000', '50', 'N'],
    ['SALE', '2027-02-15', 'INV-2', 'Gulf FZE', '', 'AE', 'Export of goods', '500', '0', 'N'],
    ['PURCHASE', '2027-02-01', 'P-1', 'Supplier SAOC', 'OM1100054321', 'OM', 'Stock', '400', '20', 'N'],
    ['PURCHASE', '2027-03-01', 'US-1', 'Cloud Inc', '', 'US', 'Software', '100', '0', 'Y'],
    ['SALE', 'not-a-date', 'INV-X', 'Bad', '', 'OM', 'x', '1', '0', 'N']];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'T');
  const fd = new FormData();
  fd.append('file', new Blob([XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })]), 'tx.xlsx');
  const imp = await call('POST', '/transactions/import', { token: owner, org: orgId, form: fd });
  assert.equal(imp.status, 201, JSON.stringify(imp.data));
  assert.equal(imp.data.imported, 4);
  assert.equal(imp.data.errors.length, 1);

  // VAT return Q1 2027
  const ret = await call('POST', '/returns/vat', { token: owner, org: orgId, body: { periodStart: '2027-01-01', periodEnd: '2027-03-31' } });
  assert.equal(ret.status, 201, JSON.stringify(ret.data));
  assert.equal(ret.data.boxes['1a'].tax, 50000);
  assert.equal(ret.data.boxes['2a'].tax, 5000);
  assert.equal(ret.data.boxes['6a'].tax, 50000 + 5000 - 20000 - 5000);
  const drill = await call('GET', `/returns/${ret.data.id}/box/1a`, { token: owner, org: orgId });
  assert.equal(drill.data.transactions.length, 1);
  const explain = await call('GET', `/assistant/explain/${ret.data.id}/6a`, { token: owner, org: orgId });
  assert.match(explain.data.text, /Box 6a/);

  // Workflow: submit → preparer cannot approve → approver approves → locked → file → pay
  assert.equal((await call('POST', `/returns/${ret.data.id}/submit-review`, { token: owner, org: orgId, body: {} })).status, 200);
  assert.equal((await call('POST', `/returns/${ret.data.id}/approve`, { token: owner, org: orgId, body: { confirm: true } })).status, 403);
  assert.equal((await call('POST', `/returns/${ret.data.id}/record-submission`, { token: owner, org: orgId, body: { submissionRef: 'VAT-123' } })).status, 409);
  const ap = await call('POST', `/returns/${ret.data.id}/approve`, { token: approver, org: orgId, body: { confirm: true, comment: 'Checked' } });
  assert.equal(ap.status, 200, JSON.stringify(ap.data));
  assert.equal(ap.data.locked, true);
  const txs = await call('GET', '/transactions', { token: owner, org: orgId });
  const locked = txs.data.rows.find((x) => x.invoiceNumber === 'INV-1');
  assert.equal((await call('PATCH', `/transactions/${locked.id}`, { token: owner, org: orgId, body: { description: 'changed' } })).status, 409);
  const comp = await call('GET', `/returns/${ret.data.id}/companion`, { token: owner, org: orgId });
  assert.ok(comp.data.fields.find((f) => f.box === '6a').value === '30.000');
  assert.equal((await call('POST', `/returns/${ret.data.id}/record-submission`, { token: owner, org: orgId, body: { submissionRef: 'VAT-2027Q1-0001' } })).data.status, 'SUBMITTED');
  assert.equal((await call('POST', `/returns/${ret.data.id}/record-payment`, { token: owner, org: orgId, body: { paymentRef: 'BANK-1' } })).data.status, 'PAID');

  // E-invoice: invalid → fix → send (sandbox ASP) → feeds VAT → credit note
  const cust = await call('POST', '/parties', { token: owner, org: orgId, body: { kind: 'CUSTOMER', nameEn: 'Hotel SAOG', vatNumber: 'OM1100099887', country: 'OM', address: 'Qurum' } });
  const e1 = await call('POST', '/einvoices', { token: owner, org: orgId, body: { buyerPartyId: cust.data.id, issueDate: '2027-10-05', lines: [{ description: 'Chairs', quantity: 4, unitPriceOmr: 25, vatCategory: 'STANDARD' }, { description: 'Service', quantity: 1, unitPriceOmr: 10, vatCategory: 'EXEMPT' }] } });
  assert.equal(e1.data.status, 'INVALID');
  const e1b = await call('PATCH', `/einvoices/${e1.data.id}`, { token: owner, org: orgId, body: { lines: [{ description: 'Chairs', quantity: 4, unitPriceOmr: 25, vatCategory: 'STANDARD' }, { description: 'Service', quantity: 1, unitPriceOmr: 10, vatCategory: 'EXEMPT', exemptionReason: 'Financial services' }] } });
  assert.equal(e1b.data.status, 'VALID', JSON.stringify(e1b.data.validationErrors));
  assert.equal(e1b.data.totalBaisa, 115000);
  const sent = await call('POST', `/einvoices/${e1.data.id}/send`, { token: owner, org: orgId });
  assert.equal(sent.data.status, 'ACCEPTED');
  const again = await call('POST', `/einvoices/${e1.data.id}/send`, { token: owner, org: orgId });
  assert.equal(again.data.aspMessageId, sent.data.aspMessageId); // idempotent
  const fed = await call('GET', '/transactions?q=' + e1.data.number, { token: owner, org: orgId });
  assert.equal(fed.data.rows.length, 2);
  const cn = await call('POST', `/einvoices/${e1.data.id}/credit-note`, { token: owner, org: orgId, body: { note: 'Goods returned', lines: [{ description: 'Chairs', quantity: 1, unitPriceOmr: 25, vatCategory: 'STANDARD' }] } });
  assert.equal(cn.data.status, 'VALID', JSON.stringify(cn.data.validationErrors));
  assert.equal(cn.data.originalNumber, e1.data.number);
  const xml = await call('GET', `/einvoices/${cn.data.id}/xml`, { token: owner, org: orgId });
  assert.match(Buffer.from(xml.data).toString(), /<CreditNote/);

  // WHT
  const sup = await call('POST', '/parties', { token: owner, org: orgId, body: { kind: 'SUPPLIER', nameEn: 'Rights Ltd', country: 'GB', residencyCertExpiry: '2030-01-01' } });
  const w = await call('POST', '/wht', { token: owner, org: orgId, body: { partyId: sup.data.id, paymentDate: '2027-05-10', category: 'ROYALTIES', amountOmr: 1000 } });
  assert.equal(w.data.whtBaisa, 80000);
  const ws = await call('POST', '/returns/wht', { token: owner, org: orgId, body: { month: '2027-05' } });
  assert.equal(ws.data.amountDueBaisa, 80000);

  // Calendar, overview, audit chain, audit pack
  const ics = await call('GET', '/obligations/export.ics', { token: owner, org: orgId });
  assert.match(Buffer.from(ics.data).toString(), /BEGIN:VCALENDAR/);
  const ov = await call('GET', '/orgs/current/overview', { token: owner, org: orgId });
  assert.equal(ov.data.einvoicing.date, '2027-10-01');
  const v = await call('GET', '/audit/verify', { token: owner, org: orgId });
  assert.equal(v.data.valid, true, JSON.stringify(v.data));
  const pack = await call('GET', '/audit/pack?from=2027-01-01&to=2027-12-31', { token: approver, org: orgId });
  assert.equal(pack.status, 200);
  assert.ok(pack.data.byteLength > 500);

  // Public PIT checker and assistant retrieval
  const p = await call('POST', '/pit/am-i-affected', { body: { estimatedGrossOmr: 60000 } });
  assert.equal(p.data.affected, true);
  const a = await call('POST', '/assistant/ask', { token: owner, body: { question: 'When is the VAT return due?' } });
  assert.ok(a.data.citations.length > 0);
  const dec = await call('POST', '/assistant/ask', { token: owner, body: { question: 'Best football team?' } });
  assert.equal(dec.data.mode, 'declined');

  // Other org is invisible
  const stranger = await signup('stranger');
  assert.equal((await call('GET', '/orgs/current', { token: stranger, org: orgId })).status, 403);
});
