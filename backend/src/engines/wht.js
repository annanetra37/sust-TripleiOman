/** Withholding tax engine (plan E7-01..E7-03). */
const { applyRate, grossUp } = require('../lib/money');

/**
 * @param {object} p { amountBaisa, category, country, hasOmanPE, treatyCertValid, netOfTax }
 */
function compute(p, rules) {
  const r = rules['wht.rates'];
  const cat = r.categories[p.category] || r.categories.OTHER;
  const country = String(p.country || '').toUpperCase();
  const steps = [];
  if (country === 'OM' || p.hasOmanPE) {
    return { subject: false, rateBp: 0, grossBaisa: BigInt(p.amountBaisa), whtBaisa: 0n, netPaidBaisa: BigInt(p.amountBaisa), treatyApplied: false,
      steps: [{ step: country === 'OM' ? 'Payee is resident in Oman — no withholding tax.' : 'Payee has a permanent establishment in Oman — taxed through its own return, no WHT.' }] };
  }
  let rateBp = cat.rateBp;
  steps.push({ step: `Domestic WHT rate for ${cat.labelEn}: ${rateBp / 100}%` });
  let treatyApplied = false;
  const treaty = r.treaties[country];
  if (treaty && treaty[p.category] !== undefined && treaty[p.category] < rateBp) {
    if (p.treatyCertValid) {
      rateBp = treaty[p.category];
      treatyApplied = true;
      steps.push({ step: `Oman–${treaty.country} tax treaty rate applied: ${rateBp / 100}% (valid residency certificate on file).` });
    } else {
      steps.push({ step: `Treaty with ${treaty.country} allows ${treaty[p.category] / 100}%, but no valid certificate of residence is on file — domestic rate applies.` });
    }
  }
  let gross = BigInt(p.amountBaisa);
  if (p.netOfTax && rateBp > 0) {
    gross = grossUp(gross, rateBp);
    steps.push({ step: `Contract is "net of tax": grossed up ${Number(p.amountBaisa) / 1000} → ${Number(gross) / 1000} OMR.` });
  }
  const wht = applyRate(gross, rateBp);
  steps.push({ step: `WHT = gross × ${rateBp / 100}% = ${Number(wht) / 1000} OMR` });
  return { subject: rateBp > 0, rateBp, grossBaisa: gross, whtBaisa: wht, netPaidBaisa: gross - wht, treatyApplied, steps };
}

module.exports = { compute };
