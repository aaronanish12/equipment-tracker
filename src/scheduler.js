const cron = require('node-cron');
const db = require('./db');
const { sendDailyCheckTemplate } = require('./whatsapp');

// Default: every day at 18:00 server time. Change the cron string or set
// EVENING_CHECK_CRON in .env to adjust (cron uses the server's local timezone
// unless you set process.env.TZ).
const CRON_EXPRESSION = process.env.EVENING_CHECK_CRON || '0 18 * * *';

async function runEveningCheck() {
  console.log('Running evening equipment check-in...');
  const r = await db.query('SELECT * FROM users WHERE active = true AND role != $1', ['admin']);
  for (const user of r.rows) {
    try {
      await sendDailyCheckTemplate(user.phone, user.name);
    } catch (err) {
      console.error(`Failed to send evening check to ${user.phone}:`, err.message);
    }
  }
  console.log(`Evening check-in sent to ${r.rows.length} users.`);
}

function startScheduler() {
  cron.schedule(CRON_EXPRESSION, runEveningCheck);
  console.log(`Evening check-in scheduled: "${CRON_EXPRESSION}"`);
}

module.exports = { startScheduler, runEveningCheck };
