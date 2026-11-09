const router = require('express').Router();
const JSZip = require('jszip');
const prisma = require('../config/prisma');
const audit = require('../services/audit');
const { fromBaisa } = require('../lib/money');
const { d, iso } = require('../lib/dates');
const { asyncHandler } = require('../lib/errors');
const { authenticate, withOrg, requirePermission } = require('../middleware/auth');

router.use(authenticate, withOrg, requirePermission('audit.read'));

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows, cols) => [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n');

router.get('/', asyncHandler(async (req, res) => {
  const take = Math.min(500, Number(req.query.limit) || 100);
  const where = { organisationId: req.org.id };
  if (req.query.action) where.action = { startsWith: String(req.query.action) };
  const rows = await prisma.auditLog.findMany({ where, orderBy: { seq: 'desc' }, take, ...(req.query.before ? { cursor: { seq: BigInt(req.query.before) }, skip: 1 } : {}) });
  res.json(rows);
}));

router.get('/verify', asyncHandler(async (req, res) => res.json(await audit.verifyChain())));

router.get('/export.csv', asyncHandler(async (req, res) => {
  const rows = await prisma.auditLog.findMany({ where: { organisationId: req.org.id }, orderBy: { seq: 'asc' } });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
  res.send(`﻿${toCsv(rows.map((r) => ({ ...r, seq: String(r.seq), createdAt: r.createdAt.toISOString() })), ['seq', 'createdAt', 'actorLabel', 'action', 'objectType', 'objectId', 'beforeHash', 'afterHash', 'ip', 'details', 'prevHash', 'hash'])}`);
}));

/** One-click audit-ready pack for a period (plan E11-01): returns, workings, transactions, e-invoices, approvals, audit log. */
router.get('/pack', asyncHandler(async (req, res) => {
  const from = req.query.from ? d(req.query.from) : new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
  const to = req.query.to ? d(req.query.to) : d(new Date());
  const org = req.org;
  const [returns, txs, invoices, logs, docs] = await Promise.all([
    prisma.taxReturn.findMany({ where: { organisationId: org.id, periodStart: { gte: from }, periodEnd: { lte: to } } }),
    prisma.transaction.findMany({ where: { organisationId: org.id, date: { gte: from, lte: to } }, orderBy: { date: 'asc' } }),
    prisma.eInvoice.findMany({ where: { organisationId: org.id, issueDate: { gte: from, lte: to } } }),
    prisma.auditLog.findMany({ where: { organisationId: org.id, createdAt: { gte: from, lte: new Date(to.getTime() + 86400000) } }, orderBy: { seq: 'asc' } }),
    prisma.taxDocument.findMany({ where: { organisationId: org.id, createdAt: { gte: from, lte: new Date(to.getTime() + 86400000) } } }),
  ]);
  const zip = new JSZip();
  const index = [`Triple i Oman — audit pack`, `Organisation: ${org.legalNameEn} (${org.vatNumber || 'no VAT number'})`, `Period: ${iso(from)} to ${iso(to)}`, `Generated: ${new Date().toISOString()} by ${req.user.email}`, '',
    `returns/            ${returns.length} return(s) with box values, explanation tree, approvals and rule versions`,
    `transactions.csv    ${txs.length} source transaction(s)`,
    `einvoices/          ${invoices.length} e-invoice XML file(s) with SHA-256`,
    `documents/          ${docs.length} supporting document(s)`,
    `audit-log.csv       ${logs.length} hash-chained audit event(s)`];
  zip.file('INDEX.txt', index.join('\n'));
  for (const r of returns) zip.file(`returns/${r.taxType}_${iso(r.periodStart)}_${iso(r.periodEnd)}_${r.status}.json`, JSON.stringify(r, null, 2));
  zip.file('transactions.csv', `﻿${toCsv(txs.map((t) => ({ ...t, date: iso(t.date), net: fromBaisa(t.netBaisa), vat: fromBaisa(t.vatBaisa), flags: (t.flags || []).map((f) => f.code).join('|') })), ['date', 'direction', 'invoiceNumber', 'counterpartyName', 'counterpartyVat', 'counterpartyCountry', 'description', 'net', 'vat', 'vatCategory', 'categorySource', 'isCreditNote', 'flags', 'lockedByReturnId', 'id'])}`);
  for (const inv of invoices) {
    if (inv.xml) zip.file(`einvoices/${inv.direction}_${inv.number.replace(/[^\w.@-]/g, '_')}.xml`, inv.xml);
  }
  zip.file('einvoices/manifest.csv', toCsv(invoices.map((i) => ({ ...i, issueDate: iso(i.issueDate), total: fromBaisa(i.totalBaisa) })), ['direction', 'docType', 'number', 'issueDate', 'status', 'total', 'sha256', 'aspMessageId']));
  for (const doc of docs) zip.file(`documents/${doc.category}_${doc.id.slice(0, 8)}_${doc.filename.replace(/[^\w.-]/g, '_')}`, Buffer.from(doc.data));
  zip.file('audit-log.csv', `﻿${toCsv(logs.map((r) => ({ ...r, seq: String(r.seq), createdAt: r.createdAt.toISOString() })), ['seq', 'createdAt', 'actorLabel', 'action', 'objectType', 'objectId', 'details', 'prevHash', 'hash'])}`);
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  await audit.record({ req, action: 'audit.pack_exported', details: { from: iso(from), to: iso(to), returns: returns.length, transactions: txs.length } });
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="audit-pack_${iso(from)}_${iso(to)}.zip"`);
  res.send(buf);
}));

module.exports = router;
