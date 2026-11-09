const router = require('express').Router();
const crypto = require('crypto');
const multer = require('multer');
const QRCode = require('qrcode');
const prisma = require('../config/prisma');
const audit = require('../services/audit');
const rulesSvc = require('../services/rules');
const aspSvc = require('../services/asp');
const fawtara = require('../engines/fawtara');
const vatEngine = require('../engines/vat');
const { toBaisa } = require('../lib/money');
const { d } = require('../lib/dates');
const { HttpError, asyncHandler } = require('../lib/errors');
const { authenticate, withOrg, requirePermission } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
router.use(authenticate, withOrg);

function sellerOf(org) {
  return { name: org.legalNameEn, nameAr: org.legalNameAr, vatNumber: org.vatNumber, crNumber: org.crNumber, address: org.address, city: org.governorate, country: 'OM' };
}

async function nextNumber(orgId, docType) {
  const prefix = docType === 'CREDIT_NOTE' ? 'CN' : docType === 'DEBIT_NOTE' ? 'DN' : 'INV';
  const year = new Date().getUTCFullYear();
  const count = await prisma.eInvoice.count({ where: { organisationId: orgId, direction: 'OUTBOUND', docType } });
  return `${prefix}-${year}-${String(count + 1).padStart(5, '0')}`;
}

async function build(org, body, rules) {
  let buyer = body.buyer || {};
  if (body.buyerPartyId) {
    const p = await prisma.party.findFirst({ where: { id: body.buyerPartyId, organisationId: org.id } });
    if (!p) throw new HttpError(404, 'Customer not found');
    buyer = { partyId: p.id, name: p.nameEn, nameAr: p.nameAr, vatNumber: p.vatNumber, crNumber: p.crNumber, address: p.address, city: p.city, country: p.country, peppolId: p.peppolId };
  }
  const calc = fawtara.computeLines(body.lines || [], rules);
  const inv = {
    docType: body.docType || 'INVOICE', kind: body.kind === 'B2C' ? 'B2C' : 'B2B', number: body.number,
    issueDate: body.issueDate ? d(body.issueDate) : d(new Date()), supplyDate: body.supplyDate ? d(body.supplyDate) : null,
    currency: body.currency || 'OMR', exchangeRate: body.exchangeRate, buyer, seller: sellerOf(org), lines: calc.lines,
    netBaisa: calc.netBaisa, vatBaisa: calc.vatBaisa, totalBaisa: calc.totalBaisa, originalNumber: body.originalNumber || null, originalInvoiceId: body.originalInvoiceId || null, note: body.note || null,
  };
  const v = fawtara.validate(inv, rules);
  const xml = v.valid ? fawtara.buildXml(inv, rules) : null;
  return { inv, v, xml };
}

function toRecord(inv, v, xml) {
  return {
    docType: inv.docType, kind: inv.kind, number: inv.number, issueDate: inv.issueDate, supplyDate: inv.supplyDate, currency: inv.currency,
    buyer: inv.buyer, seller: inv.seller, lines: inv.lines, netBaisa: inv.netBaisa, vatBaisa: inv.vatBaisa, totalBaisa: inv.totalBaisa,
    originalNumber: inv.originalNumber, originalInvoiceId: inv.originalInvoiceId, note: inv.note,
    status: v.valid ? 'VALID' : 'INVALID', validationErrors: v.errors, xml, sha256: xml ? fawtara.sha256(xml) : null,
    qrPayload: inv.kind === 'B2C' && v.valid ? fawtara.qrPayload(inv) : null,
  };
}

const LIST_SELECT = { id: true, direction: true, docType: true, kind: true, number: true, issueDate: true, buyer: true, seller: true, netBaisa: true, vatBaisa: true, totalBaisa: true, status: true, aspMessageId: true, originalNumber: true, createdAt: true, validationErrors: true };

router.get('/', asyncHandler(async (req, res) => {
  const where = { organisationId: req.org.id };
  if (req.query.direction) where.direction = String(req.query.direction);
  if (req.query.status) where.status = { in: String(req.query.status).split(',') };
  if (req.query.q) where.number = { contains: String(req.query.q), mode: 'insensitive' };
  res.json(await prisma.eInvoice.findMany({ where, orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }], take: 500, select: LIST_SELECT }));
}));

router.get('/readiness', asyncHandler(async (req, res) => {
  const [parties, invoices] = await Promise.all([
    prisma.party.findMany({ where: { organisationId: req.org.id } }),
    prisma.eInvoice.findMany({ where: { organisationId: req.org.id, direction: 'OUTBOUND' }, select: { status: true } }),
  ]);
  res.json(fawtara.readiness({ org: req.org, parties, invoices, aspLinked: !!req.org.profile?.aspLinked }));
}));

router.post('/readiness/asp-linked', requirePermission('org.manage'), asyncHandler(async (req, res) => {
  const profile = { ...(req.org.profile || {}), aspLinked: !!req.body?.linked, aspLinkedAt: new Date().toISOString() };
  await prisma.organisation.update({ where: { id: req.org.id }, data: { profile } });
  await audit.record({ req, action: 'einvoicing.asp_link_confirmed', details: { linked: !!req.body?.linked } });
  res.json({ ok: true });
}));

router.get('/lookup', asyncHandler(async (req, res) => {
  const id = String(req.query.participantId || '');
  if (!id) throw new HttpError(400, 'participantId required');
  res.json(await aspSvc.adapter().lookup(id));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const inv = await prisma.eInvoice.findFirst({ where: { id: req.params.id, organisationId: req.org.id } });
  if (!inv) throw new HttpError(404, 'Invoice not found');
  const qrDataUrl = inv.qrPayload ? await QRCode.toDataURL(inv.qrPayload, { margin: 1, width: 200 }) : null;
  const credits = await prisma.eInvoice.findMany({ where: { organisationId: req.org.id, originalInvoiceId: inv.id }, select: { id: true, number: true, docType: true, totalBaisa: true, status: true } });
  res.json({ ...inv, qrDataUrl, linkedNotes: credits });
}));

router.get('/:id/xml', asyncHandler(async (req, res) => {
  const inv = await prisma.eInvoice.findFirst({ where: { id: req.params.id, organisationId: req.org.id } });
  if (!inv?.xml) throw new HttpError(404, 'No XML for this invoice (fix validation errors first).');
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${inv.number}.xml"`);
  res.send(inv.xml);
}));

router.post('/', requirePermission('data.write'), asyncHandler(async (req, res) => {
  const { values: rules } = await rulesSvc.all();
  const body = { ...req.body };
  body.number = body.number || await nextNumber(req.org.id, body.docType || 'INVOICE');
  const { inv, v, xml } = await build(req.org, body, rules);
  const rec = await prisma.eInvoice.create({ data: { ...toRecord(inv, v, xml), organisationId: req.org.id, direction: 'OUTBOUND', createdById: req.user.id, statusHistory: [{ at: new Date().toISOString(), status: v.valid ? 'VALID' : 'INVALID', by: req.user.email }] } });
  await audit.record({ req, action: 'einvoice.created', objectType: 'einvoice', objectId: rec.id, details: { number: rec.number, valid: v.valid } });
  res.status(201).json(rec);
}));

router.patch('/:id', requirePermission('data.write'), asyncHandler(async (req, res) => {
  const existing = await prisma.eInvoice.findFirst({ where: { id: req.params.id, organisationId: req.org.id } });
  if (!existing) throw new HttpError(404, 'Invoice not found');
  if (!['DRAFT', 'INVALID', 'VALID', 'REJECTED'].includes(existing.status)) throw new HttpError(409, 'Sent invoices cannot be edited. Issue a credit note instead.');
  const { values: rules } = await rulesSvc.all();
  const body = { docType: existing.docType, kind: existing.kind, number: existing.number, buyer: existing.buyer, lines: existing.lines.map((l) => ({ ...l, unitPriceBaisa: l.unitPriceBaisa })), originalNumber: existing.originalNumber, originalInvoiceId: existing.originalInvoiceId, note: existing.note, issueDate: existing.issueDate, ...req.body };
  const { inv, v, xml } = await build(req.org, body, rules);
  const rec = await prisma.eInvoice.update({ where: { id: existing.id }, data: { ...toRecord(inv, v, xml), statusHistory: [...existing.statusHistory, { at: new Date().toISOString(), status: v.valid ? 'VALID' : 'INVALID', by: req.user.email, note: 'edited' }] } });
  await audit.record({ req, action: 'einvoice.updated', objectType: 'einvoice', objectId: rec.id, before: existing.xml, after: rec.xml });
  res.json(rec);
}));

/** Send through the partner ASP (corner 2) with an idempotency key; feeds the VAT ledger automatically. */
router.post('/:id/send', requirePermission('einvoice.send'), asyncHandler(async (req, res) => {
  const inv = await prisma.eInvoice.findFirst({ where: { id: req.params.id, organisationId: req.org.id } });
  if (!inv) throw new HttpError(404, 'Invoice not found');
  if (['SENT', 'ACCEPTED', 'DELIVERED'].includes(inv.status)) return res.json(inv); // idempotent
  if (!['VALID', 'REJECTED'].includes(inv.status) || !inv.xml) throw new HttpError(422, 'Fix the validation errors before sending.', inv.validationErrors);
  const idempotencyKey = inv.idempotencyKey || `${inv.organisationId}:${inv.number}:${inv.sha256}`;
  let result;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { result = await aspSvc.adapter().send({ xml: inv.xml, idempotencyKey, buyer: inv.buyer }); break; } catch (err) {
      if (attempt === 3) throw new HttpError(502, `Could not reach the e-invoicing provider: ${err.message}. Your invoice is saved — try again shortly.`);
      await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
    }
  }
  const status = result.status === 'REJECTED' ? 'REJECTED' : result.status === 'DELIVERED' ? 'DELIVERED' : 'ACCEPTED';
  const updated = await prisma.eInvoice.update({ where: { id: inv.id }, data: { status, aspMessageId: result.messageId, idempotencyKey, statusHistory: [...inv.statusHistory, { at: new Date().toISOString(), status, by: req.user.email, reason: result.reason }] } });
  if (status !== 'REJECTED') {
    // Feed VAT: one SALE transaction per accepted e-invoice (credit notes negative).
    const { values: rules } = await rulesSvc.all(inv.issueDate);
    const sign = inv.docType === 'CREDIT_NOTE' ? -1n : 1n;
    const byCat = {};
    for (const l of inv.lines) { byCat[l.vatCategory] = byCat[l.vatCategory] || { net: 0n, vat: 0n }; byCat[l.vatCategory].net += BigInt(l.netBaisa); byCat[l.vatCategory].vat += BigInt(l.vatBaisa); }
    for (const [cat, t] of Object.entries(byCat)) {
      const tx = { organisationId: inv.organisationId, direction: 'SALE', date: inv.issueDate, invoiceNumber: inv.number, counterpartyName: inv.buyer?.name || 'Consumer', counterpartyVat: inv.buyer?.vatNumber || null, counterpartyCountry: inv.buyer?.country || 'OM', description: `Fawtara ${inv.docType.toLowerCase().replace('_', ' ')} ${inv.number}`, netBaisa: t.net * sign, vatBaisa: t.vat * sign, vatCategory: cat, categorySource: 'IMPORT', isCreditNote: inv.docType === 'CREDIT_NOTE', einvoiceId: inv.id };
      tx.flags = vatEngine.qualityFlags(tx, rules, {});
      await prisma.transaction.create({ data: tx });
    }
  }
  await audit.record({ req, action: status === 'REJECTED' ? 'einvoice.rejected' : 'einvoice.sent', objectType: 'einvoice', objectId: inv.id, details: { number: inv.number, aspMessageId: result.messageId, reason: result.reason, sha256: inv.sha256 } });
  res.json(updated);
}));

router.post('/:id/credit-note', requirePermission('data.write'), asyncHandler(async (req, res) => {
  const orig = await prisma.eInvoice.findFirst({ where: { id: req.params.id, organisationId: req.org.id, direction: 'OUTBOUND', docType: 'INVOICE' } });
  if (!orig) throw new HttpError(404, 'Original invoice not found');
  if (!['ACCEPTED', 'DELIVERED', 'SENT'].includes(orig.status)) throw new HttpError(409, 'Only sent invoices need a credit note — edit or delete the draft instead.');
  const { values: rules } = await rulesSvc.all();
  const docType = req.body?.docType === 'DEBIT_NOTE' ? 'DEBIT_NOTE' : 'CREDIT_NOTE';
  const lines = req.body?.lines || orig.lines.map((l) => ({ description: l.description, descriptionAr: l.descriptionAr, quantity: l.quantity, unitPriceBaisa: l.unitPriceBaisa, vatCategory: l.vatCategory, exemptionReason: l.exemptionReason }));
  const body = { docType, kind: orig.kind, buyer: orig.buyer, lines, originalNumber: orig.number, originalInvoiceId: orig.id, note: req.body?.note || '', number: await nextNumber(req.org.id, docType) };
  const { inv, v, xml } = await build(req.org, body, rules);
  if (docType === 'CREDIT_NOTE') {
    const already = await prisma.eInvoice.aggregate({ where: { originalInvoiceId: orig.id, docType: 'CREDIT_NOTE', status: { in: ['ACCEPTED', 'DELIVERED', 'SENT'] } }, _sum: { totalBaisa: true } });
    if (BigInt(already._sum.totalBaisa || 0) + inv.totalBaisa > BigInt(orig.totalBaisa)) throw new HttpError(400, 'Credit notes cannot exceed the original invoice total.');
  }
  const rec = await prisma.eInvoice.create({ data: { ...toRecord(inv, v, xml), organisationId: req.org.id, direction: 'OUTBOUND', createdById: req.user.id, statusHistory: [{ at: new Date().toISOString(), status: v.valid ? 'VALID' : 'INVALID', by: req.user.email }] } });
  await audit.record({ req, action: 'einvoice.note_created', objectType: 'einvoice', objectId: rec.id, details: { docType, original: orig.number } });
  res.status(201).json(rec);
}));

router.delete('/:id', requirePermission('data.write'), asyncHandler(async (req, res) => {
  const inv = await prisma.eInvoice.findFirst({ where: { id: req.params.id, organisationId: req.org.id } });
  if (!inv) throw new HttpError(404, 'Invoice not found');
  if (!['DRAFT', 'INVALID', 'VALID'].includes(inv.status)) throw new HttpError(409, 'Sent or received e-invoices are archived and cannot be deleted.');
  await prisma.eInvoice.delete({ where: { id: inv.id } });
  await audit.record({ req, action: 'einvoice.deleted', objectType: 'einvoice', objectId: inv.id, details: { number: inv.number } });
  res.json({ ok: true });
}));

/** Receive a supplier e-invoice (corner 4) — UBL XML upload; creates a purchase entry (plan E5-04). */
router.post('/inbound', requirePermission('data.write'), upload.single('file'), asyncHandler(async (req, res) => {
  const xml = req.file ? req.file.buffer.toString('utf8') : String(req.body?.xml || '');
  if (!xml.includes('<')) throw new HttpError(400, 'Upload the supplier e-invoice XML.');
  const pick = (re) => (xml.match(re) || [])[1]?.trim();
  const number = pick(/<cbc:ID>([^<]+)<\/cbc:ID>/);
  const supplierBlock = (xml.match(/<cac:AccountingSupplierParty>([\s\S]*?)<\/cac:AccountingSupplierParty>/) || [])[1] || '';
  const supplierName = (supplierBlock.match(/<cbc:(?:Name|RegistrationName)>([^<]+)</) || [])[1];
  const supplierVat = (supplierBlock.match(/<cac:PartyTaxScheme>\s*<cbc:CompanyID>([^<]+)</) || [])[1];
  const supplierCountry = (supplierBlock.match(/<cbc:IdentificationCode>([^<]+)</) || [])[1] || 'OM';
  const issueDate = pick(/<cbc:IssueDate>([^<]+)<\/cbc:IssueDate>/);
  const net = pick(/<cbc:TaxExclusiveAmount[^>]*>([^<]+)</);
  const tax = pick(/<cac:TaxTotal>\s*<cbc:TaxAmount[^>]*>([^<]+)</);
  const isCredit = /<CreditNote[\s>]/.test(xml);
  if (!number || !issueDate || !net) throw new HttpError(400, 'Could not read invoice number, date or totals from the XML.');
  const dup = await prisma.eInvoice.findFirst({ where: { organisationId: req.org.id, direction: 'INBOUND', number, seller: { path: ['vatNumber'], equals: supplierVat || null } } });
  if (dup) throw new HttpError(409, `Duplicate: invoice ${number} from this supplier was already received.`);
  const netB = toBaisa(net); const vatB = toBaisa(tax || 0);
  const rec = await prisma.eInvoice.create({ data: {
    organisationId: req.org.id, direction: 'INBOUND', docType: isCredit ? 'CREDIT_NOTE' : 'INVOICE', number: `${number}${supplierVat ? `@${supplierVat}` : ''}`, issueDate: d(issueDate),
    seller: { name: supplierName, vatNumber: supplierVat || null, country: supplierCountry }, buyer: { name: req.org.legalNameEn, vatNumber: req.org.vatNumber },
    netBaisa: netB, vatBaisa: vatB, totalBaisa: netB + vatB, status: 'RECEIVED', xml, sha256: fawtara.sha256(xml), createdById: req.user.id,
    statusHistory: [{ at: new Date().toISOString(), status: 'RECEIVED', by: req.user.email }],
  } });
  const { values: rules } = await rulesSvc.all(d(issueDate));
  const sign = isCredit ? -1n : 1n;
  const tx = { organisationId: req.org.id, direction: 'PURCHASE', date: d(issueDate), invoiceNumber: number, counterpartyName: supplierName, counterpartyVat: supplierVat || null, counterpartyCountry: supplierCountry, description: `Fawtara e-invoice received ${number}`, netBaisa: netB * sign, vatBaisa: vatB * sign, isCreditNote: isCredit, einvoiceId: rec.id, hasTaxInvoice: true };
  const c = vatEngine.classify(tx, rules);
  tx.vatCategory = c.category; tx.categorySource = c.source;
  tx.flags = vatEngine.qualityFlags(tx, rules, {});
  await prisma.transaction.create({ data: tx });
  await audit.record({ req, action: 'einvoice.received', objectType: 'einvoice', objectId: rec.id, details: { number, supplierVat } });
  res.status(201).json(rec);
}));

module.exports = router;
