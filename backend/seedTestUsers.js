/**
 * seedTestUsers.js
 * Creates one student portal account linked to Ali Raza (G1A-01)
 * Run once: node seedTestUsers.js
 */
const bcrypt = require('bcryptjs');
const pool   = require('./config/db');

async function run() {
  const conn = await pool.getConnection();
  try {
    // ── 1. Verify Ali Raza exists ─────────────────────────────
    const [rows] = await conn.query(
      `SELECT s.id, s.first_name, s.last_name, s.roll_no,
              c.class_name, sec.section_name
       FROM students s
       JOIN classes  c   ON c.id   = s.class_id
       JOIN sections sec ON sec.id = s.section_id
       WHERE s.roll_no = 'G1A-01'
       LIMIT 1`
    );

    if (!rows.length) {
      console.error('❌  Student G1A-01 not found — have you run seed.sql yet?');
      process.exit(1);
    }

    const student = rows[0];
    console.log(`\nFound: ${student.first_name} ${student.last_name}  (${student.class_name} — Sec ${student.section_name})`);

    // ── 2. Hash password ──────────────────────────────────────
    const hash = await bcrypt.hash('student123', 12);

    // ── 3. Insert portal account ──────────────────────────────
    await conn.query(
      `INSERT INTO student_accounts (student_id, email, password, phone)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE email = VALUES(email), password = VALUES(password)`,
      [student.id, 'ali.raza@student.com', hash, '03001111111']
    );

    console.log('\n✅  Test users ready:\n');
    console.log('  ADMIN');
    console.log('  ─────────────────────────────');
    console.log('  Email   : admin@school.com');
    console.log('  Password: Admin@123\n');
    console.log('  STUDENT / PARENT  (Ali Raza — Grade 1-A)');
    console.log('  ─────────────────────────────');
    console.log('  Email   : ali.raza@student.com');
    console.log('  Password: student123');
    console.log('  Roll No : G1A-01');
    console.log('  (used only on the Sign-Up screen to create this account)\n');

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    conn.release();
    process.exit(0);
  }
}

run();
