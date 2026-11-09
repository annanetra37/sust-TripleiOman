const router = require('express').Router();
const crypto = require('crypto');
const prisma = require('../config/prisma');
const audit = require('../services/audit');
const rulesSvc = require('../services/rules');
const notify = require('../services/notify');
const vatEngine = require('../engines/vat');
const citEngine = require('../engines/cit');
const exciseEngine = require('../engines/excise');
const { toBaisa, sum, fromBaisa } = require('../lib/money');
const { d, iso, endOfMonth, addMonths } = require('../lib/dates');
const { HttpError, asyncHandler } = require('../lib/errors');
const { authenticate, withOrg, requirePermission } = require('../middleware/auth');

router.use(authenticate, withOrg);

async function findReturn(req) {
  const r = await prisma.taxReturn.findFirst({ where: { id: req.params.id, organisationId: req.org.id } });
  if (!r) throw new HttpError(404, 'Return not found');
  return r;
}

async function linkObligation(orgId, taxType, periodStart, periodEnd) {
  return prisma.obligation.findFirst({ where: { organisationId: orgId, taxType, periodStart: d(periodStart), periodEnd: d(periodEnd) } });
}

async function setObligationStatus(r, status) {
  if (r.obligationId) await prisma.obligation.update({ where: { id: r.obligationId }, data: { status } }).catch(() => {});
}

// ─── List & read ───
router.get('/', asyncHandler(async (req, res) => {
  const where = { organisationId: req.org.id };
  if (req.query.taxType) where.taxType = String(req.query.taxType);
  const rows = await prisma.taxReturn.findMany({ where, orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }], select: { id: true, taxType: true, periodStart: true, periodEnd: true, status: true, amountDueBaisa: true, preparedById: true, reviewedById: true, submissionRef: true, paidAt: true, updatedAt: true } });
  res.json(rows);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const r = await findReturn(req);
  const { values } = await rulesSvc.all(r.periodEnd);
  const people = await prisma.user.findMany({ where: { id: { in: [r.preparedById, r.reviewedById].filter(Boolean) } }, select: { id: true, fullName: true, email: true } });
  const docs = await prisma.taxDocument.findMany({ where: { organisationId: req.org.id, relatedType: 'return', relatedId: r.id }, select: { id: true, title: true, category: true, filename: true, createdAt: true } });
  res.json({ ...r, form: r.taxType === 'VAT' ? values['vat.returnForm'].boxes : null, people, documents: docs, canApprove: r.preparedById !== req.user.id });
}));

// Drill-down: the transactions behind a box (plan E4-05)
router.get('/:id/box/:boxId', asyncHandler(async (req, res) => {
  const r = await findReturn(req);
  const ex = r.explanation?.[req.params.boxId];
  if (!ex) throw new HttpError(404, 'Box not found');
  const txs = ex.txIds?.length ? await prisma.transaction.findMany({ where: { id: { in: ex.txIds }, organisationId: req.org.id }, orderBy: { date: 'asc' } }) : [];
  res.json({ box: req.params.boxId, explanation: ex, value: r.boxes[req.params.boxId], transactions: txs });
}));

// ─── VAT return: prepare / recompute (plan E4-05) ───
async function computeVat(org, periodStart, periodEnd) {
  const { values, versions } = await rulesSvc.all(periodEnd);
  const txs = await prisma.transaction.findMany({ where: { organisationId: org.id, date: { gte: d(periodStart), lte: d(periodEnd) } } });
  const prev = await prisma.taxReturn.findFirst({ where: { organisationId: org.id, taxType: 'VAT', periodEnd: { lt: d(periodStart) }, status: { in: ['APPROVED', 'SUBMITTED', 'PAID'] } }, orderBy: { periodEnd: 'desc' } });
  const out = vatEngine.computeReturn(txs, { periodStart, periodEnd, rules: values, ruleVersions: versions, previousBoxes: prev?.boxes || null });
  if (!txs.length) out.exceptions.push({ code: 'NO_DATA', severity: 'warning', messageEn: 'No transactions found for this period. Import sales and purchases first (or confirm a nil return).', messageAr: 'لا توجد معاملات لهذه الفترة.' });
  return { out, versions, txCount: txs.length };
}

router.post('/vat', requirePermission('return.prepare'), asyncHandler(async (req, res) => {
  let { periodStart, periodEnd, obligationId } = req.body || {};
  let ob = null;
  if (obligationId) {
    ob = await prisma.obligation.findFirst({ where: { id: obligationId, organisationId: req.org.id, taxType: 'VAT' } });
    if (!ob) throw new HttpError(404, 'VAT obligation not found');
    periodStart = ob.periodStart; periodEnd = ob.periodEnd;
  }
  if (!periodStart || !periodEnd) throw new HttpError(400, 'Choose the VAT period (start and end dates).');
  periodStart = d(periodStart); periodEnd = d(periodEnd);
  if (periodEnd < periodStart) throw new HttpError(400, 'Period end must be after period start.');
  ob = ob || await linkObligation(req.org.id, 'VAT', periodStart, periodEnd);
  const existing = await prisma.taxReturn.findFirst({ where: { organisationId: req.org.id, taxType: 'VAT', periodStart, periodEnd, status: { notIn: ['REJECTED'] } } });
  if (existing && existing.locked) throw new HttpError(409, 'An approved return already exists for this period.');
  const { out, versions, txCount } = await computeVat(req.org, periodStart, periodEnd);
  const data = {
    boxes: out.boxes, explanation: out.explanation, exceptions: out.exceptions, ruleVersions: versions, amountDueBaisa: out.amountDueBaisa,
    inputs: { transactionCount: txCount, apportionment: out.apportionment, computedAt: new Date().toISOString() },
  };
  const r = existing
    ? await prisma.taxReturn.update({ where: { id: existing.id }, data: { ...data, status: 'DRAFT' } })
    : await prisma.taxReturn.create({ data: { ...data, organisationId: req.org.id, obligationId: ob?.id || null, taxType: 'VAT', periodStart, periodEnd, preparedById: req.user.id } });
  if (ob && ['NOT_STARTED', 'DATA_MISSING'].includes(ob.status)) await prisma.obligation.update({ where: { id: ob.id }, data: { status: txCount ? 'READY_FOR_REVIEW' : 'DATA_MISSING' } });
  await audit.record({ req, action: existing ? 'return.recomputed' : 'return.prepared', objectType: 'tax_return', objectId: r.id, after: data, details: { taxType: 'VAT', period: `${iso(periodStart)}..${iso(periodEnd)}`, due: Number(out.amountDueBaisa) } });
  res.status(existing ? 200 : 201).json(r);
}));

router.post('/:id/recompute', requirePermission('return.prepare'), asyncHandler(async (req, res) => {
  const r = await findReturn(req);
  if (r.locked) throw new HttpError(409, 'Approved returns are locked.');
  if (r.taxType !== 'VAT') throw new HttpError(400, 'Re-run the calculator for this tax type to update the draft.');
  const { out, versions, txCount } = await computeVat(req.org, r.periodStart, r.periodEnd);
  const updated = await prisma.taxReturn.update({ where: { id: r.id }, data: { boxes: out.boxes, explanation: out.explanation, exceptions: out.exceptions, ruleVersions: versions, amountDueBaisa: out.amountDueBaisa, status: 'DRAFT', inputs: { transactionCount: txCount, apportionment: out.apportionment, computedAt: new Date().toISOString() } } });
  await audit.record({ req, action: 'return.recomputed', objectType: 'tax_return', objectId: r.id, before: r.boxes, after: out.boxes });
  res.json(updated);
}));

// ─── CIT return draft (plan E6-04) ───
router.post('/cit', requirePermission('return.prepare'), asyncHandler(async (req, res) => {
  const b = req.body || {};
  const fyEndMonth = req.org.fiscalYearEndMonth || 12;
  const year = Number(b.taxYear) || new Date().getUTCFullYear() - 1;
  const periodEnd = endOfMonth(year, fyEndMonth - 1);
  const periodStart = d(addMonths(periodEnd, -12)); periodStart.setUTCDate(periodStart.getUTCDate() + 1);
  const { values, versions } = await rulesSvc.all(periodEnd);
  const input = {
    taxYear: year,
    accountingProfitBaisa: toBaisa(b.accountingProfitOmr),
    adjustments: (b.adjustments || []).map((a) => ({ description: a.description, type: a.type === 'DEDUCT' ? 'DEDUCT' : 'ADD', amountBaisa: toBaisa(a.amountOmr) })),
    lossesBroughtForward: (b.losses || []).map((l) => ({ year: Number(l.year), amountBaisa: toBaisa(l.amountOmr) })),
    credits: (b.credits || []).map((c) => ({ description: c.description, amountBaisa: toBaisa(c.amountOmr) })),
    provisionalPaidBaisa: toBaisa(b.provisionalPaidOmr || 0),
    smallEnterprise: b.smallEnterprise ? { paidUpCapitalBaisa: toBaisa(b.smallEnterprise.paidUpCapitalOmr), grossIncomeBaisa: toBaisa(b.smallEnterprise.grossIncomeOmr), averageEmployees: Number(b.smallEnterprise.averageEmployees), activity: b.smallEnterprise.activity, omaniOwnedOrSoleProprietor: !!b.smallEnterprise.omaniOwnedOrSoleProprietor } : null,
  };
  const out = citEngine.compute(input, values);
  const ob = await linkObligation(req.org.id, 'CIT', periodStart, periodEnd);
  const exceptions = [];
  if (out.smallEnterprise?.eligible) exceptions.push({ code: 'VERIFY', severity: 'warning', messageEn: out.smallEnterprise.noteEn, messageAr: 'تحقق من شروط معدل 3% مع مستشارك الضريبي.' });
  if (!b.financialStatementsAttached) exceptions.push({ code: 'ATTACHMENTS', severity: 'warning', messageEn: 'Attach audited financial statements and the supporting pack before approval.', messageAr: 'أرفق القوائم المالية المدققة قبل الاعتماد.' });
  const data = { boxes: { taxableIncome: { tax: out.taxableIncomeBaisa }, grossTax: { tax: out.grossTaxBaisa }, credits: { tax: out.creditsBaisa }, payable: { tax: out.payableBaisa } }, explanation: { steps: out.steps, smallEnterprise: out.smallEnterprise, losses: { used: out.lossesUsed, expired: out.lossesExpired, carriedForward: out.lossesCarriedForward } }, exceptions, inputs: input, ruleVersions: versions, amountDueBaisa: out.payableBaisa };
  const existing = await prisma.taxReturn.findFirst({ where: { organisationId: req.org.id, taxType: 'CIT', periodStart, periodEnd, locked: false } });
  const r = existing ? await prisma.taxReturn.update({ where: { id: existing.id }, data: { ...data, status: 'DRAFT' } })
    : await prisma.taxReturn.create({ data: { ...data, organisationId: req.org.id, obligationId: ob?.id || null, taxType: 'CIT', periodStart, periodEnd, preparedById: req.user.id } });
  await audit.record({ req, action: 'return.prepared', objectType: 'tax_return', objectId: r.id, after: data, details: { taxType: 'CIT', year } });
  res.status(201).json({ ...r, result: out });
}));

// ─── WHT monthly statement (plan E7-03) ───
router.post('/wht', requirePermission('return.prepare'), asyncHandler(async (req, res) => {
  const month = String(req.body?.month || '');
  if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, 'Month must be YYYY-MM.');
  const [y, m] = month.split('-').map(Number);
  const periodStart = new Date(Date.UTC(y, m - 1, 1)); const periodEnd = endOfMonth(y, m - 1);
  const { versions } = await rulesSvc.all(periodEnd);
  const payments = await prisma.whtPayment.findMany({ where: { organisationId: req.org.id, paymentDate: { gte: periodStart, lte: periodEnd } }, include: { party: true }, orderBy: { paymentDate: 'asc' } });
  const total = sum(payments.map((p) => p.whtBaisa));
  const lines = payments.map((p) => ({ id: p.id, date: iso(p.paymentDate), payee: p.party.nameEn, country: p.party.country, category: p.category, gross: p.grossBaisa, rateBp: p.rateBp, treaty: p.treatyApplied, wht: p.whtBaisa }));
  const ob = await linkObligation(req.org.id, 'WHT', periodStart, periodEnd);
  const data = { boxes: { totalWht: { tax: total }, payments: { value: payments.length } }, explanation: { lines }, exceptions: payments.length ? [] : [{ code: 'NO_DATA', severity: 'warning', messageEn: 'No payments to foreign parties recorded for this month (nil statement).', messageAr: 'لا توجد مدفوعات مسجلة لهذا الشهر.' }], inputs: { paymentIds: payments.map((p) => p.id) }, ruleVersions: versions, amountDueBaisa: total };
  const existing = await prisma.taxReturn.findFirst({ where: { organisationId: req.org.id, taxType: 'WHT', periodStart, periodEnd, locked: false } });
  const r = existing ? await prisma.taxReturn.update({ where: { id: existing.id }, data: { ...data, status: 'DRAFT' } })
    : await prisma.taxReturn.create({ data: { ...data, organisationId: req.org.id, obligationId: ob?.id || null, taxType: 'WHT', periodStart, periodEnd, preparedById: req.user.id } });
  await audit.record({ req, action: 'return.prepared', objectType: 'tax_return', objectId: r.id, details: { taxType: 'WHT', month, total: Number(total) } });
  res.status(201).json(r);
}));

// ─── Excise quarterly return (plan E8-03) ───
router.post('/excise', requirePermission('return.prepare'), asyncHandler(async (req, res) => {
  const { periodStart, periodEnd, lines = [] } = req.body || {};
  if (!periodStart || !periodEnd) throw new HttpError(400, 'Choose the excise period.');
  const { values, versions } = await rulesSvc.all(periodEnd);
  const out = exciseEngine.compute(lines.map((l) => ({ ...l, unitPriceBaisa: toBaisa(l.unitPriceOmr), referencePriceBaisa: toBaisa(l.referencePriceOmr || 0) })), values);
  const errs = out.lines.filter((l) => l.error);
  if (errs.length) throw new HttpError(400, errs[0].error);
  const ps = d(periodStart); const pe = d(periodEnd);
  const ob = await linkObligation(req.org.id, 'EXCISE', ps, pe);
  const data = { boxes: { base: { value: out.totalBaseBaisa }, excise: { tax: out.totalExciseBaisa } }, explanation: { lines: out.lines }, exceptions: [], inputs: { lines }, ruleVersions: versions, amountDueBaisa: out.totalExciseBaisa };
  const r = await prisma.taxReturn.create({ data: { ...data, organisationId: req.org.id, obligationId: ob?.id || null, taxType: 'EXCISE', periodStart: ps, periodEnd: pe, preparedById: req.user.id } });
  await audit.record({ req, action: 'return.prepared', objectType: 'tax_return', objectId: r.id, details: { taxType: 'EXCISE' } });
  res.status(201).json(r);
}));

// ─── Approval workflow (plan E4-07): preparer → approver (four eyes) → locked ───
router.post('/:id/submit-review', requirePermission('return.prepare'), asyncHandler(async (req, res) => {
  const r = await findReturn(req);
  if (!['DRAFT', 'REJECTED'].includes(r.status)) throw new HttpError(409, `Cannot submit a return in status ${r.status}.`);
  const blocking = (r.exceptions || []).filter((e) => e.severity === 'error');
  if (blocking.length && !req.body?.acknowledgeExceptions) throw new HttpError(422, `${blocking.length} data error(s) must be fixed (or explicitly acknowledged) before review.`, blocking.slice(0, 20));
  const updated = await prisma.taxReturn.update({ where: { id: r.id }, data: { status: 'IN_REVIEW', submittedForReviewAt: new Date() } });
  await setObligationStatus(r, 'READY_FOR_REVIEW');
  await audit.record({ req, action: 'return.submitted_for_review', objectType: 'tax_return', objectId: r.id, details: { acknowledgedExceptions: blocking.length } });
  await notify.toRoles(req.org.id, ['OWNER', 'FINANCE_ADMIN', 'APPROVER'], { type: 'RETURN_REVIEW', title: `${r.taxType} return ready for your approval`, body: `Period ${iso(r.periodStart)} to ${iso(r.periodEnd)} — amount OMR ${fromBaisa(r.amountDueBaisa)}`, link: `/returns/${r.id}` }, req.user.id);
  res.json(updated);
}));

router.post('/:id/approve', requirePermission('return.approve'), asyncHandler(async (req, res) => {
  const r = await findReturn(req);
  if (r.status !== 'IN_REVIEW') throw new HttpError(409, 'Only returns in review can be approved.');
  if (r.preparedById === req.user.id) throw new HttpError(403, 'Four-eyes rule: you prepared this return, so someone else must approve it.');
  if (!req.body?.confirm) throw new HttpError(400, 'Tick the confirmation that you reviewed the return and its exceptions.');
  const approvedAt = new Date();
  const signatureHash = crypto.createHash('sha256').update(JSON.stringify({ id: r.id, boxes: r.boxes, amount: String(r.amountDueBaisa), by: req.user.id, at: approvedAt.toISOString() })).digest('hex');
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.taxReturn.update({ where: { id: r.id }, data: { status: 'APPROVED', reviewedById: req.user.id, reviewComment: req.body?.comment || null, approvedAt, signatureHash, locked: true } });
    if (r.taxType === 'VAT') await tx.transaction.updateMany({ where: { organisationId: r.organisationId, date: { gte: r.periodStart, lte: r.periodEnd }, lockedByReturnId: null }, data: { lockedByReturnId: r.id } });
    return u;
  });
  await setObligationStatus(r, 'APPROVED');
  await audit.record({ req, action: 'return.approved', objectType: 'tax_return', objectId: r.id, after: { boxes: r.boxes, amountDueBaisa: r.amountDueBaisa }, details: { signatureHash, comment: req.body?.comment } });
  await notify.toUser(r.preparedById, req.org.id, { type: 'RETURN_APPROVED', title: `${r.taxType} return approved`, body: `Approved by ${req.user.fullName}. Next: file it on the TaxOman portal with the filing companion.`, link: `/returns/${r.id}` });
  res.json(updated);
}));

router.post('/:id/reject', requirePermission('return.approve'), asyncHandler(async (req, res) => {
  const r = await findReturn(req);
  if (r.status !== 'IN_REVIEW') throw new HttpError(409, 'Only returns in review can be rejected.');
  if (!req.body?.comment) throw new HttpError(400, 'Add a comment explaining what needs to change.');
  const updated = await prisma.taxReturn.update({ where: { id: r.id }, data: { status: 'REJECTED', reviewedById: req.user.id, reviewComment: req.body.comment } });
  await audit.record({ req, action: 'return.rejected', objectType: 'tax_return', objectId: r.id, details: { comment: req.body.comment } });
  await notify.toUser(r.preparedById, req.org.id, { type: 'RETURN_REJECTED', title: `${r.taxType} return sent back`, body: req.body.comment, link: `/returns/${r.id}` });
  res.json(updated);
}));

// ─── Filing companion (plan E4-08) ───
router.get('/:id/companion', asyncHandler(async (req, res) => {
  const r = await findReturn(req);
  const { values } = await rulesSvc.all(r.periodEnd);
  const steps = [
    { en: 'Open the TaxOman portal (tms.taxoman.gov.om) in a new tab and sign in with YOUR OWN credentials. Triple i Oman never asks for your TaxOman password.', ar: 'افتح بوابة جهاز الضرائب (tms.taxoman.gov.om) وسجّل الدخول ببيانات اعتمادك الخاصة. لا تطلب تريبل آي عُمان كلمة مرورك أبداً.' },
    { en: `Go to Returns → ${r.taxType === 'VAT' ? 'VAT Return' : r.taxType === 'CIT' ? 'Income Tax Return' : r.taxType === 'WHT' ? 'Withholding Tax' : 'Excise Tax Return'} and choose the period ${iso(r.periodStart)} to ${iso(r.periodEnd)}.`, ar: `اذهب إلى الإقرارات واختر الفترة من ${iso(r.periodStart)} إلى ${iso(r.periodEnd)}.` },
    { en: 'Copy each value below into the matching box using the copy buttons.', ar: 'انسخ كل قيمة أدناه إلى المربع المطابق باستخدام أزرار النسخ.' },
    { en: 'Check the portal total equals the Triple i Oman total, then submit on the portal.', ar: 'تأكد أن الإجمالي في البوابة يساوي الإجمالي هنا، ثم قدّم الإقرار.' },
    { en: 'Come back here, enter the submission reference number and upload the acknowledgement PDF.', ar: 'عد إلى هنا وأدخل الرقم المرجعي للتقديم وارفع إشعار الاستلام.' },
    { en: 'Pay the amount due (bank transfer or the portal payment options) and record the payment.', ar: 'ادفع المبلغ المستحق وسجّل الدفع.' },
  ];
  let fields = [];
  if (r.taxType === 'VAT') {
    fields = values['vat.returnForm'].boxes.flatMap((b) => {
      const v = r.boxes[b.id] || { value: 0, tax: 0 };
      const out = [];
      if (b.kind.includes('value')) out.push({ box: b.id, part: 'value', labelEn: `${b.id} — ${b.labelEn} (amount)`, labelAr: `${b.id} — ${b.labelAr} (المبلغ)`, value: fromBaisa(v.value) });
      if (b.kind.includes('tax')) out.push({ box: b.id, part: 'tax', labelEn: `${b.id} — ${b.labelEn} (VAT)`, labelAr: `${b.id} — ${b.labelAr} (الضريبة)`, value: fromBaisa(v.tax) });
      return out;
    });
  } else {
    fields = Object.entries(r.boxes).map(([k, v]) => ({ box: k, labelEn: k, labelAr: k, value: v.tax !== undefined ? fromBaisa(v.tax) : String(v.value) }));
  }
  res.json({ status: r.status, canFile: ['APPROVED', 'SUBMITTED'].includes(r.status), steps, fields, amountDue: fromBaisa(r.amountDueBaisa), dueDate: r.obligationId ? (await prisma.obligation.findUnique({ where: { id: r.obligationId } }))?.dueDate : null, portalUrl: 'https://tms.taxoman.gov.om', portalVersionNote: 'Portal layout as of November 2026 [VERIFY screenshots each quarter].' });
}));

router.post('/:id/record-submission', requirePermission('return.file'), asyncHandler(async (req, res) => {
  const r = await findReturn(req);
  if (r.status !== 'APPROVED') throw new HttpError(409, 'A return must be approved before it is filed. Nothing is submitted without a named human approval.');
  const ref = String(req.body?.submissionRef || '').trim();
  if (ref.length < 3) throw new HttpError(400, 'Enter the submission reference number shown by the TaxOman portal.');
  const updated = await prisma.taxReturn.update({ where: { id: r.id }, data: { status: 'SUBMITTED', submissionRef: ref, submittedAt: req.body?.submittedAt ? d(req.body.submittedAt) : new Date() } });
  await setObligationStatus(r, 'SUBMITTED');
  await audit.record({ req, action: 'return.submission_recorded', objectType: 'tax_return', objectId: r.id, details: { submissionRef: ref } });
  res.json(updated);
}));

router.post('/:id/record-payment', requirePermission('return.file'), asyncHandler(async (req, res) => {
  const r = await findReturn(req);
  if (r.status !== 'SUBMITTED') throw new HttpError(409, 'Record the submission first.');
  const updated = await prisma.taxReturn.update({ where: { id: r.id }, data: { status: 'PAID', paymentRef: String(req.body?.paymentRef || '').trim() || null, paidAt: req.body?.paidAt ? d(req.body.paidAt) : new Date() } });
  await setObligationStatus(r, BigInt(r.amountDueBaisa) <= 0n ? 'ACKNOWLEDGED' : 'PAID');
  await audit.record({ req, action: 'return.payment_recorded', objectType: 'tax_return', objectId: r.id, details: { paymentRef: updated.paymentRef } });
  res.json(updated);
}));

router.delete('/:id', requirePermission('return.prepare'), asyncHandler(async (req, res) => {
  const r = await findReturn(req);
  if (r.locked || !['DRAFT', 'REJECTED'].includes(r.status)) throw new HttpError(409, 'Only unapproved drafts can be deleted.');
  await prisma.taxReturn.delete({ where: { id: r.id } });
  await audit.record({ req, action: 'return.deleted', objectType: 'tax_return', objectId: r.id, before: r.boxes });
  res.json({ ok: true });
}));

module.exports = router;
