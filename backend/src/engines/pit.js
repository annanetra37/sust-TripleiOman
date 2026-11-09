/** Personal income tax engine — "TurboTax for Oman" (plan E9). Law RD 56/2025; executive regulations pending [VERIFY]. */
const { applyRate, sum } = require('../lib/money');

/** Free "Am I affected?" checker (E9-01). Nothing is stored. */
function amIAffected({ estimatedGrossOmr = 0, incomeTypes = [] }, rules) {
  const r = rules['pit.rates'];
  const threshold = r.thresholdBaisa / 1000;
  const gross = Number(estimatedGrossOmr || 0);
  const affected = gross > threshold;
  const estTax = affected ? Math.round((gross - threshold) * r.rateBp) / 10000 : 0;
  return {
    affected, thresholdOmr: threshold, estimatedTaxOmr: Number(estTax.toFixed(3)), startDate: '2028-01-01', incomeTypes,
    messageEn: affected
      ? `Your estimated income of OMR ${gross.toLocaleString()} is above OMR ${threshold.toLocaleString()}. From 1 January 2028 you would pay about OMR ${estTax.toLocaleString()} a year before deductions (education, healthcare, primary housing, zakat, donations…).`
      : `Most people are not affected: the tax applies only to income above OMR ${threshold.toLocaleString()} a year. Based on your estimate you would pay nothing.`,
    messageAr: affected
      ? `دخلك التقديري ${gross.toLocaleString()} ريال يتجاوز ${threshold.toLocaleString()} ريال. اعتباراً من 1 يناير 2028 ستدفع حوالي ${estTax.toLocaleString()} ريال سنوياً قبل الخصومات.`
      : `معظم الناس غير متأثرين: تُطبق الضريبة فقط على الدخل الذي يتجاوز ${threshold.toLocaleString()} ريال سنوياً. وفق تقديرك لن تدفع شيئاً.`,
  };
}

/** Residency day counter (E9-02). travelLog: [{ from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }] periods IN Oman. */
function residency(travelLog = [], taxYear, rules) {
  const r = rules['pit.rates'];
  const days = new Set();
  const ys = Date.UTC(taxYear, 0, 1); const ye = Date.UTC(taxYear, 11, 31);
  for (const p of travelLog) {
    let t = Math.max(Date.parse(p.from), ys);
    const end = Math.min(Date.parse(p.to || p.from), ye);
    while (t <= end) { days.add(t); t += 86400000; }
  }
  const count = days.size;
  return { daysInOman: count, threshold: r.residencyDays, resident: count >= r.residencyDays, daysToThreshold: Math.max(0, r.residencyDays - count), warning: count >= r.residencyDays - 20 && count < r.residencyDays };
}

/**
 * Compute PIT for a year.
 * data: { incomes: [{ category, description, amountBaisa, foreign, foreignTaxPaidBaisa }], deductions: [{ category, amountBaisa }] }
 */
function compute(data, rules) {
  const r = rules['pit.rates'];
  const incomes = data.incomes || [];
  const deductions = (data.deductions || []).filter((x) => r.deductionCategories.includes(x.category));
  const gross = sum(incomes.map((i) => i.amountBaisa));
  const ded = sum(deductions.map((x) => x.amountBaisa));
  const net = gross - ded > 0n ? gross - ded : 0n;
  const threshold = BigInt(r.thresholdBaisa);
  const taxable = net > threshold ? net - threshold : 0n;
  const tax = applyRate(taxable, r.rateBp);
  // Foreign tax credit (E9-05): capped at the Omani tax attributable to the foreign income.
  const foreignIncome = sum(incomes.filter((i) => i.foreign).map((i) => i.amountBaisa));
  const foreignTaxPaid = sum(incomes.filter((i) => i.foreign).map((i) => i.foreignTaxPaidBaisa || 0));
  const cap = gross > 0n ? (tax * foreignIncome) / gross : 0n;
  const ftc = foreignTaxPaid < cap ? foreignTaxPaid : cap;
  const payable = tax - ftc;
  const byCategory = {};
  for (const x of deductions) byCategory[x.category] = (byCategory[x.category] || 0n) + BigInt(x.amountBaisa || 0);
  const savings = applyRate(ded < net ? ded : net, r.rateBp);
  return {
    grossIncomeBaisa: gross, deductionsBaisa: ded, deductionsByCategory: byCategory, netIncomeBaisa: net, thresholdBaisa: threshold,
    taxableBaisa: taxable, rateBp: r.rateBp, taxBaisa: tax, foreignTaxCreditBaisa: ftc, payableBaisa: payable, estimatedDeductionSavingsBaisa: taxable > 0n ? savings : 0n,
    steps: [
      { step: 'Total income', amount: gross },
      { step: 'Less deductions (education, healthcare, housing, zakat, donations…)', amount: -ded },
      { step: 'Net income', amount: net },
      { step: `Less tax-free threshold (OMR ${Number(threshold) / 1000})`, amount: -(net < threshold ? net : threshold) },
      { step: 'Taxable income', amount: taxable },
      { step: `Tax at ${r.rateBp / 100}%`, amount: tax },
      { step: 'Foreign tax credit (capped)', amount: -ftc },
      { step: 'Tax payable', amount: payable },
    ],
  };
}

/** Late payment estimator (E9-07): additional tax per month per law summaries [VERIFY]. */
function latePayment(amountBaisa, monthsLate, rules) {
  const r = rules['pit.rates'];
  return applyRate(BigInt(amountBaisa), r.lateMonthlyAdditionalBp * Math.max(0, Math.ceil(monthsLate)));
}

module.exports = { amIAffected, residency, compute, latePayment };
