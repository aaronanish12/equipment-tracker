require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
});

async function run() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('Schema applied successfully.');

  // Optional: auto-create the first admin from env vars, so there's no need
  // to touch the database directly. Set ADMIN_PHONE and ADMIN_NAME in your
  // hosting provider's variables, redeploy once, then you can remove them.
  if (process.env.ADMIN_PHONE && process.env.ADMIN_NAME) {
    await pool.query(
      `INSERT INTO users (phone, name, role)
       VALUES ($1, $2, 'admin')
       ON CONFLICT (phone) DO UPDATE SET role = 'admin', name = EXCLUDED.name`,
      [process.env.ADMIN_PHONE.replace(/\D/g, ''), process.env.ADMIN_NAME]
    );
    console.log(`Admin user ensured for ${process.env.ADMIN_PHONE}.`);
  }

  await pool.end();
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
