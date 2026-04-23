/**
 * setup.js — Run once to create new tables and seed the admin account.
 * Usage: node setup.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db     = require('./config/db');

async function migrate() {
  console.log('Running migrations...\n');

  await db.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      first_name VARCHAR(100) NOT NULL,
      last_name  VARCHAR(100) NOT NULL,
      email      VARCHAR(150) NOT NULL UNIQUE,
      password   VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✓ admins table ready');

  await db.query(`
    CREATE TABLE IF NOT EXISTS student_accounts (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      student_id INT NOT NULL UNIQUE,
      email      VARCHAR(150) NOT NULL UNIQUE,
      password   VARCHAR(255) NOT NULL,
      phone      VARCHAR(20),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    )
  `);
  console.log('✓ student_accounts table ready');

  await db.query(`
    CREATE TABLE IF NOT EXISTS leave_applications (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      student_id INT NOT NULL,
      date       DATE NOT NULL,
      reason     TEXT NOT NULL,
      status     ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_student_leave_date (student_id, date),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    )
  `);
  console.log('✓ leave_applications table ready');

  // Create default admin account
  const adminEmail = 'admin@school.com';
  const [existing] = await db.query('SELECT id FROM admins WHERE email = ?', [adminEmail]);
  if (existing.length === 0) {
    const hash = await bcrypt.hash('Admin@123', 12);
    await db.query(
      'INSERT INTO admins (first_name, last_name, email, password) VALUES (?,?,?,?)',
      ['School', 'Admin', adminEmail, hash]
    );
    console.log('\n✓ Admin account created');
    console.log('  Email:    admin@school.com');
    console.log('  Password: Admin@123');
  } else {
    console.log('✓ Admin account already exists');
  }

  console.log('\nMigration complete! ✅');
  process.exit(0);
}

migrate().catch(err => { console.error('Migration failed:', err); process.exit(1); });
