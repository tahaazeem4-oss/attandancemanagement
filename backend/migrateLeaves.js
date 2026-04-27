/**
 * Migration: multi-date leave support
 *  1. Add group_id UUID to leave_applications
 *  2. Add 'cancelled' to the status CHECK constraint
 *  3. Make teacher_id nullable in student_attendance (for auto-marking via leave approval)
 */
require('dotenv').config();
const db = require('./config/db');

(async () => {
  try {
    // 1. Add group_id column (safe if it already exists)
    await db.query(`
      ALTER TABLE leave_applications
      ADD COLUMN IF NOT EXISTS group_id UUID DEFAULT gen_random_uuid()
    `);
    console.log('✅ group_id column added (or already exists)');

    // 2. Drop + recreate the status check to include 'cancelled'
    await db.query(`
      ALTER TABLE leave_applications
      DROP CONSTRAINT IF EXISTS leave_applications_status_check
    `);
    await db.query(`
      ALTER TABLE leave_applications
      ADD CONSTRAINT leave_applications_status_check
        CHECK (status IN ('pending','approved','rejected','cancelled'))
    `);
    console.log('✅ Status check constraint updated (pending/approved/rejected/cancelled)');

    // 3. Make teacher_id nullable in student_attendance
    //    (needed so admin can auto-mark leave without a teacher_id)
    await db.query(`
      ALTER TABLE student_attendance
      ALTER COLUMN teacher_id DROP NOT NULL
    `);
    console.log('✅ teacher_id in student_attendance is now nullable');

    console.log('\n✅ Migration complete.\n');
    process.exit(0);
  } catch (e) {
    console.error('Migration error:', e.message);
    process.exit(1);
  }
})();
