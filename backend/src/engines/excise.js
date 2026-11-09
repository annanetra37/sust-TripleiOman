/** Excise ("selective") tax engine (plan E8-01..E8-03) [VERIFY price base after 2025 changes]. */
const { applyRate, sum } = require('../lib/money');

/**
 * lines: [{ category, description, quantity, unitPriceBaisa }]
 * Price base = the higher of the declared retail selling price and the OTA reference price when supplied.
 */
function compute(lines, rules) {
  const cats = rules['excise.categories'];
  const out = lines.map((l) => {
    const c = cats[l.category];
    if (!c) return { ...l, error: `Unknown excise category ${l.category}` };
    const unit = BigInt(l.unitPriceBaisa || 0);
    const ref = BigInt(l.referencePriceBaisa || 0);
    const base = (unit > ref ? unit : ref) * BigInt(Math.round(Number(l.quantity || 0)));
    const excise = applyRate(base, c.rateBp);
    return { ...l, rateBp: c.rateBp, label: c.labelEn, stampsRequired: !!c.stamps, baseBaisa: base, exciseBaisa: excise };
  });
  return { lines: out, totalBaseBaisa: sum(out.map((l) => l.baseBaisa || 0)), totalExciseBaisa: sum(out.map((l) => l.exciseBaisa || 0)) };
}

/** Digital tax stamp reconciliation (plan E8-05). */
function reconcileStamps({ ordered = 0, applied = 0, sold = 0, onHandCounted = null, upcomingShipmentUnits = 0 }) {
  const expectedOnHand = ordered - applied;
  const unsoldApplied = applied - sold;
  const alerts = [];
  if (onHandCounted !== null && Number(onHandCounted) !== expectedOnHand) alerts.push(`Stamp count mismatch: expected ${expectedOnHand}, counted ${onHandCounted}.`);
  if (upcomingShipmentUnits > expectedOnHand) alerts.push(`Shortfall: next shipment needs ${upcomingShipmentUnits} stamps but only ${expectedOnHand} are available — order ${upcomingShipmentUnits - expectedOnHand} more.`);
  return { expectedOnHand, unsoldApplied, alerts };
}

module.exports = { compute, reconcileStamps };
