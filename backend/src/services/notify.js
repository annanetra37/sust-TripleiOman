/** In-app notifications (+ email for important events) — plan E13-01. */
const prisma = require('../config/prisma');
const email = require('./email');

async function toUser(userId, organisationId, n, { sendEmail = false } = {}) {
  if (!userId) return;
  await prisma.notification.create({ data: { userId, organisationId, type: n.type, title: n.title, body: n.body || '', link: n.link || null } }).catch((e) => console.error('[notify]', e.message));
  if (sendEmail) {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (u) await email.sendEmail({ to: u.email, subject: n.title, html: `<p>${email.esc(n.body)}</p>` }).catch(() => {});
  }
}

async function toRoles(organisationId, roles, n, excludeUserId = null, opts = {}) {
  const ms = await prisma.membership.findMany({ where: { organisationId, status: 'ACTIVE', role: { in: roles } }, select: { userId: true } });
  for (const m of ms) if (m.userId !== excludeUserId) await toUser(m.userId, organisationId, n, opts);
}

module.exports = { toUser, toRoles };
