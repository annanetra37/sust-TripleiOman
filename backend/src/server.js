const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { globalErrorHandler } = require('./utils/errors');

const app = express();

// Trust proxy (Railway, Render, etc. run behind a reverse proxy)
app.set('trust proxy', 1);

// Security & performance
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: config.frontend.url ? config.frontend.url.split(',').map(u => u.trim()) : '*',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 50, message: { error: 'Too many requests' } }));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/s1', require('./routes/s1'));
app.use('/api/g1', require('./routes/g1'));
app.use('/api/e1', require('./routes/e1'));
app.use('/api/credits', require('./routes/credits'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/history', require('./routes/history'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/reports/v2', require('./routes/reportsV2'));
app.use('/api/connections', require('./routes/connections'));
app.use('/api/assistant', require('./routes/assistant'));
app.use('/api/lineage', require('./routes/lineage'));
app.use('/api/activity-log', require('./routes/activityLog'));
app.use('/api/exports', require('./routes/exports'));
app.use('/api/roi', require('./routes/roi'));
app.use('/api/sectors', require('./routes/sectors'));
app.use('/api/pcf', require('./routes/pcf'));
app.use('/api/benchmarks', require('./routes/benchmarks'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/portal', require('./routes/supplierPortal'));
app.use('/api/real-estate', require('./routes/realEstate'));
app.use('/api/financial', require('./routes/financial'));
app.use('/api/iso-gri', require('./routes/isoGri'));
app.use('/api/iso', require('./routes/iso'));
app.use('/api/prepare', require('./routes/prepare'));
app.use('/api/readiness-assessment', require('./routes/readinessAssessment'));
app.use('/api/water', require('./routes/water'));
app.use('/api/biodiversity', require('./routes/biodiversity'));

// Health check
app.get('/api/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Global error handler — returns meaningful messages
app.use(globalErrorHandler);

app.listen(config.port, async () => {
  console.log(`Triple I ESG API running on port ${config.port}`);

  // Boot-time sector pack loader.  Reads backend/src/sectors/*/pack.json
  // and upserts SectorPack + SectorKpi + EmissionFactor rows.  Safe to run
  // on every boot — all writes are idempotent.  Skipped if SKIP_SECTOR_LOAD=1
  // (useful for local dev against a freshly-empty DB before migrate has run).
  if (process.env.SKIP_SECTOR_LOAD !== '1') {
    try {
      const sectorLoader = require('./services/sectorLoader');
      await sectorLoader.loadAllPacks();
    } catch (err) {
      console.error('[server] sectorLoader failed on boot:', err.message);
    }
  }
});

module.exports = app;
