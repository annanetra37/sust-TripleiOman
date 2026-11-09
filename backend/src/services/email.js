const config = require('../config');

let client;
function getClient() {
  if (!client && config.resend.apiKey) {
    const { Resend } = require('resend');
    client = new Resend(config.resend.apiKey);
  }
  return client;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function layout(titleEn, bodyEn, titleAr, bodyAr) {
  return `<div style="font-family:Arial,Tahoma,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1f2937">
  <div style="font-weight:700;color:#0f5132;font-size:18px;margin-bottom:12px">Triple i Oman</div>
  <h2 style="margin:0 0 12px">${titleEn}</h2>${bodyEn}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0"/>
  <div dir="rtl" style="text-align:right"><h2 style="margin:0 0 12px">${titleAr}</h2>${bodyAr}</div>
  <p style="color:#9ca3af;font-size:11px;margin-top:24px">Triple i Oman — Tax compliance for Oman · تريبل آي عُمان</p></div>`;
}

async function sendEmail({ to, subject, html }) {
  const c = getClient();
  if (!c) {
    console.log(`\n📧 [dev email] to=${to} subject="${subject}"\n${html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 600)}\n`);
    return { id: `dev-${Date.now()}` };
  }
  const { data, error } = await c.emails.send({ from: config.resend.from, to, subject, html });
  if (error) throw new Error(error.message || 'Email failed');
  return data;
}

const button = (href, label) => `<p style="margin:20px 0"><a href="${href}" style="background:#0f5132;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:700">${label}</a></p>`;

async function sendResetLink(email, token) {
  const link = `${config.appUrl}/reset-password?token=${encodeURIComponent(token)}`;
  return sendEmail({
    to: email,
    subject: 'Reset your Triple i Oman password / إعادة تعيين كلمة المرور',
    html: layout('Password reset', `<p>Click below to choose a new password. The link expires in 1 hour.</p>${button(link, 'Reset password')}`,
      'إعادة تعيين كلمة المرور', `<p>اضغط أدناه لاختيار كلمة مرور جديدة. ينتهي الرابط خلال ساعة.</p>${button(link, 'إعادة التعيين')}`),
  });
}

async function sendInvite(email, token, orgName, role) {
  const link = `${config.appUrl}/accept-invite?token=${encodeURIComponent(token)}`;
  return sendEmail({
    to: email,
    subject: `Invitation to ${orgName} on Triple i Oman`,
    html: layout(`Join ${esc(orgName)}`, `<p>You have been invited as <b>${esc(role)}</b>. The invitation expires in 7 days.</p>${button(link, 'Accept invitation')}`,
      `انضم إلى ${esc(orgName)}`, `<p>تمت دعوتك بدور <b>${esc(role)}</b>. تنتهي الدعوة خلال 7 أيام.</p>${button(link, 'قبول الدعوة')}`),
  });
}

async function sendReminder(email, { title, dueDate, daysLeft, link }) {
  return sendEmail({
    to: email,
    subject: `Reminder: ${title} due in ${daysLeft} day(s) — ${dueDate}`,
    html: layout('Tax deadline reminder', `<p><b>${esc(title)}</b> is due on <b>${esc(dueDate)}</b> (${daysLeft} day(s) left).</p>${button(link, 'Open Triple i Oman')}`,
      'تذكير بموعد ضريبي', `<p><b>${esc(title)}</b> مستحق في <b>${esc(dueDate)}</b> (متبقٍ ${daysLeft} يوم).</p>${button(link, 'فتح المنصة')}`),
  });
}

module.exports = { sendEmail, sendResetLink, sendInvite, sendReminder, esc };
