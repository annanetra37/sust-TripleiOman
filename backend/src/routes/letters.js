const router = require('express').Router();
const prisma = require('../config/prisma');
const audit = require('../services/audit');
const { d, iso } = require('../lib/dates');
const { HttpError, asyncHandler } = require('../lib/errors');
const { authenticate, withOrg, requirePermission } = require('../middleware/auth');

router.use(authenticate, withOrg);
const TYPES = ['INFORMATION_REQUEST', 'ASSESSMENT', 'AUDIT_NOTICE', 'PENALTY', 'REFUND', 'OTHER'];

router.get('/', asyncHandler(async (req, res) => {
  res.json(await prisma.taxLetter.findMany({ where: { organisationId: req.org.id }, orderBy: { receivedAt: 'desc' } }));
}));

router.post('/', requirePermission('data.write'), asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!b.subject || !b.receivedAt) throw new HttpError(400, 'Subject and received date are required.');
  const letter = await prisma.taxLetter.create({ data: {
    organisationId: req.org.id, reference: b.reference || null, letterType: TYPES.includes(b.letterType) ? b.letterType : 'OTHER', subject: b.subject,
    receivedAt: d(b.receivedAt), responseDueAt: b.responseDueAt ? d(b.responseDueAt) : null, notes: b.notes || null, documentId: b.documentId || null, assigneeId: b.assigneeId || null,
  } });
  if (letter.responseDueAt) {
    await prisma.obligation.create({ data: { organisationId: req.org.id, taxType: 'LETTER', title: `Reply to TaxOman letter: ${letter.subject}`, titleAr: `الرد على خطاب جهاز الضرائب: ${letter.subject}`, periodStart: letter.receivedAt, periodEnd: letter.responseDueAt, dueDate: letter.responseDueAt, notes: letter.id } }).catch(() => {});
  }
  await audit.record({ req, action: 'letter.logged', objectType: 'tax_letter', objectId: letter.id, after: letter });
  res.status(201).json(letter);
}));

router.patch('/:id', requirePermission('data.write'), asyncHandler(async (req, res) => {
  const l = await prisma.taxLetter.findFirst({ where: { id: req.params.id, organisationId: req.org.id } });
  if (!l) throw new HttpError(404, 'Letter not found');
  const b = req.body || {};
  const data = {};
  for (const k of ['status', 'notes', 'reference', 'subject', 'assigneeId', 'documentId']) if (b[k] !== undefined) data[k] = b[k];
  if (b.responseDueAt !== undefined) data.responseDueAt = b.responseDueAt ? d(b.responseDueAt) : null;
  const updated = await prisma.taxLetter.update({ where: { id: l.id }, data });
  if (['RESPONDED', 'CLOSED', 'OBJECTED'].includes(updated.status)) await prisma.obligation.updateMany({ where: { organisationId: req.org.id, taxType: 'LETTER', notes: l.id }, data: { status: 'SUBMITTED' } });
  await audit.record({ req, action: 'letter.updated', objectType: 'tax_letter', objectId: l.id, before: l, after: updated });
  res.json(updated);
}));

/** Objection template (plan E11-03) [VERIFY objection deadlines]. */
router.get('/:id/objection-template', asyncHandler(async (req, res) => {
  const l = await prisma.taxLetter.findFirst({ where: { id: req.params.id, organisationId: req.org.id } });
  if (!l) throw new HttpError(404, 'Letter not found');
  const o = req.org;
  res.json({
    en: `To: Oman Tax Authority — Objections Department\nDate: ${iso(new Date())}\n\nSubject: Objection to ${l.letterType === 'ASSESSMENT' ? 'tax assessment' : 'decision'} ref. ${l.reference || '[reference]'} dated ${iso(l.receivedAt)}\n\nTaxpayer: ${o.legalNameEn}\nTax Identification Number: ${o.tin || '[TIN]'}   VAT number: ${o.vatNumber || '[VAT number]'}   CR: ${o.crNumber || '[CR]'}\n\nWe respectfully object to the above ${l.letterType === 'ASSESSMENT' ? 'assessment' : 'decision'} on the following grounds:\n1. [Ground 1 — facts and the legal provision relied on]\n2. [Ground 2]\n\nWe enclose the following supporting documents:\n- [Document list]\n\nWe request that the Authority review and amend the ${l.letterType === 'ASSESSMENT' ? 'assessment' : 'decision'} accordingly.\n\nAuthorised signatory: ____________________\nName / Title:`,
    ar: `إلى: جهاز الضرائب — دائرة الاعتراضات\nالتاريخ: ${iso(new Date())}\n\nالموضوع: اعتراض على ${l.letterType === 'ASSESSMENT' ? 'الربط الضريبي' : 'القرار'} رقم ${l.reference || '[المرجع]'} بتاريخ ${iso(l.receivedAt)}\n\nالمكلف: ${o.legalNameAr || o.legalNameEn}\nالرقم الضريبي: ${o.tin || '[الرقم الضريبي]'}   رقم التسجيل في ضريبة القيمة المضافة: ${o.vatNumber || '[الرقم]'}   السجل التجاري: ${o.crNumber || '[السجل]'}\n\nنتقدم باعتراضنا على ما ورد أعلاه للأسباب التالية:\n1. [السبب الأول — الوقائع والنص القانوني]\n2. [السبب الثاني]\n\nمرفق المستندات المؤيدة:\n- [قائمة المستندات]\n\nنلتمس من الجهاز إعادة النظر وتعديل ${l.letterType === 'ASSESSMENT' ? 'الربط' : 'القرار'} وفقاً لذلك.\n\nالمفوض بالتوقيع: ____________________`,
    checklist: ['Copy of the assessment/decision letter', 'Return(s) and workings for the period', 'Source invoices and contracts supporting each ground', 'Proof of payment of any undisputed amount', 'Authorisation letter for the signatory'],
    guidanceEn: 'File the objection within the deadline stated in the letter (commonly 45 days for income tax — [VERIFY] current rules for each tax). If the Authority rejects the objection, the next step is the Tax Grievance Committee. We strongly recommend involving a licensed Omani tax adviser.',
    guidanceAr: 'قدّم الاعتراض خلال المهلة المذكورة في الخطاب. في حال الرفض تكون الخطوة التالية لجنة التظلمات الضريبية. ننصح بالاستعانة بمستشار ضريبي مرخص.',
  });
}));

module.exports = router;
