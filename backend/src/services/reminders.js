/**
 * Deadline reminders (plan E2-02): 30/14/7/1 days before via in-app + email; escalation to owners
 * if a return is not approved 3 days before the due date. Runs hourly; idempotent per obligation/day.
 */
const prisma = require('../config/prisma');
const config = require('../config');
const rulesSvc = require('./rules');
const notify = require('./notify');
const email = require('./email');
const { iso, daysBetween } = require('../lib/dates');

async function runOnce(now = new Date()) {
  const cfg = await rulesSvc.get('deadlines.reminders');
  const maxDays = Math.max(...cfg.daysBefore);
  const obs = await prisma.obligation.findMany({
    where: { status: { notIn: ['SUBMITTED', 'PAID', 'ACKNOWLEDGED'] }, dueDate: { gte: new Date(now.getTime() - 86400000), lte: new Date(now.getTime() + (maxDays + 1) * 86400000) } },
  });
  let sent = 0;
  for (const o of obs) {
    const daysLeft = daysBetween(now, o.dueDate);
    const already = Array.isArray(o.remindersSent) ? o.remindersSent : [];
    const keys = [];
    if (cfg.daysBefore.includes(daysLeft) && !already.includes(`d${daysLeft}`)) keys.push(`d${daysLeft}`);
    const escalate = daysLeft === cfg.escalateIfNotApprovedDaysBefore && !['APPROVED'].includes(o.status) && !already.includes('escalated');
    if (escalate) keys.push('escalated');
    if (!keys.length) continue;
    const title = `${o.title} — due ${iso(o.dueDate)}`;
    const members = await prisma.membership.findMany({ where: { organisationId: o.organisationId, status: 'ACTIVE', role: { in: escalate ? ['OWNER'] : ['OWNER', 'FINANCE_ADMIN', 'PREPARER', 'APPROVER', 'EXTERNAL_ACCOUNTANT'] } }, include: { user: { select: { id: true, email: true, isActive: true } } } });
    for (const m of members) {
      if (!m.user.isActive) continue;
      await notify.toUser(m.userId, o.organisationId, { type: escalate ? 'ESCALATION' : 'REMINDER', title: escalate ? `Not yet approved: ${title}` : title, body: escalate ? `Only ${daysLeft} days left and the return is not approved yet.` : `${daysLeft} day(s) left.`, link: '/calendar' });
      await email.sendReminder(m.user.email, { title: o.title, dueDate: iso(o.dueDate), daysLeft, link: `${config.appUrl}/calendar` }).catch(() => {});
      sent++;
    }
    await prisma.obligation.update({ where: { id: o.id }, data: { remindersSent: [...already, ...keys] } });
  }
  return { checked: obs.length, sent };
}

function start() {
  if (process.env.DISABLE_REMINDERS === '1') return;
  const tick = () => runOnce().then((r) => r.sent && console.log(`[reminders] sent ${r.sent}`)).catch((e) => console.error('[reminders]', e.message));
  setTimeout(tick, 15000);
  setInterval(tick, 60 * 60 * 1000).unref();
}

module.exports = { runOnce, start };
