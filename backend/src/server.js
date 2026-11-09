const config = require('./config');
const app = require('./app');
const rulesSvc = require('./services/rules');
const reminders = require('./services/reminders');

app.listen(config.port, '0.0.0.0', async () => {
  console.log(`Triple i Oman API listening on port ${config.port} (${config.isProd ? 'production' : 'development'})`);
  try {
    const n = await rulesSvc.seed();
    if (n) console.log(`[rules] seeded ${n} rule(s) from the bundled library`);
  } catch (err) {
    console.error('[rules] seeding failed:', err.message);
  }
  reminders.start();
});
