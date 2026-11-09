/**
 * Money helpers. All amounts are integer baisa (1 OMR = 1,000 baisa) — plan E1-07.
 * Rates are basis points (bp): 500 bp = 5%.
 */

/** Parse an OMR amount ("1,234.567", 1234.5, "OMR 12") into integer baisa. */
function toBaisa(value) {
  if (value === null || value === undefined || value === '') return 0n;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Invalid amount: ${value}`);
    return BigInt(Math.round(value * 1000));
  }
  let s = String(value).trim()
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/OMR|RO|ر\.ع\.?|ريال/gi, '')
    .replace(/[,\s]/g, '')
    .replace('٫', '.');
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (s.startsWith('-')) { negative = true; s = s.slice(1); }
  if (!/^\d*(\.\d*)?$/.test(s) || s === '' || s === '.') throw new Error(`Invalid amount: ${value}`);
  const [intPart, fracRaw = ''] = s.split('.');
  // round half up on the 4th decimal
  const frac = (fracRaw + '0000').slice(0, 4);
  let baisa = BigInt(intPart || '0') * 1000n + BigInt(frac.slice(0, 3));
  if (Number(frac[3]) >= 5) baisa += 1n;
  return negative ? -baisa : baisa;
}

/** Integer baisa → OMR string with 3 decimals. */
function fromBaisa(baisa) {
  const b = BigInt(baisa);
  const neg = b < 0n;
  const abs = neg ? -b : b;
  const s = `${abs / 1000n}.${String(abs % 1000n).padStart(3, '0')}`;
  return neg ? `-${s}` : s;
}

/** Multiply baisa by a basis-point rate, rounding half away from zero to the nearest baisa. */
function applyRate(baisa, rateBp) {
  const b = BigInt(baisa);
  const r = BigInt(rateBp);
  const num = b * r;
  const neg = num < 0n;
  const abs = neg ? -num : num;
  let q = abs / 10000n;
  if ((abs % 10000n) * 2n >= 10000n) q += 1n;
  return neg ? -q : q;
}

/** Gross-up a net amount when a contract says "net of tax": gross = net / (1 - rate). */
function grossUp(netBaisa, rateBp) {
  const n = BigInt(netBaisa);
  const denom = 10000n - BigInt(rateBp);
  if (denom <= 0n) throw new Error('Rate must be below 100%');
  const num = n * 10000n;
  let q = num / denom;
  if ((num % denom) * 2n >= denom) q += 1n;
  return q;
}

const sum = (arr) => arr.reduce((a, b) => a + BigInt(b || 0), 0n);
const bpToPercent = (bp) => `${(Number(bp) / 100).toFixed(Number(bp) % 100 ? 2 : 0)}%`;

module.exports = { toBaisa, fromBaisa, applyRate, grossUp, sum, bpToPercent };
