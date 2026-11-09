require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';

function required(name, devFallback) {
  const v = process.env[name];
  if (v) return v;
  if (isProd) {
    throw new Error(`Missing required environment variable ${name}. Set it in Railway → service → Variables.`);
  }
  return devFallback;
}

const bool = (v, d) => (v === undefined || v === '' ? d : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()));

module.exports = {
  isProd,
  port: parseInt(process.env.PORT, 10) || 4000,
  jwt: {
    // Tokens are issued by the Triple i Oman realm only (plan §5.1). Oman APIs reject any other issuer/audience.
    secret: required('JWT_SECRET', 'dev-only-oman-access-secret'),
    refreshSecret: required('JWT_REFRESH_SECRET', 'dev-only-oman-refresh-secret'),
    issuer: process.env.JWT_ISSUER || 'triplei-oman',
    audience: 'om-api',
    accessExpiry: '30m',
    refreshExpiry: '14d',
  },
  appUrl: process.env.APP_URL || process.env.FRONTEND_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'http://localhost:5173'),
  corsOrigins: process.env.CORS_ORIGINS || process.env.FRONTEND_URL || '',
  tripleiUrl: process.env.TRIPLEI_URL || 'https://app.triplei.io',
  allowPublicSignup: bool(process.env.ALLOW_PUBLIC_SIGNUP, true),
  mfaRequired: bool(process.env.MFA_REQUIRED, isProd),
  bootstrapAdminEmail: (process.env.BOOTSTRAP_ADMIN_EMAIL || '').toLowerCase() || null,
  resend: {
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.RESEND_FROM || 'Triple i Oman <noreply@triplei.io>',
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
  },
  asp: {
    // Partner Accredited Service Provider for Fawtara. 'sandbox' simulates the ASP locally.
    provider: process.env.ASP_PROVIDER || 'sandbox',
    baseUrl: process.env.ASP_BASE_URL || '',
    apiKey: process.env.ASP_API_KEY || '',
  },
  serveFrontend: bool(process.env.SERVE_FRONTEND, true),
};
