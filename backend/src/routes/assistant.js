/**
 * AI tax assistant (plan E10-01, E10-02). Strict "cite or decline": answers only from the curated legal
 * library (knowledge.json + rules library). Without an API key it falls back to retrieval-only answers.
 */
const router = require('express').Router();
const prisma = require('../config/prisma');
const config = require('../config');
const knowledge = require('../rules/knowledge.json');
const rulesSvc = require('../services/rules');
const { fromBaisa } = require('../lib/money');
const { HttpError, asyncHandler } = require('../lib/errors');
const { authenticate, withOrg } = require('../middleware/auth');

router.use(authenticate);

const STOP = new Set(['the', 'a', 'an', 'is', 'are', 'do', 'i', 'my', 'what', 'how', 'when', 'to', 'of', 'in', 'for', 'and', 'or', 'on', 'oman', 'ما', 'هل', 'في', 'من', 'على', 'كيف', 'متى']);
const tokens = (s) => String(s || '').toLowerCase().split(/[^\p{L}\p{N}%]+/u).filter((w) => w.length > 1 && !STOP.has(w));

function retrieve(question, k = 4) {
  const q = tokens(question);
  return knowledge.map((doc) => {
    const text = tokens(`${doc.q} ${doc.en} ${doc.ar} ${doc.topic}`);
    const set = new Set(text);
    const score = q.reduce((a, w) => a + (set.has(w) ? 2 : text.some((t) => t.startsWith(w.slice(0, 4))) ? 1 : 0), 0);
    return { doc, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
}

let client;
function anthropic() {
  if (!config.anthropic.apiKey) return null;
  if (!client) { const Anthropic = require('@anthropic-ai/sdk'); client = new Anthropic({ apiKey: config.anthropic.apiKey }); }
  return client;
}

router.post('/ask', asyncHandler(async (req, res) => {
  const question = String(req.body?.question || '').trim().slice(0, 1500);
  const lang = req.body?.lang === 'ar' ? 'ar' : 'en';
  if (!question) throw new HttpError(400, 'Ask a question.');
  const hits = retrieve(question);
  const top = hits[0]?.score || 0;
  const decline = lang === 'ar'
    ? 'لست متأكداً من الإجابة بناءً على المكتبة القانونية المعتمدة لدينا. يرجى استشارة مستشار ضريبي مرخص.'
    : "I'm not sure based on our curated legal library. Please ask a licensed tax adviser.";
  if (top < 2) return res.json({ answer: decline, citations: [], confident: false, mode: 'declined' });

  const citations = hits.map((h) => ({ id: h.doc.id, title: h.doc.q, source: h.doc.source }));
  const ai = anthropic();
  if (!ai) {
    const best = hits[0].doc;
    return res.json({ answer: lang === 'ar' ? best.ar : best.en, citations: citations.slice(0, 2), confident: true, mode: 'retrieval' });
  }
  const context = hits.map((h, i) => `[${i + 1}] ${h.doc.q}\nEN: ${h.doc.en}\nAR: ${h.doc.ar}\nSource: ${h.doc.source}`).join('\n\n');
  const system = `You are the Triple i Oman tax assistant for taxpayers dealing with the Oman Tax Authority (TaxOman).
Rules you must follow:
- Answer ONLY using the numbered library passages provided. Never use outside knowledge.
- Cite passages inline like [1], [2]. Every factual sentence needs a citation.
- If the passages do not answer the question, reply exactly: "${decline}"
- Never instruct the user to file numbers that differ from the Triple i Oman calculation; never claim to submit anything to TaxOman.
- Items marked [VERIFY] must be described as "to be confirmed with your adviser".
- Reply in ${lang === 'ar' ? 'Arabic' : 'English'}, plainly, in under 180 words.`;
  try {
    const msg = await ai.messages.create({ model: config.anthropic.model, max_tokens: 600, system, messages: [{ role: 'user', content: `Library passages:\n${context}\n\nQuestion: ${question}` }] });
    const answer = msg.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
    const declined = answer.includes(decline.slice(0, 30));
    return res.json({ answer, citations: declined ? [] : citations, confident: !declined, mode: 'ai' });
  } catch (err) {
    console.error('[assistant] AI call failed, falling back to retrieval:', err.message);
    const best = hits[0].doc;
    return res.json({ answer: lang === 'ar' ? best.ar : best.en, citations: citations.slice(0, 2), confident: true, mode: 'retrieval' });
  }
}));

router.get('/library', (req, res) => res.json(knowledge.map(({ id, topic, q, source }) => ({ id, topic, q, source }))));

/** "Explain this number" — built from the explanation tree, never invented by AI (plan E10-02). */
router.get('/explain/:returnId/:boxId', withOrg, asyncHandler(async (req, res) => {
  const r = await prisma.taxReturn.findFirst({ where: { id: req.params.returnId, organisationId: req.org.id } });
  if (!r) throw new HttpError(404, 'Return not found');
  const ex = r.explanation?.[req.params.boxId];
  const box = r.boxes?.[req.params.boxId];
  if (!ex || !box) throw new HttpError(404, 'Box not found');
  const form = (await rulesSvc.get('vat.returnForm', r.periodEnd)).boxes.find((b) => b.id === req.params.boxId);
  const lang = req.query.lang === 'ar' ? 'ar' : 'en';
  const label = form ? (lang === 'ar' ? form.labelAr : form.labelEn) : req.params.boxId;
  const parts = lang === 'ar'
    ? [`المربع ${req.params.boxId} (${label}): المبلغ ${fromBaisa(box.value)} ر.ع، الضريبة ${fromBaisa(box.tax)} ر.ع.`, `طريقة الحساب: ${ex.formula}.`, `يستند إلى ${ex.count || 0} معاملة.`]
    : [`Box ${req.params.boxId} (${label}): amount OMR ${fromBaisa(box.value)}, VAT OMR ${fromBaisa(box.tax)}.`, `How it is calculated: ${ex.formula}.`, `Built from ${ex.count || 0} transaction(s).`];
  if (ex.notes?.length) parts.push(...ex.notes);
  if (ex.variancePct !== undefined && ex.variancePct !== null) parts.push(lang === 'ar' ? `التغير مقارنة بالربع السابق: ${ex.variancePct.toFixed(1)}%.` : `Change vs previous quarter: ${ex.variancePct.toFixed(1)}%.`);
  parts.push(lang === 'ar' ? `إصدارات القواعد: ${(ex.ruleRefs || []).join('، ')}` : `Rule versions: ${(ex.ruleRefs || []).join(', ')}`);
  res.json({ text: parts.join(' '), explanation: ex });
}));

module.exports = router;
