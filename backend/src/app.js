const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { globalErrorHandler } = require('./lib/errors');

const app = express();
app.set('trust proxy', 1); // Railway runs behind a proxy
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'img-src': ["'self'", 'data:', 'blob:'],
      'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'connect-src': ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(compression());
const origins = config.corsOrigins.split(',').map((s) => s.trim()).filter(Boolean);
if (origins.length) app.use('/api', cors({ origin: origins, credentials: false }));
app.use(express.json({ limit: '5mb' }));

app.use(['/api/auth/login', '/api/auth/signup', '/api/auth/mfa', '/api/auth/forgot-password', '/api/auth/reset-password', '/api/auth/accept-invite'], rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests. Try again in a few minutes.' } }));
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));

app.get('/api/health', async (req, res) => {
  let db = 'unknown';
  try { await require('./config/prisma').$queryRawUnsafe('SELECT 1'); db = 'ok'; } catch { db = 'down'; }
  res.status(db === 'ok' ? 200 : 503).json({ status: db === 'ok' ? 'ok' : 'degraded', db, service: 'triplei-oman', time: new Date().toISOString() });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/orgs', require('./routes/orgs'));
app.use('/api/obligations', require('./routes/obligations'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/returns', require('./routes/returns'));
app.use('/api/einvoices', require('./routes/einvoices'));
app.use('/api/parties', require('./routes/parties'));
app.use('/api/wht', require('./routes/wht'));
app.use('/api/calculators', require('./routes/calculators'));
app.use('/api/pit', require('./routes/pit'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/letters', require('./routes/letters'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/assistant', require('./routes/assistant'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api', require('./routes/account'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Serve the built React app from the same service (single Railway service).
const dist = process.env.FRONTEND_DIST || path.resolve(__dirname, '../../frontend/dist');
if (config.serveFrontend && fs.existsSync(path.join(dist, 'index.html'))) {
  app.use(express.static(dist, { index: false, maxAge: '1h', setHeaders: (res, p) => { if (p.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); } }));
  app.get('*', (req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.sendFile(path.join(dist, 'index.html')); });
}

app.use(globalErrorHandler);

module.exports = app;
