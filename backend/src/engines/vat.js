/**
 * VAT engine (plan E3-06, E4-01..E4-05). Pure, deterministic functions.
 * Every computed box carries an explanation (formula, source transactions, rule versions) — plan E10-02.
 */
const { applyRate, sum } = require('../lib/money');
const { d, iso, addMonths } = require('../lib/dates');

const CATEGORIES = ['STANDARD', 'ZERO_RATED', 'EXEMPT', 'OUT_OF_SCOPE', 'REVERSE_CHARGE'];

const lc = (s) => String(s || '').toLowerCase();
const matchAny = (text, keywords = []) => keywords.find((k) => lc(text).includes(lc(k)));

function signed(tx, field) {
  const v = BigInt(tx[field] || 0);
  return tx.isCreditNote && v > 0n ? -v : v;
}

/**
 * Suggest a VAT category for a transaction. Rule-based first; anything low-confidence is left for a
 * human to confirm (plan E4-01). Returns { category, source, confidence, reason }.
 */
function classify(tx, rules) {
  const cats = rules['vat.categories'];
  if (tx.vatCategory && tx.categorySource === 'USER') return { category: tx.vatCategory, source: 'USER', confidence: 1, reason: 'Confirmed by user' };
  if (tx.vatCategory && CATEGORIES.includes(tx.vatCategory) && tx.categorySource === 'IMPORT') {
    return { category: tx.vatCategory, source: 'IMPORT', confidence: 0.95, reason: 'Category supplied in import file' };
  }
  const foreign = tx.counterpartyCountry && tx.counterpartyCountry.toUpperCase() !== 'OM';
  const text = `${tx.description || ''} ${tx.counterpartyName || ''}`;
  const net = BigInt(tx.netBaisa || 0);
  const vat = BigInt(tx.vatBaisa || 0);

  if (tx.direction === 'PURCHASE' && foreign && tx.isService) {
    return { category: 'REVERSE_CHARGE', source: 'RULE', confidence: 0.95, reason: 'Service bought from a supplier outside Oman → reverse charge (self-assess output and input VAT).' };
  }
  if (tx.direction === 'PURCHASE' && tx.isImport) {
    return { category: 'STANDARD', source: 'RULE', confidence: 0.9, reason: 'Import of goods → import VAT (boxes 3a / 5b).' };
  }
  if (tx.direction === 'SALE' && foreign && vat === 0n) {
    return { category: 'ZERO_RATED', source: 'RULE', confidence: 0.8, reason: 'Supply to a customer outside Oman with no VAT charged → export (zero-rated). Keep export evidence.' };
  }
  let k = matchAny(text, cats.outOfScopeKeywords);
  if (k) return { category: 'OUT_OF_SCOPE', source: 'RULE', confidence: 0.75, reason: `Description mentions "${k}" (out of scope).` };
  k = matchAny(text, cats.exemptKeywords);
  if (k && vat === 0n) return { category: 'EXEMPT', source: 'RULE', confidence: 0.75, reason: `Description mentions "${k}" (exempt supply).` };
  k = matchAny(text, cats.zeroRatedKeywords);
  if (k && vat === 0n) return { category: 'ZERO_RATED', source: 'RULE', confidence: 0.75, reason: `Description mentions "${k}" (zero-rated supply).` };
  if (net !== 0n && vat !== 0n) {
    const expected = applyRate(net, cats.STANDARD.rateBp);
    const diff = vat - expected < 0n ? expected - vat : vat - expected;
    const tol = BigInt(Math.max(10, Math.abs(Number(net)) / 1000));
    if (diff <= tol) return { category: 'STANDARD', source: 'RULE', confidence: 0.9, reason: 'VAT charged equals 5% of the net amount.' };
    return { category: 'STANDARD', source: 'RULE', confidence: 0.5, reason: 'VAT charged but not equal to 5% of net — please check.' };
  }
  return { category: null, source: null, confidence: 0, reason: 'No VAT charged and no zero-rate/exempt reason found — please choose a category.' };
}

/** Data-quality checks (plan E3-06). Returns an array of { code, severity, messageEn, messageAr }. */
function qualityFlags(tx, rules, ctx = {}) {
  const flags = [];
  const net = signed(tx, 'netBaisa');
  const vat = signed(tx, 'vatBaisa');
  const vatPattern = new RegExp(rules['registration.vatNumberFormat']?.pattern || '^OM[0-9A-Z]{10}$');
  const add = (code, severity, en, ar) => flags.push({ code, severity, messageEn: en, messageAr: ar });

  if (tx.counterpartyVat && !vatPattern.test(String(tx.counterpartyVat).toUpperCase().replace(/\s/g, ''))
    && (!tx.counterpartyCountry || tx.counterpartyCountry.toUpperCase() === 'OM')) {
    add('INVALID_VAT_NUMBER', 'error', `VAT number "${tx.counterpartyVat}" is not in the Oman format (OM + 10 characters).`, `رقم التسجيل الضريبي "${tx.counterpartyVat}" ليس بالصيغة العُمانية (OM + 10 خانات).`);
  }
  if (tx.direction === 'SALE' && tx.vatCategory === 'STANDARD' && !tx.counterpartyVat && net >= 10000000n) {
    add('MISSING_CUSTOMER_VAT', 'warning', 'Large standard-rated sale without a customer VAT number. Add it if the customer is VAT-registered (required for B2B tax invoices).', 'عملية بيع كبيرة بدون رقم تسجيل ضريبي للعميل. أضفه إذا كان العميل مسجلاً.');
  }
  if (net !== 0n && vat !== 0n) {
    const expected = applyRate(net, 500);
    const diff = vat - expected < 0n ? expected - vat : vat - expected;
    const tol = BigInt(Math.max(10, Math.abs(Number(net)) / 1000));
    if (diff > tol) add('VAT_RATE_MISMATCH', 'error', 'VAT is neither 5% nor 0% of the net amount.', 'الضريبة لا تساوي 5% ولا 0% من المبلغ الصافي.');
  }
  if ((tx.vatCategory === 'ZERO_RATED' || tx.vatCategory === 'EXEMPT' || tx.vatCategory === 'OUT_OF_SCOPE') && vat !== 0n) {
    add('VAT_ON_NON_STANDARD', 'error', `VAT charged on a ${tx.vatCategory.toLowerCase().replace('_', '-')} transaction.`, 'تم احتساب ضريبة على معاملة غير خاضعة للنسبة الأساسية.');
  }
  if (!tx.isCreditNote && (BigInt(tx.netBaisa || 0) < 0n || BigInt(tx.vatBaisa || 0) < 0n)) {
    add('NEGATIVE_WITHOUT_CREDIT_NOTE', 'error', 'Negative amount without a credit note.', 'مبلغ سالب بدون إشعار دائن.');
  }
  if (tx.direction === 'PURCHASE' && vat > 0n && !tx.counterpartyVat && (!tx.counterpartyCountry || tx.counterpartyCountry.toUpperCase() === 'OM')) {
    add('SUPPLIER_NOT_REGISTERED', 'warning', 'Supplier charged VAT but has no VAT number — input VAT is not recoverable until a valid tax invoice is obtained.', 'المورد احتسب ضريبة بدون رقم تسجيل — لا يمكن خصم ضريبة المدخلات.');
  }
  if (tx.direction === 'PURCHASE' && vat > 0n && tx.hasTaxInvoice === false) {
    add('MISSING_TAX_INVOICE', 'warning', 'No tax invoice held — input VAT cannot be recovered.', 'لا توجد فاتورة ضريبية — لا يمكن خصم ضريبة المدخلات.');
  }
  if (tx.direction === 'PURCHASE' && (tx.inputBlocked || matchAny(tx.description, rules['vat.blockedInput']?.keywords))) {
    add('BLOCKED_INPUT', 'info', rules['vat.blockedInput']?.noteEn || 'Input VAT may be blocked.', rules['vat.blockedInput']?.noteAr || 'قد تكون ضريبة المدخلات غير قابلة للخصم.');
  }
  if (ctx.periodStart && ctx.periodEnd) {
    const t = d(tx.date).getTime();
    if (t < d(ctx.periodStart).getTime() || t > d(ctx.periodEnd).getTime()) add('OUTSIDE_PERIOD', 'warning', 'Date is outside the return period.', 'التاريخ خارج فترة الإقرار.');
  }
  if (ctx.duplicateKeys && tx.invoiceNumber) {
    const key = `${tx.direction}|${lc(tx.invoiceNumber)}|${lc(tx.counterpartyName)}`;
    if ((ctx.duplicateKeys.get(key) || 0) > 1) add('DUPLICATE', 'error', `Possible duplicate of invoice ${tx.invoiceNumber}.`, `احتمال تكرار الفاتورة ${tx.invoiceNumber}.`);
  }
  if (!tx.vatCategory) add('NEEDS_CATEGORY', 'error', 'VAT category not confirmed.', 'لم يتم تأكيد فئة الضريبة.');
  return flags;
}

function duplicateIndex(txs) {
  const m = new Map();
  for (const t of txs) {
    if (!t.invoiceNumber) continue;
    const key = `${t.direction}|${lc(t.invoiceNumber)}|${lc(t.counterpartyName)}`;
    m.set(key, (m.get(key) || 0) + 1);
  }
  return m;
}

function isInputRecoverable(tx, rules) {
  if (tx.inputBlocked) return { ok: false, why: 'blocked' };
  if (matchAny(tx.description, rules['vat.blockedInput']?.keywords)) return { ok: false, why: 'blocked' };
  if (tx.hasTaxInvoice === false) return { ok: false, why: 'no tax invoice' };
  const foreign = tx.counterpartyCountry && tx.counterpartyCountry.toUpperCase() !== 'OM';
  if (!foreign && !tx.isImport && BigInt(tx.vatBaisa || 0) > 0n && !tx.counterpartyVat) return { ok: false, why: 'supplier VAT number missing' };
  return { ok: true };
}

/**
 * Compute a draft VAT return box by box.
 * @returns {{ boxes, explanation, exceptions, amountDueBaisa, apportionment }}
 */
function computeReturn(transactions, { periodStart, periodEnd, rules, ruleVersions = {}, previousBoxes = null }) {
  const rate = rules['vat.rates'].standardBp;
  const form = rules['vat.returnForm'].boxes;
  const boxes = {};
  const explanation = {};
  for (const b of form) { boxes[b.id] = { value: 0n, tax: 0n }; explanation[b.id] = { txIds: [], notes: [] }; }
  const ref = (k) => `${k}@v${ruleVersions[k] || 1}`;
  const put = (id, tx, value, tax, note) => {
    boxes[id].value += value;
    boxes[id].tax += tax;
    if (tx) explanation[id].txIds.push(tx.id);
    if (note && !explanation[id].notes.includes(note)) explanation[id].notes.push(note);
  };

  const exceptions = [];
  const dupes = duplicateIndex(transactions);
  const inPeriod = transactions.filter((t) => {
    const ts = d(t.date).getTime();
    return ts >= d(periodStart).getTime() && ts <= d(periodEnd).getTime();
  });

  const blockedInput = [];
  for (const tx of inPeriod) {
    const flags = qualityFlags(tx, rules, { duplicateKeys: dupes });
    for (const f of flags.filter((x) => x.severity === 'error')) exceptions.push({ txId: tx.id, invoiceNumber: tx.invoiceNumber, ...f });
    const cat = tx.vatCategory;
    if (!cat) continue;
    const net = signed(tx, 'netBaisa');
    const vat = signed(tx, 'vatBaisa');
    if (tx.direction === 'SALE') {
      if (cat === 'STANDARD') put('1a', tx, net, vat !== 0n ? vat : applyRate(net, rate), 'Output VAT as charged on the invoice (5% computed where missing).');
      else if (cat === 'ZERO_RATED') put('1b', tx, net, 0n);
      else if (cat === 'EXEMPT') put('1c', tx, net, 0n);
      else if (cat === 'REVERSE_CHARGE') put('1d', tx, net, 0n);
      else if (cat === 'OUT_OF_SCOPE') put('1e', tx, net, 0n);
    } else {
      const rec = isInputRecoverable(tx, rules);
      if (cat === 'REVERSE_CHARGE') {
        const self = applyRate(net, rate);
        put('2a', tx, net, self, 'Self-assessed 5% on imported services.');
        if (rec.ok) put('5c', tx, net, self, 'Matching input VAT on reverse charge.');
        else blockedInput.push({ tx, why: rec.why });
      } else if (tx.isImport && cat === 'STANDARD') {
        const importVat = vat !== 0n ? vat : applyRate(net, rate);
        put('3a', tx, net, importVat, 'Import VAT (postponed/deferred via customs) [VERIFY current rules].');
        if (rec.ok) put('5b', tx, net, importVat);
        else blockedInput.push({ tx, why: rec.why });
      } else if (cat === 'STANDARD') {
        if (rec.ok) put('5a', tx, net, vat !== 0n ? vat : applyRate(net, rate));
        else blockedInput.push({ tx, why: rec.why });
      }
    }
  }

  // Input VAT apportionment when the business makes exempt supplies (plan E4-04) — flagged for expert review.
  const taxableSales = boxes['1a'].value + boxes['1b'].value + boxes['1d'].value;
  const exemptSales = boxes['1c'].value;
  let apportionment = null;
  if (exemptSales > 0n && taxableSales + exemptSales > 0n) {
    const ratioBp = Number((taxableSales * 10000n) / (taxableSales + exemptSales));
    apportionment = { ratioBp, noteEn: `Business makes exempt supplies: recoverable input VAT reduced to ${(ratioBp / 100).toFixed(2)}% (taxable ÷ total supplies). Annual adjustment required — expert review recommended.` };
    for (const id of ['5a', '5b', '5c']) {
      const before = boxes[id].tax;
      boxes[id].tax = applyRate(before, ratioBp);
      if (before !== 0n) explanation[id].notes.push(apportionment.noteEn);
    }
    exceptions.push({ code: 'APPORTIONMENT', severity: 'warning', messageEn: apportionment.noteEn, messageAr: 'المنشأة تقوم بتوريدات معفاة: تم تخفيض ضريبة المدخلات القابلة للخصم وفق نسبة التوزيع. يُنصح بمراجعة خبير.' });
  }

  boxes['4a'].tax = boxes['1a'].tax + boxes['2a'].tax + boxes['3a'].tax;
  boxes['5d'].tax = boxes['5a'].tax + boxes['5b'].tax + boxes['5c'].tax;
  boxes['6a'].tax = boxes['4a'].tax - boxes['5d'].tax;

  const formulas = {
    '1a': 'Sum of standard-rated sales (net) and VAT charged',
    '1b': 'Sum of zero-rated sales (exports, basic food, medicines…)',
    '1c': 'Sum of exempt sales (financial services, education, healthcare, residential rent…)',
    '1d': 'Supplies where the customer accounts for VAT (reverse charge)',
    '1e': 'Out-of-scope supplies',
    '2a': 'Services bought from abroad × 5% (self-assessed)',
    '3a': 'Imported goods × 5% (postponed/deferred import VAT)',
    '4a': '1a VAT + 2a VAT + 3a VAT',
    '5a': 'Recoverable VAT on domestic purchases (valid tax invoice, supplier VAT-registered, not blocked)',
    '5b': 'Recoverable import VAT',
    '5c': 'Recoverable input VAT on reverse-charge purchases',
    '5d': '5a + 5b + 5c',
    '6a': '4a − 5d (positive = pay TaxOman, negative = refundable / carry forward)',
  };
  for (const b of form) {
    explanation[b.id].formula = formulas[b.id];
    explanation[b.id].ruleRefs = [ref('vat.rates'), ref('vat.returnForm'), ref('vat.categories')];
    explanation[b.id].count = explanation[b.id].txIds.length;
    if (previousBoxes && previousBoxes[b.id]) {
      const prev = BigInt(previousBoxes[b.id].tax || previousBoxes[b.id].value || 0);
      const cur = b.kind === 'value' ? boxes[b.id].value : boxes[b.id].tax;
      const variancePct = prev === 0n ? null : Number(((cur - prev) * 10000n) / (prev < 0n ? -prev : prev)) / 100;
      explanation[b.id].previous = prev;
      explanation[b.id].variancePct = variancePct;
      if (variancePct !== null && Math.abs(variancePct) >= 50) {
        exceptions.push({ code: 'VARIANCE', severity: 'warning', box: b.id, messageEn: `Box ${b.id} changed ${variancePct.toFixed(0)}% vs the previous quarter — please confirm.`, messageAr: `تغير المربع ${b.id} بنسبة ${variancePct.toFixed(0)}% مقارنة بالربع السابق — يرجى التأكيد.` });
      }
    }
  }
  explanation['5a'].blocked = blockedInput.filter((x) => !x.tx.isImport && x.tx.vatCategory === 'STANDARD').map((x) => ({ txId: x.tx.id, why: x.why }));
  if (blockedInput.length) explanation['5d'].notes.push(`${blockedInput.length} purchase(s) excluded from input VAT (blocked, no tax invoice or supplier not registered).`);

  return { boxes, explanation, exceptions, amountDueBaisa: boxes['6a'].tax, apportionment, transactionCount: inPeriod.length };
}

/** VAT registration threshold monitor (plan E1-04). */
function thresholdStatus({ transactions = [], declaredAnnualBaisa = 0n, asOf = new Date(), rules }) {
  const reg = rules['vat.registration'];
  const from = addMonths(asOf, -12).getTime();
  const taxableCats = new Set(['STANDARD', 'ZERO_RATED', 'REVERSE_CHARGE', null, undefined]);
  const rolling = sum(transactions
    .filter((t) => t.direction === 'SALE' && taxableCats.has(t.vatCategory) && d(t.date).getTime() > from && d(t.date).getTime() <= d(asOf).getTime())
    .map((t) => signed(t, 'netBaisa')));
  const forward = BigInt(declaredAnnualBaisa || 0);
  const basis = rolling > forward ? rolling : forward;
  const pct = Number((basis * 10000n) / BigInt(reg.mandatoryThresholdBaisa)) / 100;
  let status = 'BELOW';
  if (basis >= BigInt(reg.mandatoryThresholdBaisa)) status = 'MUST_REGISTER';
  else if (pct >= reg.alertAtPercent[0]) status = 'APPROACHING';
  else if (basis >= BigInt(reg.voluntaryThresholdBaisa)) status = 'VOLUNTARY_ELIGIBLE';
  return {
    rollingBaisa: rolling, forwardBaisa: forward, basisBaisa: basis, percentOfMandatory: pct, status,
    mandatoryThresholdBaisa: reg.mandatoryThresholdBaisa, voluntaryThresholdBaisa: reg.voluntaryThresholdBaisa,
    registerWithinDays: reg.registerWithinDays, asOf: iso(asOf),
  };
}

module.exports = { CATEGORIES, classify, qualityFlags, computeReturn, thresholdStatus, duplicateIndex, isInputRecoverable };
