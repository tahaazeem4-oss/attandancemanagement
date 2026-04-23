const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../config/db');

const signToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });

// ── POST /api/auth/login ──────────────────────────────────────
// Unified login: checks admins → teachers → student_accounts
exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: 'Email and password are required' });

  try {
    // 1. Admin
    const [admins] = await db.query('SELECT * FROM admins WHERE email = ?', [email]);
    if (admins.length > 0) {
      const admin = admins[0];
      if (!await bcrypt.compare(password, admin.password))
        return res.status(401).json({ message: 'Invalid credentials' });
      const user  = { id: admin.id, first_name: admin.first_name, last_name: admin.last_name, email: admin.email, role: 'admin' };
      const token = signToken(user);
      return res.json({ token, role: 'admin', user });
    }

    // 2. Teacher
    const [teachers] = await db.query('SELECT * FROM teachers WHERE email = ?', [email]);
    if (teachers.length > 0) {
      const t = teachers[0];
      if (!await bcrypt.compare(password, t.password))
        return res.status(401).json({ message: 'Invalid credentials' });
      const user  = { id: t.id, first_name: t.first_name, last_name: t.last_name, email: t.email, phone: t.phone, role: 'teacher' };
      const token = signToken(user);
      return res.json({ token, role: 'teacher', user, teacher: user }); // teacher key for backward compat
    }

    // 3. Student / Parent portal
    const [accs] = await db.query(
      `SELECT sa.id, sa.student_id, sa.email, sa.password, sa.phone,
              s.first_name, s.last_name, s.class_id, s.section_id, s.roll_no,
              c.class_name, sec.section_name
       FROM   student_accounts sa
       JOIN   students  s   ON s.id   = sa.student_id
       JOIN   classes   c   ON c.id   = s.class_id
       JOIN   sections  sec ON sec.id = s.section_id
       WHERE  sa.email = ?`,
      [email]
    );
    if (accs.length > 0) {
      const a = accs[0];
      if (!await bcrypt.compare(password, a.password))
        return res.status(401).json({ message: 'Invalid credentials' });
      const user  = {
        id: a.id, student_id: a.student_id,
        first_name: a.first_name, last_name: a.last_name,
        email: a.email, phone: a.phone, role: 'student',
        class_id: a.class_id, section_id: a.section_id,
        roll_no: a.roll_no, class_name: a.class_name, section_name: a.section_name
      };
      const token = signToken({ id: a.id, email: a.email, role: 'student', first_name: a.first_name, last_name: a.last_name, student_id: a.student_id });
      return res.json({ token, role: 'student', user });
    }

    return res.status(401).json({ message: 'Invalid credentials' });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ── POST /api/auth/signup ─────────────────────────────────────
// role: 'teacher' (default) or 'student'
exports.signup = async (req, res) => {
  const { role = 'teacher' } = req.body;

  // ── Student/Parent signup ────────────────────────────────
  if (role === 'student') {
    const { roll_no, email, password, phone } = req.body;
    if (!roll_no || !email || !password)
      return res.status(400).json({ message: 'roll_no, email and password are required' });

    try {
      const [students] = await db.query('SELECT * FROM students WHERE roll_no = ?', [roll_no]);
      if (students.length === 0)
        return res.status(404).json({ message: 'No student found with this roll number' });

      const student = students[0];

      const [existing] = await db.query(
        'SELECT id FROM student_accounts WHERE student_id = ? OR email = ?',
        [student.id, email]
      );
      if (existing.length > 0)
        return res.status(409).json({ message: 'Account already exists for this student or email' });

      const hashed = await bcrypt.hash(password, 12);
      const [result] = await db.query(
        'INSERT INTO student_accounts (student_id, email, password, phone) VALUES (?,?,?,?)',
        [student.id, email, hashed, phone || null]
      );

      const user  = {
        id: result.insertId, student_id: student.id,
        first_name: student.first_name, last_name: student.last_name,
        email, phone: phone || null, role: 'student',
        class_id: student.class_id, section_id: student.section_id, roll_no: student.roll_no
      };
      const token = signToken({ id: result.insertId, email, role: 'student', first_name: student.first_name, last_name: student.last_name, student_id: student.id });

      return res.status(201).json({ token, role: 'student', user });
    } catch (err) {
      console.error('Student signup error:', err);
      return res.status(500).json({ message: 'Server error' });
    }
  }

  // ── Teacher signup ───────────────────────────────────────
  const { first_name, last_name, email, password, phone } = req.body;
  if (!first_name || !last_name || !email || !password)
    return res.status(400).json({ message: 'All fields are required' });

  try {
    const [existing] = await db.query('SELECT id FROM teachers WHERE email = ?', [email]);
    if (existing.length > 0)
      return res.status(409).json({ message: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 12);
    const [result] = await db.query(
      'INSERT INTO teachers (first_name, last_name, email, password, phone) VALUES (?,?,?,?,?)',
      [first_name, last_name, email, hashed, phone || null]
    );

    const user  = { id: result.insertId, first_name, last_name, email, phone: phone || null, role: 'teacher' };
    const token = signToken(user);

    return res.status(201).json({ token, role: 'teacher', user, teacher: user });
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ── GET /api/auth/me ──────────────────────────────────────────
exports.getMe = async (req, res) => {
  try {
    const u = req.user;
    if (u.role === 'admin') {
      const [rows] = await db.query('SELECT id, first_name, last_name, email FROM admins WHERE id = ?', [u.id]);
      if (rows.length === 0) return res.status(404).json({ message: 'Admin not found' });
      return res.json({ ...rows[0], role: 'admin' });
    }
    if (u.role === 'student') {
      const [rows] = await db.query('SELECT sa.id, sa.email, s.first_name, s.last_name, s.roll_no FROM student_accounts sa JOIN students s ON s.id = sa.student_id WHERE sa.id = ?', [u.id]);
      if (rows.length === 0) return res.status(404).json({ message: 'Student not found' });
      return res.json({ ...rows[0], role: 'student' });
    }
    // teacher
    const [rows] = await db.query(
      'SELECT id, first_name, last_name, email, phone, created_at FROM teachers WHERE id = ?',
      [u.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Teacher not found' });
    return res.json({ ...rows[0], role: 'teacher' });
  } catch (err) {
    console.error('GetMe error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};
