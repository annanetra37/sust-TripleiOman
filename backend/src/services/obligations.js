const prisma = require('../config/prisma');
const rulesSvc = require('./rules');
const engine = require('../engines/obligations');

/** Recompute obligations for an organisation from its questionnaire and upsert calendar rows. */
async function refresh(org) {
  const { values } = await rulesSvc.all(new Date());
  const answers = org.profile || {};
  const list = engine.determineObligations(org, answers, values);
  const rows = engine.generateCalendar(org, list, values);
  const types = new Set(list.map((o) => o.taxType));
  for (const r of rows) {
    await prisma.obligation.upsert({
      where: { organisationId_taxType_periodStart_periodEnd: { organisationId: org.id, taxType: r.taxType, periodStart: r.periodStart, periodEnd: r.periodEnd } },
      create: { organisationId: org.id, ...r },
      update: { dueDate: r.dueDate, title: r.title, titleAr: r.titleAr, ruleRef: r.ruleRef },
    });
  }
  // Remove untouched future obligations for tax types that no longer apply.
  await prisma.obligation.deleteMany({
    where: { organisationId: org.id, status: 'NOT_STARTED', taxType: { notIn: [...types, 'OTHER', 'LETTER'] }, returns: { none: {} } },
  });
  await prisma.organisation.update({ where: { id: org.id }, data: { obligationsSummary: list } });
  return list;
}

module.exports = { refresh };
