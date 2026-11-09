const config = require('./config');
const app = require('./app');
const rulesSvc = require('./services/rules');
const reminders = require('./services/reminders');

app.listen(config.port, '0.0.0.0', async () => {
  console.log(`Triple i Oman API listening on port ${config.port} (${config.isProd ? 'production' : 'development'})`);
  if (config.isProd && !config.corsOrigins) {
    console.warn('[cors] CORS_ORIGINS is not set: a web app on another domain (e.g. https://om.triplei.io) will be blocked by the browser.');
  }
  try {
    const n = await rulesSvc.seed();
    if (n) console.log(`[rules] seeded ${n} rule(s) from the bundled library`);
  } catch (err) {
    console.error('[rules] seeding failed:', err.message);
  }
  reminders.start();
});
