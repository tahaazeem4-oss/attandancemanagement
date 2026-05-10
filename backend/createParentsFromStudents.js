/*
  One-time migration script:
  - Create parent accounts for students that do not have a parent mapping.
  - Map each student to a parent in parent_student.
  - Remove student portal credentials from student_accounts.
*/

require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./config/db');

const DEFAULT_PARENT_PASSWORD = process.env.DEFAULT_PARENT_PASSWORD || 'Parent@123';

function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'school';
}

function buildParentEmail(studentId, schoolName) {
  const schoolSlug = slugify(schoolName);
  return `parent${studentId}@${schoolSlug}.local`;
}

async function run() {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const hashed = await bcrypt.hash(DEFAULT_PARENT_PASSWORD, 12);

    const studentsRes = await client.query(
      `SELECT s.id, s.first_name, s.last_name, s.school_id, sch.name AS school_name
       FROM students s
       JOIN schools sch ON sch.id = s.school_id
       ORDER BY s.school_id, s.id`
    );

    let createdParents = 0;
    let linkedStudents = 0;
    let skippedAlreadyLinked = 0;

    for (const s of studentsRes.rows) {
      const alreadyLinkedRes = await client.query(
        'SELECT 1 FROM parent_student WHERE student_id = $1 LIMIT 1',
        [s.id]
      );
      if (alreadyLinkedRes.rowCount > 0) {
        skippedAlreadyLinked += 1;
        continue;
      }

      let email = buildParentEmail(s.id, s.school_name);
      let parentId;

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const tryEmail = attempt === 0 ? email : email.replace('@', `-${attempt}@`);

        const upsertParentRes = await client.query(
          `INSERT INTO parents (email, password, first_name, last_name)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (email)
           DO UPDATE SET updated_at = NOW()
           RETURNING id`,
          [tryEmail, hashed, 'Parent', s.last_name || 'Guardian']
        );

        if (upsertParentRes.rowCount > 0) {
          parentId = upsertParentRes.rows[0].id;
          email = tryEmail;
          break;
        }
      }

      if (!parentId) {
        throw new Error(`Could not create/find parent for student_id=${s.id}`);
      }

      await client.query(
        `INSERT INTO parent_student (parent_id, student_id, relationship, verified)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (parent_id, student_id) DO NOTHING`,
        [parentId, s.id, 'parent', true]
      );

      createdParents += 1;
      linkedStudents += 1;
    }

    const deleteStudentAccountsRes = await client.query('DELETE FROM student_accounts');

    await client.query('COMMIT');

    console.log('✅ Parent migration completed');
    console.log(`   Parents created/used for mapping: ${createdParents}`);
    console.log(`   Students linked to parents     : ${linkedStudents}`);
    console.log(`   Students already linked        : ${skippedAlreadyLinked}`);
    console.log(`   Student credentials removed    : ${deleteStudentAccountsRes.rowCount}`);
    console.log(`   Default parent password        : ${DEFAULT_PARENT_PASSWORD}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Parent migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await db.pool.end();
  }
}

run();
