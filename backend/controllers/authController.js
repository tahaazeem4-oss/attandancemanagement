const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../config/db');

// ── signToken ─────────────────────────────────────────────────
// Creates a signed JWT containing the user's identity fields.
// Expiry defaults to 7 days (JWT_EXPIRES_IN env var can override).
// IMPORTANT: any field used by middleware (role, school_id, class_id,
// section_id) MUST be included here — the auth middleware does NOT
// re-query the database; it reads directly from the token payload.
const signToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '365d'
  });

// ── getSchool ─────────────────────────────────────────────────
// Fetches school branding (name, logo, colours) for a given school_id.
// Expands relative logo_url to a full http URL using the current request host.
// Returns null if school_id is falsy or not found.
const getSchool = async (school_id, req) => {
  if (!school_id) return null;
  const [rows] = await db.query(
    'SELECT id, name, tagline, initials, logo_url, primary_color, accent_color FROM schools WHERE id=?',
    [school_id]
  );
  const school = rows[0];
  if (!school) return null;
  if (school.logo_url && !school.logo_url.startsWith('http')) {
    school.logo_url = `${req.protocol}://${req.get('host')}${school.logo_url}`;
  }
  return school;
};

// ── POST /api/auth/login ──────────────────────────────────────
// Tries each user table in priority order: super_admin → admin → teacher → student.
// Returns { token, role, user, school } on success.
// The JWT payload must include every field that controllers read from req.user
// (role, school_id, class_id, section_id, etc.) because the auth middleware
// does NOT hit the database — it only decodes the token.
exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: 'Email and password are required' });

  const e = email.trim().toLowerCase();

  try {
    // 1. Super Admin
    const [superAdmins] = await db.query('SELECT * FROM super_admins WHERE email = ?', [e]);
    if (superAdmins.length > 0) {
      const sa = superAdmins[0];
      if (!await bcrypt.compare(password, sa.password))
        return res.status(401).json({ message: 'Invalid credentials' });
      const user  = { id: sa.id, first_name: sa.first_name, last_name: sa.last_name, email: sa.email, role: 'super_admin' };
      const token = signToken(user);
      return res.json({ token, role: 'super_admin', user, school: null });
    }

    // 2. Admin
    const [admins] = await db.query('SELECT * FROM admins WHERE email = ?', [e]);
    if (admins.length > 0) {
      const admin = admins[0];
      if (!await bcrypt.compare(password, admin.password))
        return res.status(401).json({ message: 'Invalid credentials' });
      const school = await getSchool(admin.school_id, req);
      const user   = { id: admin.id, first_name: admin.first_name, last_name: admin.last_name, email: admin.email, role: 'admin', school_id: admin.school_id };
      const token  = signToken(user);
      return res.json({ token, role: 'admin', user, school });
    }

    // 3. Teacher
    const [teachers] = await db.query('SELECT * FROM teachers WHERE email = ?', [e]);
    if (teachers.length > 0) {
      const t = teachers[0];
      if (!await bcrypt.compare(password, t.password))
        return res.status(401).json({ message: 'Invalid credentials' });
      const school = await getSchool(t.school_id, req);
      const user   = { id: t.id, first_name: t.first_name, last_name: t.last_name, email: t.email, phone: t.phone, role: 'teacher', school_id: t.school_id };
      const token  = signToken(user);
      return res.json({ token, role: 'teacher', user, school, teacher: user });
    }

    // 4. Student / Parent portal
    const [accs] = await db.query(
      `SELECT sa.id, sa.student_id, sa.email, sa.password, sa.phone,
              s.first_name, s.last_name, s.class_id, s.section_id, s.roll_no, s.school_id,
              c.class_name, sec.section_name
       FROM   student_accounts sa
       JOIN   students  s   ON s.id   = sa.student_id
       JOIN   classes   c   ON c.id   = s.class_id
       JOIN   sections  sec ON sec.id = s.section_id
       WHERE  sa.email = ?`,
      [e]
    );
    if (accs.length > 0) {
      const a = accs[0];
      if (!await bcrypt.compare(password, a.password))
        return res.status(401).json({ message: 'Invalid credentials' });
      const school = await getSchool(a.school_id, req);
      const user   = {
        id: a.id, student_id: a.student_id,
        first_name: a.first_name, last_name: a.last_name,
        email: a.email, phone: a.phone, role: 'student',
        school_id: a.school_id,
        class_id: a.class_id, section_id: a.section_id,
        roll_no: a.roll_no, class_name: a.class_name, section_name: a.section_name
      };
      const token = signToken({ id: a.id, email: a.email, role: 'student', first_name: a.first_name, last_name: a.last_name, student_id: a.student_id, school_id: a.school_id, class_id: a.class_id, section_id: a.section_id });
      return res.json({ token, role: 'student', user, school });
    }

    return res.status(401).json({ message: 'Invalid credentials' });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ── POST /api/auth/signup ────────────────────────────────────
// Handles two roles:
//   role='student' — looks up roll_no in students table, creates student_account.
//   role='teacher' (default) — creates a new teacher record.
// Returns the same { token, role, user, school } shape as /login.
exports.signup = async (req, res) => {
  const { role = 'teacher' } = req.body;

  if (role === 'student') {
    const { roll_no, email, password, phone } = req.body;
    if (!roll_no || !email || !password)
      return res.status(400).json({ message: 'roll_no, email and password are required' });

    try {
      const [students] = await db.query('SELECT * FROM students WHERE roll_no = ?', [roll_no.trim().toUpperCase()]);
      if (students.length === 0)
        return res.status(404).json({ message: 'No student found with this roll number' });

      const student = students[0];
      const [existing] = await db.query(
        'SELECT id FROM student_accounts WHERE student_id = ? OR email = ?',
        [student.id, email.trim().toLowerCase()]
      );
      if (existing.length > 0)
        return res.status(409).json({ message: 'Account already exists for this student or email' });

      const hashed = await bcrypt.hash(password, 12);
      const [result] = await db.query(
        'INSERT INTO student_accounts (student_id, email, password, phone) VALUES (?,?,?,?) RETURNING id',
        [student.id, email.trim().toLowerCase(), hashed, phone || null]
      );
      const newId = result[0].id;

      const school = await getSchool(student.school_id, req);
      const user   = {
        id: newId, student_id: student.id,
        first_name: student.first_name, last_name: student.last_name,
        email: email.trim().toLowerCase(), phone: phone || null, role: 'student',
        school_id: student.school_id,
        class_id: student.class_id, section_id: student.section_id, roll_no: student.roll_no
      };
      // Include class_id + section_id in the token so controllers
      // (e.g. getLectures, getFile) can filter by the student's class
      // without an extra DB query on every request.
      const token = signToken({ id: newId, email: user.email, role: 'student', first_name: student.first_name, last_name: student.last_name, student_id: student.id, school_id: student.school_id, class_id: student.class_id, section_id: student.section_id });
      return res.status(201).json({ token, role: 'student', user, school });
    } catch (err) {
      console.error('Student signup error:', err);
      return res.status(500).json({ message: 'Server error' });
    }
  }

  // Teacher signup
  const { first_name, last_name, email, password, phone, school_id } = req.body;
  if (!first_name || !last_name || !email || !password)
    return res.status(400).json({ message: 'All fields are required' });
  if (!school_id)
    return res.status(400).json({ message: 'school_id is required' });

  try {
    const [schoolRows] = await db.query('SELECT id FROM schools WHERE id=?', [school_id]);
    if (schoolRows.length === 0)
      return res.status(404).json({ message: 'School not found' });

    const [existing] = await db.query('SELECT id FROM teachers WHERE email = ?', [email.trim().toLowerCase()]);
    if (existing.length > 0)
      return res.status(409).json({ message: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 12);
    const [result] = await db.query(
      'INSERT INTO teachers (school_id, first_name, last_name, email, password, phone) VALUES (?,?,?,?,?,?) RETURNING id',
      [school_id, first_name, last_name, email.trim().toLowerCase(), hashed, phone || null]
    );
    const newId = result[0].id;

    const school = await getSchool(school_id, req);
    const user   = { id: newId, first_name, last_name, email: email.trim().toLowerCase(), phone: phone || null, role: 'teacher', school_id };
    const token  = signToken(user);
    return res.status(201).json({ token, role: 'teacher', user, school, teacher: user });
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};


// ── GET /api/auth/me ─────────────────────────────────────────
// Returns fresh profile data for the currently logged-in user.
// Used on app resume / token refresh to re-sync the UI with the DB.
exports.getMe = async (req, res) => {
  try {
    const u = req.user;

    if (u.role === 'super_admin') {
      const [rows] = await db.query('SELECT id, first_name, last_name, email FROM super_admins WHERE id = ?', [u.id]);
      if (!rows.length) return res.status(404).json({ message: 'Not found' });
      return res.json({ ...rows[0], role: 'super_admin', school: null });
    }

    if (u.role === 'admin') {
      const [rows] = await db.query('SELECT id, school_id, first_name, last_name, email FROM admins WHERE id = ?', [u.id]);
      if (!rows.length) return res.status(404).json({ message: 'Admin not found' });
      const school = await getSchool(rows[0].school_id, req);
      return res.json({ ...rows[0], role: 'admin', school });
    }

    if (u.role === 'student') {
      const [rows] = await db.query(
        `SELECT sa.id, sa.email, s.first_name, s.last_name, s.roll_no, s.school_id,
                s.class_id, s.section_id, c.class_name, sec.section_name
         FROM   student_accounts sa
         JOIN   students  s   ON s.id   = sa.student_id
         JOIN   classes   c   ON c.id   = s.class_id
         JOIN   sections  sec ON sec.id = s.section_id
         WHERE  sa.id = ?`, [u.id]);
      if (!rows.length) return res.status(404).json({ message: 'Student not found' });
      const school = await getSchool(rows[0].school_id, req);
      return res.json({ ...rows[0], role: 'student', school });
    }

    const [rows] = await db.query(
      'SELECT id, school_id, first_name, last_name, email, phone, created_at FROM teachers WHERE id = ?',
      [u.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Teacher not found' });
    const school = await getSchool(rows[0].school_id, req);
    return res.json({ ...rows[0], role: 'teacher', school });
  } catch (err) {
    console.error('GetMe error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};
