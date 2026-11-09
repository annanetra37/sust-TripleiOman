/**
 * Corporate income tax engine (plan E6-02..E6-04). Deterministic; every step explained.
 */
const { applyRate, sum } = require('../lib/money');

/** 3% small-enterprise eligibility check (plan E6-03) [VERIFY thresholds]. */
function smallEnterpriseCheck(input, rules) {
  const r = rules['cit.smallEnterprise'];
  const checks = [
    { id: 'capital', passed: BigInt(input.paidUpCapitalBaisa || 0) <= BigInt(r.maxPaidUpCapitalBaisa), labelEn: `Paid-up capital ≤ OMR ${(r.maxPaidUpCapitalBaisa / 1000).toLocaleString()}`, labelAr: 'رأس المال المدفوع ضمن الحد' },
    { id: 'income', passed: BigInt(input.grossIncomeBaisa || 0) <= BigInt(r.maxGrossIncomeBaisa), labelEn: `Gross income ≤ OMR ${(r.maxGrossIncomeBaisa / 1000).toLocaleString()} in the year`, labelAr: 'إجمالي الدخل ضمن الحد' },
    { id: 'employees', passed: Number(input.averageEmployees || 0) <= r.maxAverageEmployees, labelEn: `Average employees ≤ ${r.maxAverageEmployees}`, labelAr: 'متوسط عدد الموظفين ضمن الحد' },
    { id: 'activity', passed: !r.excludedActivities.some((a) => String(input.activity || '').toLowerCase().includes(a)), labelEn: 'Activity is not excluded (banking, insurance, transport, oil & gas, mining…)', labelAr: 'النشاط غير مستثنى' },
    { id: 'ownership', passed: !r.requiresOmaniOwnedCompanyOrSoleProprietor || !!input.omaniOwnedOrSoleProprietor, labelEn: 'Omani company or sole proprietorship (not a branch/PE of a foreign entity)', labelAr: 'شركة عُمانية أو مؤسسة فردية' },
  ];
  const eligible = checks.every((c) => c.passed);
  return { eligible, checks, verify: true, noteEn: 'Thresholds are as commonly reported; confirm current conditions and whether the 3% applies to gross or taxable income with your tax adviser.' };
}

/**
 * Compute CIT.
 * input: { accountingProfitBaisa, adjustments: [{ description, type: 'ADD'|'DEDUCT', amountBaisa }],
 *          lossesBroughtForward: [{ year, amountBaisa }], taxYear, smallEnterprise: {...}, credits: [{ description, amountBaisa }],
 *          provisionalPaidBaisa }
 */
function compute(input, rules) {
  const rates = rules['cit.rates'];
  const lossRule = rules['cit.losses'];
  const steps = [];
  const profit = BigInt(input.accountingProfitBaisa || 0);
  steps.push({ step: 'Accounting profit / (loss) before tax', amount: profit });

  const adds = (input.adjustments || []).filter((a) => a.type === 'ADD');
  const deds = (input.adjustments || []).filter((a) => a.type === 'DEDUCT');
  const addTotal = sum(adds.map((a) => a.amountBaisa));
  const dedTotal = sum(deds.map((a) => a.amountBaisa));
  for (const a of adds) steps.push({ step: `+ ${a.description}`, amount: BigInt(a.amountBaisa) });
  for (const a of deds) steps.push({ step: `− ${a.description}`, amount: -BigInt(a.amountBaisa) });

  const adjusted = profit + addTotal - dedTotal;
  steps.push({ step: 'Adjusted taxable profit before losses', amount: adjusted });

  const se = input.smallEnterprise ? smallEnterpriseCheck(input.smallEnterprise, rules) : { eligible: false, checks: [] };
  const rateBp = se.eligible ? rates.smallEnterpriseBp : rates.standardBp;

  // Loss relief (FIFO, respect carry-forward years; small enterprises may not carry forward [VERIFY]).
  let remaining = adjusted > 0n ? adjusted : 0n;
  const lossesUsed = [];
  const lossesExpired = [];
  const lossesCarried = [];
  const year = Number(input.taxYear || new Date().getUTCFullYear());
  const losses = [...(input.lossesBroughtForward || [])].sort((a, b) => a.year - b.year);
  for (const l of losses) {
    const amt = BigInt(l.amountBaisa || 0);
    if (year - Number(l.year) > lossRule.carryForwardYears || (se.eligible && !lossRule.smallEnterpriseCarryForward)) {
      lossesExpired.push({ year: l.year, amountBaisa: amt });
      continue;
    }
    const use = remaining < amt ? remaining : amt;
    if (use > 0n) lossesUsed.push({ year: l.year, amountBaisa: use });
    remaining -= use;
    if (amt - use > 0n) lossesCarried.push({ year: l.year, amountBaisa: amt - use });
  }
  if (adjusted < 0n) lossesCarried.push({ year, amountBaisa: -adjusted });
  const lossTotal = sum(lossesUsed.map((l) => l.amountBaisa));
  if (lossTotal) steps.push({ step: 'Tax losses brought forward used', amount: -lossTotal });
  const taxable = remaining;
  steps.push({ step: 'Taxable income', amount: taxable });

  const grossTax = applyRate(taxable, rateBp);
  steps.push({ step: `Tax at ${rateBp / 100}%${se.eligible ? ' (small enterprise)' : ''}`, amount: grossTax });
  const credits = sum((input.credits || []).map((c) => c.amountBaisa));
  const creditsUsed = credits > grossTax ? grossTax : credits;
  if (creditsUsed) steps.push({ step: 'Tax credits (e.g. foreign tax credit, capped at Omani tax)', amount: -creditsUsed });
  const netTax = grossTax - creditsUsed;
  const provisional = BigInt(input.provisionalPaidBaisa || 0);
  if (provisional) steps.push({ step: 'Tax already paid', amount: -provisional });
  const payable = netTax - provisional;
  steps.push({ step: 'Balance payable / (refundable)', amount: payable });

  return {
    accountingProfitBaisa: profit, adjustedProfitBaisa: adjusted, taxableIncomeBaisa: taxable, rateBp,
    grossTaxBaisa: grossTax, creditsBaisa: creditsUsed, netTaxBaisa: netTax, payableBaisa: payable,
    smallEnterprise: se, lossesUsed, lossesExpired, lossesCarriedForward: lossesCarried, steps,
  };
}

module.exports = { compute, smallEnterpriseCheck };
