/**
 * Seed students for Happy Palace Grammer School (HPGS) & DEBS School
 * Email format : firstname@hpgs.com  /  firstname@debs.com
 * Password     : Karachi@123 (for all student accounts)
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db     = require('./config/db');

// ── Data ───────────────────────────────────────────────────────────────────
// school_id=1  Happy Palace Grammer School  domain: hpgs.com
// class_id=4 Grade 5  → sec 7(A) 8(B) 9(C)
// class_id=5 Grade 6  → sec 10(A) 11(B) 12(C)
// class_id=6 Grade 7  → sec 13(A) 14(B) 15(C)

const HPGS_STUDENTS = [
  // Grade 5
  { first_name:'Ali',    last_name:'Raza',     age:11, class_id:4, section_id:7,  roll_no:'5A-01' },
  { first_name:'Hamza',  last_name:'Sheikh',   age:11, class_id:4, section_id:7,  roll_no:'5A-02' },
  { first_name:'Sara',   last_name:'Malik',    age:11, class_id:4, section_id:7,  roll_no:'5A-03' },
  { first_name:'Umar',   last_name:'Farooq',   age:11, class_id:4, section_id:8,  roll_no:'5B-01' },
  { first_name:'Fatima', last_name:'Iqbal',    age:11, class_id:4, section_id:8,  roll_no:'5B-02' },
  { first_name:'Zainab', last_name:'Hussain',  age:11, class_id:4, section_id:8,  roll_no:'5B-03' },
  { first_name:'Ahmed',  last_name:'Siddiqui', age:11, class_id:4, section_id:9,  roll_no:'5C-01' },
  { first_name:'Maryam', last_name:'Anwar',    age:11, class_id:4, section_id:9,  roll_no:'5C-02' },
  { first_name:'Hassan', last_name:'Qureshi',  age:11, class_id:4, section_id:9,  roll_no:'5C-03' },
  // Grade 6
  { first_name:'Bilal',  last_name:'Chaudhry', age:12, class_id:5, section_id:10, roll_no:'6A-01' },
  { first_name:'Ayesha', last_name:'Nasir',    age:12, class_id:5, section_id:10, roll_no:'6A-02' },
  { first_name:'Noman',  last_name:'Butt',     age:12, class_id:5, section_id:10, roll_no:'6A-03' },
  { first_name:'Tariq',  last_name:'Mehmood',  age:12, class_id:5, section_id:11, roll_no:'6B-01' },
  { first_name:'Hira',   last_name:'Aslam',    age:12, class_id:5, section_id:11, roll_no:'6B-02' },
  { first_name:'Asad',   last_name:'Javed',    age:12, class_id:5, section_id:11, roll_no:'6B-03' },
  { first_name:'Imran',  last_name:'Mirza',    age:12, class_id:5, section_id:12, roll_no:'6C-01' },
  { first_name:'Sana',   last_name:'Baig',     age:12, class_id:5, section_id:12, roll_no:'6C-02' },
  { first_name:'Kashif', last_name:'Dar',      age:12, class_id:5, section_id:12, roll_no:'6C-03' },
  // Grade 7
  { first_name:'Adeel',  last_name:'Rehman',   age:13, class_id:6, section_id:13, roll_no:'7A-01' },
  { first_name:'Rabia',  last_name:'Yousuf',   age:13, class_id:6, section_id:13, roll_no:'7A-02' },
  { first_name:'Faisal', last_name:'Zafar',    age:13, class_id:6, section_id:13, roll_no:'7A-03' },
  { first_name:'Kamran', last_name:'Lodhi',    age:13, class_id:6, section_id:14, roll_no:'7B-01' },
  { first_name:'Nadia',  last_name:'Waheed',   age:13, class_id:6, section_id:14, roll_no:'7B-02' },
  { first_name:'Waqar',  last_name:'Abbas',    age:13, class_id:6, section_id:14, roll_no:'7B-03' },
  { first_name:'Junaid', last_name:'Gillani',  age:13, class_id:6, section_id:15, roll_no:'7C-01' },
  { first_name:'Amna',   last_name:'Sabir',    age:13, class_id:6, section_id:15, roll_no:'7C-02' },
  { first_name:'Shoaib', last_name:'Awan',     age:13, class_id:6, section_id:15, roll_no:'7C-03' },
];

// school_id=2  DEBS School  domain: debs.com
// class_id=1 Class 1 → sec 1(A) 2(B)
// class_id=2 KG-1    → sec 3(A) 4(B)
// class_id=3 KG-2    → sec 5(A) 6(B)

const DEBS_STUDENTS = [
  // Class 1
  { first_name:'Zara',   last_name:'Hashmi',   age:7,  class_id:1, section_id:1, roll_no:'C1A-01' },
  { first_name:'Hasan',  last_name:'Nawaz',    age:7,  class_id:1, section_id:1, roll_no:'C1A-02' },
  { first_name:'Layla',  last_name:'Khalid',   age:7,  class_id:1, section_id:1, roll_no:'C1A-03' },
  { first_name:'Rania',  last_name:'Saleem',   age:7,  class_id:1, section_id:2, roll_no:'C1B-01' },
  { first_name:'Khalid', last_name:'Riaz',     age:7,  class_id:1, section_id:2, roll_no:'C1B-02' },
  { first_name:'Dina',   last_name:'Hamid',    age:7,  class_id:1, section_id:2, roll_no:'C1B-03' },
  // KG-1
  { first_name:'Lina',   last_name:'Bashir',   age:5,  class_id:2, section_id:3, roll_no:'KG1A-01' },
  { first_name:'Omar',   last_name:'Sultan',   age:5,  class_id:2, section_id:3, roll_no:'KG1A-02' },
  { first_name:'Taha',   last_name:'Aziz',     age:5,  class_id:2, section_id:3, roll_no:'KG1A-03' },
  { first_name:'Raya',   last_name:'Noor',     age:5,  class_id:2, section_id:4, roll_no:'KG1B-01' },
  { first_name:'Sami',   last_name:'Tariq',    age:5,  class_id:2, section_id:4, roll_no:'KG1B-02' },
  { first_name:'Nour',   last_name:'Arif',     age:5,  class_id:2, section_id:4, roll_no:'KG1B-03' },
  // KG-2
  { first_name:'Joud',   last_name:'Saeed',    age:6,  class_id:3, section_id:5, roll_no:'KG2A-01' },
  { first_name:'Yara',   last_name:'Munir',    age:6,  class_id:3, section_id:5, roll_no:'KG2A-02' },
  { first_name:'Faris',  last_name:'Chishti',  age:6,  class_id:3, section_id:5, roll_no:'KG2A-03' },
  { first_name:'Lena',   last_name:'Rashid',   age:6,  class_id:3, section_id:6, roll_no:'KG2B-01' },
  { first_name:'Basim',  last_name:'Ghazi',    age:6,  class_id:3, section_id:6, roll_no:'KG2B-02' },
  { first_name:'Hala',   last_name:'Amin',     age:6,  class_id:3, section_id:6, roll_no:'KG2B-03' },
];

// ── Helper ──────────────────────────────────────────────────────────────────
async function seedSchool(students, schoolId, domain) {
  const password = await bcrypt.hash('Karachi@123', 12);
  let inserted = 0, skipped = 0;

  for (const s of students) {
    // Insert student (skip if same name+class+section already exists)
    const [existing] = await db.query(
      'SELECT id FROM students WHERE school_id=$1 AND first_name=$2 AND class_id=$3 AND section_id=$4',
      [schoolId, s.first_name, s.class_id, s.section_id]
    );
    if (existing.length > 0) { skipped++; continue; }

    const [rows] = await db.query(
      `INSERT INTO students (school_id, first_name, last_name, age, class_id, section_id, roll_no)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [schoolId, s.first_name, s.last_name, s.age, s.class_id, s.section_id, s.roll_no]
    );
    const studentId = rows[0].id;
    const email = `${s.first_name.toLowerCase()}@${domain}`;

    await db.query(
      `INSERT INTO student_accounts (student_id, email, password)
       VALUES ($1,$2,$3) ON CONFLICT (email) DO NOTHING`,
      [studentId, email, password]
    );

    inserted++;
    console.log(`  ✅ ${s.first_name} ${s.last_name}  →  ${email}`);
  }
  return { inserted, skipped };
}

// ── Main ───────────────────────────────────────────────────────────────────
(async () => {
  try {
    console.log('\n📚 Seeding HAPPY PALACE GRAMMER SCHOOL students...');
    const hp = await seedSchool(HPGS_STUDENTS, 1, 'hpgs.com');

    console.log('\n📚 Seeding DEBS SCHOOL students...');
    const debs = await seedSchool(DEBS_STUDENTS, 2, 'debs.com');

    console.log('\n──────────────────────────────────────────');
    console.log(`HPGS : ${hp.inserted} inserted, ${hp.skipped} already existed`);
    console.log(`DEBS : ${debs.inserted} inserted, ${debs.skipped} already existed`);
    console.log('\nPassword for all accounts: Karachi@123');
    console.log('──────────────────────────────────────────\n');
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
