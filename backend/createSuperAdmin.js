/**
 * Run once to create the platform super admin account.
 * Usage: node createSuperAdmin.js
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const db     = require('./config/db');

async function main() {
  const email     = 'tahaazeem4@gmail.com';
  const password  = 'Karachi@123';
  const firstName = 'Taha';
  const lastName  = 'Azeem';

  const hash = await bcrypt.hash(password, 12);

  const [rows] = await db.query(
    `INSERT INTO super_admins (first_name, last_name, email, password)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password
     RETURNING id`,
    [firstName, lastName, email, hash]
  );

  console.log('✅ Super admin created / updated successfully.');
  console.log('   Email   :', email);
  console.log('   Password: Karachi@123');
  console.log('   ID      :', rows[0].id);

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
