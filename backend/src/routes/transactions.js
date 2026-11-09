const router = require('express').Router();
const multer = require('multer');
const XLSX = require('xlsx');
const prisma = require('../config/prisma');
const audit = require('../services/audit');
const rulesSvc = require('../services/rules');
const vat = require('../engines/vat');
const { toBaisa } = require('../lib/money');
const { d } = require('../lib/dates');
const { HttpError, asyncHandler } = require('../lib/errors');
const { authenticate, withOrg, requirePermission } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
router.use(authenticate, withOrg);

// Bilingual template columns (plan E3-01). Each column accepts the English or Arabic header.
const COLUMNS = [
  { key: 'direction', en: 'Type (SALE/PURCHASE)', ar: 'النوع (بيع/شراء)', required: true },
  { key: 'date', en: 'Invoice date (YYYY-MM-DD)', ar: 'تاريخ الفاتورة', required: true },
  { key: 'invoiceNumber', en: 'Invoice number', ar: 'رقم الفاتورة' },
  { key: 'counterpartyName', en: 'Customer / supplier name', ar: 'اسم العميل / المورد' },
  { key: 'counterpartyVat', en: 'Customer / supplier VAT number', ar: 'الرقم الضريبي للعميل / المورد' },
  { key: 'counterpartyCountry', en: 'Country code (OM, AE, IN…)', ar: 'رمز الدولة' },
  { key: 'description', en: 'Description', ar: 'الوصف' },
  { key: 'accountCode', en: 'Account code', ar: 'رمز الحساب' },
  { key: 'net', en: 'Net amount (OMR)', ar: 'المبلغ الصافي (ر.ع)', required: true },
  { key: 'vat', en: 'VAT amount (OMR)', ar: 'مبلغ الضريبة (ر.ع)' },
  { key: 'vatCategory', en: 'VAT category (optional)', ar: 'فئة الضريبة (اختياري)' },
  { key: 'isService', en: 'Service? (Y/N)', ar: 'خدمة؟ (نعم/لا)' },
  { key: 'isImport', en: 'Import of goods? (Y/N)', ar: 'استيراد سلع؟ (نعم/لا)' },
  { key: 'isCreditNote', en: 'Credit note? (Y/N)', ar: 'إشعار دائن؟ (نعم/لا)' },
  { key: 'hasTaxInvoice', en: 'Tax invoice held? (Y/N)', ar: 'فاتورة ضريبية متوفرة؟' },
];
const yes = (v) => ['y', 'yes', 'true', '1', 'نعم', 'x'].includes(String(v ?? '').trim().toLowerCase());
const CAT_ALIASES = { STANDARD: 'STANDARD', '5%': 'STANDARD', S: 'STANDARD', ZERO: 'ZERO_RATED', ZERO_RATED: 'ZERO_RATED', '0%': 'ZERO_RATED', Z: 'ZERO_RATED', EXEMPT: 'EXEMPT', E: 'EXEMPT', OUT_OF_SCOPE: 'OUT_OF_SCOPE', O: 'OUT_OF_SCOPE', REVERSE_CHARGE: 'REVERSE_CHARGE', RC: 'REVERSE_CHARGE' };

async function enrich(tx, rules, ctx) {
  const c = vat.classify(tx, rules);
  const out = { ...tx };
  if (!tx.vatCategory || tx.categorySource !== 'USER') {
    out.vatCategory = c.category; out.categorySource = c.source;
  }
  out.flags = vat.qualityFlags(out, rules, ctx);
  out.classification = c;
  return out;
}

router.get('/', asyncHandler(async (req, res) => {
  const where = { organisationId: req.org.id };
  if (req.query.direction) where.direction = String(req.query.direction);
  if (req.query.from || req.query.to) where.date = { ...(req.query.from ? { gte: d(req.query.from) } : {}), ...(req.query.to ? { lte: d(req.query.to) } : {}) };
  if (req.query.flagged === '1') where.OR = [{ vatCategory: null }, { NOT: { flags: { equals: [] } } }];
  if (req.query.ids) where.id = { in: String(req.query.ids).split(',').slice(0, 500) };
  if (req.query.q) where.OR = [{ invoiceNumber: { contains: String(req.query.q), mode: 'insensitive' } }, { counterpartyName: { contains: String(req.query.q), mode: 'insensitive' } }, { description: { contains: String(req.query.q), mode: 'insensitive' } }];
  const take = Math.min(1000, Number(req.query.limit) || 300);
  const [rows, total] = await Promise.all([prisma.transaction.findMany({ where, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take }), prisma.transaction.count({ where })]);
  res.json({ rows, total });
}));

router.get('/template', (req, res) => {
  const wb = XLSX.utils.book_new();
  const header = COLUMNS.map((c) => `${c.en} | ${c.ar}`);
  const sample = [
    ['SALE', '2027-01-15', 'INV-1001', 'Al Noor Trading LLC', 'OM1100012345', 'OM', 'Office furniture', '4000', '1000.000', '50.000', '', 'N', 'N', 'N', 'Y'],
    ['SALE', '2027-01-20', 'INV-1002', 'Gulf Buyer FZE', '', 'AE', 'Export of goods', '4000', '2500.000', '0', '', 'N', 'N', 'N', 'Y'],
    ['PURCHASE', '2027-01-10', 'P-778', 'Muscat Supplies SAOC', 'OM1100054321', 'OM', 'Stationery', '5100', '200.000', '10.000', '', 'N', 'N', 'N', 'Y'],
    ['PURCHASE', '2027-02-02', 'US-55', 'Cloud Software Inc', '', 'US', 'Software subscription', '5200', '300.000', '0', '', 'Y', 'N', 'N', 'Y'],
  ];
  const ws = XLSX.utils.aoa_to_sheet([header, ...sample]);
  ws['!cols'] = header.map(() => ({ wch: 26 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
  const help = XLSX.utils.aoa_to_sheet([
    ['Triple i Oman — transaction import template / قالب استيراد المعاملات'],
    ['Amounts in OMR with up to 3 decimals (baisa). المبالغ بالريال العماني حتى 3 خانات عشرية.'],
    ['VAT category (optional): STANDARD, ZERO_RATED, EXEMPT, OUT_OF_SCOPE, REVERSE_CHARGE — leave empty to let Triple i Oman suggest it.'],
    ['Dates: YYYY-MM-DD or DD/MM/YYYY.'],
  ]);
  XLSX.utils.book_append_sheet(wb, help, 'Help');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="triplei-oman-transactions-template.xlsx"');
  res.send(buf);
});

function mapHeader(h) {
  const s = String(h || '').trim().toLowerCase();
  for (const c of COLUMNS) {
    const parts = [c.en, c.ar, c.key, `${c.en} | ${c.ar}`].map((x) => x.toLowerCase());
    if (parts.includes(s) || s.startsWith(c.en.toLowerCase().split(' (')[0]) || s.includes(c.ar.toLowerCase())) return c.key;
  }
  return null;
}

router.post('/import', requirePermission('data.write'), upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Upload an Excel (.xlsx) or CSV file.');
  const { values: rules } = await rulesSvc.all();
  const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: false, raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  if (aoa.length < 2) throw new HttpError(400, 'The file has no data rows.');
  const headers = aoa[0].map(mapHeader);
  const missing = COLUMNS.filter((c) => c.required && !headers.includes(c.key));
  if (missing.length) throw new HttpError(400, `Missing required columns: ${missing.map((m) => `${m.en} / ${m.ar}`).join(', ')}. Download the template to see the expected layout.`);

  const errors = [];
  const parsed = [];
  aoa.slice(1).forEach((row, i) => {
    const rowNo = i + 2;
    if (row.every((c) => c === '' || c === null)) return;
    const r = {};
    headers.forEach((k, j) => { if (k) r[k] = row[j]; });
    try {
      const dir = String(r.direction || '').trim().toUpperCase();
      const direction = ['SALE', 'S', 'بيع', 'SALES'].includes(dir) ? 'SALE' : ['PURCHASE', 'P', 'شراء', 'PURCHASES'].includes(dir) ? 'PURCHASE' : null;
      if (!direction) throw new Error('Type must be SALE or PURCHASE / النوع يجب أن يكون بيع أو شراء');
      const cat = r.vatCategory ? CAT_ALIASES[String(r.vatCategory).trim().toUpperCase().replace(/[\s-]/g, '_')] : null;
      if (r.vatCategory && !cat) throw new Error(`Unknown VAT category "${r.vatCategory}"`);
      parsed.push({
        rowNo, organisationId: req.org.id, direction, date: d(r.date), invoiceNumber: r.invoiceNumber ? String(r.invoiceNumber).trim() : null,
        counterpartyName: r.counterpartyName ? String(r.counterpartyName).trim() : null,
        counterpartyVat: r.counterpartyVat ? String(r.counterpartyVat).trim().toUpperCase().replace(/\s/g, '') : null,
        counterpartyCountry: r.counterpartyCountry ? String(r.counterpartyCountry).trim().toUpperCase().slice(0, 2) : 'OM',
        description: r.description ? String(r.description).trim() : null, accountCode: r.accountCode ? String(r.accountCode).trim() : null,
        netBaisa: toBaisa(r.net), vatBaisa: toBaisa(r.vat || 0), vatCategory: cat, categorySource: cat ? 'IMPORT' : null,
        isService: yes(r.isService), isImport: yes(r.isImport), isCreditNote: yes(r.isCreditNote), hasTaxInvoice: r.hasTaxInvoice === undefined || r.hasTaxInvoice === '' ? true : yes(r.hasTaxInvoice),
      });
    } catch (err) {
      errors.push({ row: rowNo, message: err.message });
    }
  });

  // Apply saved chart-of-accounts mappings (plan E3-05).
  const maps = await prisma.accountMapping.findMany({ where: { organisationId: req.org.id } });
  const mapByCode = Object.fromEntries(maps.map((m) => [m.accountCode, m.taxCategory]));
  for (const p of parsed) if (!p.vatCategory && p.accountCode && mapByCode[p.accountCode]) { p.vatCategory = mapByCode[p.accountCode]; p.categorySource = 'IMPORT'; }

  const existing = await prisma.transaction.findMany({ where: { organisationId: req.org.id }, select: { direction: true, invoiceNumber: true, counterpartyName: true } });
  const dupes = vat.duplicateIndex([...existing, ...parsed]);
  const batch = await prisma.importBatch.create({ data: { organisationId: req.org.id, source: req.file.originalname.toLowerCase().endsWith('.csv') ? 'CSV' : 'EXCEL', filename: req.file.originalname, rowCount: parsed.length, errorCount: errors.length, errors, createdById: req.user.id } });
  const data = [];
  for (const p of parsed) {
    const e = await enrich(p, rules, { duplicateKeys: dupes });
    const { rowNo, classification, ...rest } = e;
    data.push({ ...rest, importBatchId: batch.id });
  }
  if (data.length) await prisma.transaction.createMany({ data });
  await audit.record({ req, action: 'transactions.imported', objectType: 'import_batch', objectId: batch.id, details: { filename: req.file.originalname, rows: data.length, errors: errors.length } });
  const flagged = data.filter((x) => x.flags.length).length;
  res.status(201).json({ batchId: batch.id, imported: data.length, flagged, needsCategory: data.filter((x) => !x.vatCategory).length, errors });
}));

const EDITABLE = ['direction', 'date', 'invoiceNumber', 'counterpartyName', 'counterpartyVat', 'counterpartyCountry', 'description', 'accountCode', 'isService', 'isImport', 'isCreditNote', 'hasTaxInvoice', 'inputBlocked'];

function fromBody(b) {
  const data = {};
  for (const k of EDITABLE) if (b[k] !== undefined) data[k] = b[k];
  if (data.date) data.date = d(data.date);
  if (data.counterpartyVat) data.counterpartyVat = String(data.counterpartyVat).toUpperCase().replace(/\s/g, '');
  if (b.netOmr !== undefined) data.netBaisa = toBaisa(b.netOmr);
  if (b.vatOmr !== undefined) data.vatBaisa = toBaisa(b.vatOmr);
  if (b.vatCategory !== undefined) {
    if (b.vatCategory && !vat.CATEGORIES.includes(b.vatCategory)) throw new HttpError(400, 'Invalid VAT category');
    data.vatCategory = b.vatCategory || null;
    data.categorySource = b.vatCategory ? 'USER' : null;
  }
  return data;
}

router.post('/', requirePermission('data.write'), asyncHandler(async (req, res) => {
  const { values: rules } = await rulesSvc.all();
  const data = fromBody(req.body || {});
  if (!data.direction || !data.date || data.netBaisa === undefined) throw new HttpError(400, 'Type, date and net amount are required.');
  const e = await enrich({ organisationId: req.org.id, counterpartyCountry: 'OM', vatBaisa: 0n, ...data }, rules, {});
  const { classification, ...rest } = e;
  const tx = await prisma.transaction.create({ data: rest });
  await audit.record({ req, action: 'transaction.created', objectType: 'transaction', objectId: tx.id, after: tx });
  res.status(201).json({ ...tx, classification });
}));

router.patch('/:id', requirePermission('data.write'), asyncHandler(async (req, res) => {
  const tx = await prisma.transaction.findFirst({ where: { id: req.params.id, organisationId: req.org.id } });
  if (!tx) throw new HttpError(404, 'Transaction not found');
  if (tx.lockedByReturnId) throw new HttpError(409, 'This transaction is part of an approved return and is locked. Correct it in the next return (or a voluntary disclosure).');
  const { values: rules } = await rulesSvc.all();
  const merged = { ...tx, ...fromBody(req.body || {}) };
  const e = await enrich(merged, rules, {});
  const { classification, id, organisationId, createdAt, updatedAt, ...rest } = e;
  const updated = await prisma.transaction.update({ where: { id: tx.id }, data: rest });
  await audit.record({ req, action: 'transaction.updated', objectType: 'transaction', objectId: tx.id, before: tx, after: updated });
  res.json({ ...updated, classification });
}));

router.delete('/:id', requirePermission('data.write'), asyncHandler(async (req, res) => {
  const tx = await prisma.transaction.findFirst({ where: { id: req.params.id, organisationId: req.org.id } });
  if (!tx) throw new HttpError(404, 'Transaction not found');
  if (tx.lockedByReturnId) throw new HttpError(409, 'Locked by an approved return.');
  await prisma.transaction.delete({ where: { id: tx.id } });
  await audit.record({ req, action: 'transaction.deleted', objectType: 'transaction', objectId: tx.id, before: tx });
  res.json({ ok: true });
}));

router.post('/reclassify', requirePermission('data.write'), asyncHandler(async (req, res) => {
  const { values: rules } = await rulesSvc.all();
  const txs = await prisma.transaction.findMany({ where: { organisationId: req.org.id, lockedByReturnId: null } });
  const dupes = vat.duplicateIndex(txs);
  let changed = 0;
  for (const tx of txs) {
    const e = await enrich(tx, rules, { duplicateKeys: dupes });
    if (e.vatCategory !== tx.vatCategory || JSON.stringify(e.flags) !== JSON.stringify(tx.flags)) {
      await prisma.transaction.update({ where: { id: tx.id }, data: { vatCategory: e.vatCategory, categorySource: e.categorySource, flags: e.flags } });
      changed++;
    }
  }
  await audit.record({ req, action: 'transactions.reclassified', details: { changed } });
  res.json({ checked: txs.length, changed });
}));

// Chart of accounts → tax category mapping (plan E3-05)
router.get('/account-mappings', asyncHandler(async (req, res) => {
  const maps = await prisma.accountMapping.findMany({ where: { organisationId: req.org.id }, orderBy: { accountCode: 'asc' } });
  const used = await prisma.transaction.groupBy({ by: ['accountCode'], where: { organisationId: req.org.id, accountCode: { not: null } }, _count: true });
  res.json({ mappings: maps, unmapped: used.filter((u) => !maps.find((m) => m.accountCode === u.accountCode)).map((u) => ({ accountCode: u.accountCode, count: u._count })) });
}));

router.put('/account-mappings/:code', requirePermission('data.write'), asyncHandler(async (req, res) => {
  const { taxCategory, accountName } = req.body || {};
  if (!vat.CATEGORIES.includes(taxCategory)) throw new HttpError(400, 'Invalid category');
  const existing = await prisma.accountMapping.findUnique({ where: { organisationId_accountCode: { organisationId: req.org.id, accountCode: req.params.code } } });
  const history = [...(existing?.history || []), { at: new Date().toISOString(), by: req.user.email, from: existing?.taxCategory || null, to: taxCategory }];
  const m = await prisma.accountMapping.upsert({
    where: { organisationId_accountCode: { organisationId: req.org.id, accountCode: req.params.code } },
    create: { organisationId: req.org.id, accountCode: req.params.code, accountName, taxCategory, history },
    update: { taxCategory, accountName, history },
  });
  await audit.record({ req, action: 'account_mapping.updated', objectType: 'account_mapping', objectId: m.id, details: { code: req.params.code, taxCategory } });
  res.json(m);
}));

module.exports = router;
