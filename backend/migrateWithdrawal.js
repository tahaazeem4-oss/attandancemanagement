require('dotenv').config();
const db = require('./config/db');

async function migrate() {
  try {
    await db.query(`
      ALTER TABLE leave_applications
      ADD COLUMN IF NOT EXISTS withdrawal_status VARCHAR(20)
      CHECK (withdrawal_status IN ('pending', 'rejected'))
    `);
    console.log('✅  withdrawal_status column added to leave_applications');
  } catch (err) {
    console.error('Migration error:', err.message);
  }
  process.exit(0);
}

migrate();
