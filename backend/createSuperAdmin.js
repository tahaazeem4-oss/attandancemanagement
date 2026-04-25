/**
 * Run once to create the platform super admin account.
 * Usage: node createSuperAdmin.js
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const db     = require('./config/db');

async function main() {
  const email     = 'tahaazeem4@gmail.com';
  const password  = 'Karachi@1234';
  const firstName = 'Taha';
  const lastName  = 'Azeem';

  const hash = await bcrypt.hash(password, 12);

  const [result] = await db.query(
    `INSERT INTO super_admins (first_name, last_name, email, password)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE password = VALUES(password)`,
    [firstName, lastName, email, hash]
  );

  if (result.affectedRows > 0) {
    console.log('✅ Super admin created / updated successfully.');
    console.log('   Email   :', email);
    console.log('   Password: Karachi@1234');
  } else {
    console.log('ℹ️  No changes made.');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
