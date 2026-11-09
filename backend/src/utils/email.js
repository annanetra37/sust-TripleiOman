const config = require('../config');

let resendClient;

function getClient() {
  if (!resendClient && config.resend.apiKey) {
    const { Resend } = require('resend');
    resendClient = new Resend(config.resend.apiKey);
  }
  return resendClient;
}

async function sendEmail({ to, subject, html }) {
  const client = getClient();
  const from = config.resend.from || 'Triple I ESG <noreply@triplei.io>';

  if (!client) {
    // Dev fallback: log to console
    console.log('\n📧 DEV EMAIL:', subject);
    console.log('   To:', to);
    console.log('   From:', from);
    console.log('   Body:', html, '\n');
    return { id: 'dev-' + Date.now() };
  }

  const { data, error } = await client.emails.send({ from, to, subject, html });

  if (error) {
    console.error('[Email] Resend error:', error);
    throw new Error(error.message || 'Failed to send email');
  }

  console.log(`[Email] Sent "${subject}" to ${to} — ID: ${data?.id}`);
  return data;
}

async function sendOTP(email, otp) {
  return sendEmail({
    to: email,
    subject: 'Your Verification Code — Triple I ESG',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #003700; margin-bottom: 16px;">Email Verification</h2>
        <p style="color: #333; font-size: 15px;">Your verification code is:</p>
        <div style="background: #f0fdf4; border: 2px solid #003700; border-radius: 12px; padding: 20px; text-align: center; margin: 16px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #003700;">${otp}</span>
        </div>
        <p style="color: #666; font-size: 13px;">This code expires in <strong>10 minutes</strong>.</p>
        <p style="color: #999; font-size: 11px; margin-top: 24px; border-top: 1px solid #eee; padding-top: 12px;">Triple I ESG Portal — Sustainability Management Platform</p>
      </div>
    `,
  });
}

async function sendResetLink(email, token) {
  const link = `${config.frontend.url}/reset-password?token=${token}`;
  return sendEmail({
    to: email,
    subject: 'Reset Your Password — Triple I ESG',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #003700; margin-bottom: 16px;">Password Reset</h2>
        <p style="color: #333; font-size: 15px;">You requested a password reset. Click the button below to set a new password:</p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${link}" style="background: #003700; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 15px;">Reset Password</a>
        </div>
        <p style="color: #666; font-size: 13px;">This link expires in <strong>1 hour</strong>.</p>
        <p style="color: #999; font-size: 11px;">If you didn't request this, you can safely ignore this email.</p>
        <p style="color: #999; font-size: 11px; margin-top: 24px; border-top: 1px solid #eee; padding-top: 12px;">Triple I ESG Portal</p>
      </div>
    `,
  });
}

async function sendInvite(email, token, companyName) {
  const link = `${config.frontend.url}/accept-invite?token=${token}`;
  return sendEmail({
    to: email,
    subject: `You're invited to ${companyName} — Triple I ESG`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #003700; margin-bottom: 16px;">You're Invited!</h2>
        <p style="color: #333; font-size: 15px;">You've been invited to join <strong>${companyName}</strong> on the Triple I ESG Portal.</p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${link}" style="background: #003700; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 15px;">Accept Invitation</a>
        </div>
        <p style="color: #666; font-size: 13px;">This invitation expires in <strong>7 days</strong>.</p>
        <p style="color: #999; font-size: 11px; margin-top: 24px; border-top: 1px solid #eee; padding-top: 12px;">Triple I ESG Portal — Sustainability Management Platform</p>
      </div>
    `,
  });
}

module.exports = { sendEmail, sendOTP, sendResetLink, sendInvite };
