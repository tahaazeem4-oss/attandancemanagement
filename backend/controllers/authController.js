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

// ── POST /api/auth/forgot-password/request ───────────────────
// Accepts an email, finds the user across all 4 role tables, generates a
// 6-digit OTP, stores its bcrypt hash in password_reset_codes, and emails it.
// Always returns 200 with the same message to avoid leaking whether an
// email is registered.
exports.requestPasswordReset = async (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim()))
    return res.status(400).json({ message: 'A valid email address is required.' });

  const e  = String(email).trim().toLowerCase();
  const ip = req.ip || '';
  const ua = req.headers['user-agent'] || '';

  const SAFE_MSG = 'If an account exists with this email, a verification code has been sent.';

  try {
    // Rate-limit: max 3 requests per 10 minutes per email
    const [recent] = await db.query(
      `SELECT COUNT(*) AS cnt FROM password_reset_codes
       WHERE email = ? AND created_at > NOW() - INTERVAL '10 minutes'`,
      [e]
    );
    if (parseInt(recent[0].cnt, 10) >= 3)
      return res.status(429).json({ message: 'Too many requests. Please wait 10 minutes before trying again.' });

    // Locate the user across all role tables to get their first name
    let firstName = null;
    let foundRole = null;

    const [sa] = await db.query('SELECT first_name FROM super_admins WHERE email = ?', [e]);
    if (sa.length) { firstName = sa[0].first_name; foundRole = 'super_admin'; }

    if (!foundRole) {
      const [ad] = await db.query('SELECT first_name FROM admins WHERE email = ?', [e]);
      if (ad.length) { firstName = ad[0].first_name; foundRole = 'admin'; }
    }
    if (!foundRole) {
      const [te] = await db.query('SELECT first_name FROM teachers WHERE email = ?', [e]);
      if (te.length) { firstName = te[0].first_name; foundRole = 'teacher'; }
    }
    if (!foundRole) {
      const [st] = await db.query(
        `SELECT s.first_name FROM student_accounts sa
         JOIN students s ON s.id = sa.student_id
         WHERE sa.email = ?`,
        [e]
      );
      if (st.length) { firstName = st[0].first_name; foundRole = 'student'; }
    }

    // Email not found — return same success message for security
    if (!foundRole) return res.json({ message: SAFE_MSG });

    // Generate 6-digit OTP and hash it
    const code      = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash  = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await db.query(
      `INSERT INTO password_reset_codes
         (email, role, code_hash, expires_at, requested_ip, requested_user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [e, foundRole, codeHash, expiresAt.toISOString(), ip, ua]
    );

    // Send the email — log failure but don't reject the request
    try {
      const { sendPasswordResetCodeEmail } = require('../services/emailService');
      await sendPasswordResetCodeEmail({ to: e, firstName, code, expiresMinutes: 10 });
    } catch (emailErr) {
      console.error('[ForgotPassword] Email send failed:', emailErr.message);
    }

    return res.json({ message: SAFE_MSG });
  } catch (err) {
    console.error('requestPasswordReset error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ── POST /api/auth/forgot-password/verify ───────────────────
// Validates the 6-digit OTP. On success marks the record as verified and
// returns a short-lived reset_token JWT (15 min) for the reset step.
exports.verifyPasswordResetCode = async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code)
    return res.status(400).json({ message: 'Email and code are required.' });

  const e           = String(email).trim().toLowerCase();
  const cleanedCode = String(code).trim();

  try {
    // Find most recent unexpired, unused record
    const [rows] = await db.query(
      `SELECT * FROM password_reset_codes
       WHERE email = ? AND is_used = false AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [e]
    );

    if (!rows.length)
      return res.status(400).json({ message: 'Invalid or expired verification code.' });

    const record = rows[0];

    if (record.attempts >= record.max_attempts)
      return res.status(400).json({ message: 'Too many failed attempts. Please request a new code.' });

    // Increment attempts before checking — prevents timing-based enumeration
    await db.query(
      'UPDATE password_reset_codes SET attempts = attempts + 1 WHERE id = ?',
      [record.id]
    );

    const valid = await bcrypt.compare(cleanedCode, record.code_hash);
    if (!valid) {
      const remaining = record.max_attempts - record.attempts - 1;
      return res.status(400).json({
        message: remaining > 0
          ? `Invalid code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`
          : 'Too many failed attempts. Please request a new code.',
      });
    }

    // Mark the record as verified
    await db.query(
      'UPDATE password_reset_codes SET verified_at = NOW() WHERE id = ?',
      [record.id]
    );

    // Issue a 15-minute reset token
    const reset_token = jwt.sign(
      { reset_id: record.id, email: e, role: record.role },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    return res.json({ reset_token });
  } catch (err) {
    console.error('verifyPasswordResetCode error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ── POST /api/auth/forgot-password/reset ────────────────────
// Accepts a reset_token (from /verify) and a new password.
// Updates the correct role table and marks the OTP record as used.
exports.resetPassword = async (req, res) => {
  const { reset_token, new_password } = req.body;
  if (!reset_token || !new_password)
    return res.status(400).json({ message: 'reset_token and new_password are required.' });
  if (String(new_password).length < 6)
    return res.status(400).json({ message: 'Password must be at least 6 characters.' });

  let payload;
  try {
    payload = jwt.verify(reset_token, process.env.JWT_SECRET);
  } catch {
    return res.status(400).json({ message: 'Reset link has expired. Please request a new code.' });
  }

  const { reset_id, email, role } = payload;

  try {
    // The record must be verified but not yet used
    const [rows] = await db.query(
      `SELECT id FROM password_reset_codes
       WHERE id = ? AND is_used = false AND verified_at IS NOT NULL`,
      [reset_id]
    );
    if (!rows.length)
      return res.status(400).json({ message: 'This reset link has already been used. Please request a new code.' });

    const hashed = await bcrypt.hash(String(new_password), 12);

    if (role === 'super_admin') {
      await db.query('UPDATE super_admins SET password = ? WHERE email = ?', [hashed, email]);
    } else if (role === 'admin') {
      await db.query('UPDATE admins SET password = ? WHERE email = ?', [hashed, email]);
    } else if (role === 'teacher') {
      await db.query('UPDATE teachers SET password = ? WHERE email = ?', [hashed, email]);
    } else if (role === 'student') {
      await db.query('UPDATE student_accounts SET password = ? WHERE email = ?', [hashed, email]);
    } else {
      return res.status(400).json({ message: 'Invalid role in token.' });
    }

    // Mark the OTP record as consumed
    await db.query(
      'UPDATE password_reset_codes SET is_used = true, used_at = NOW() WHERE id = ?',
      [reset_id]
    );

    return res.json({ message: 'Password updated successfully. You can now sign in with your new password.' });
  } catch (err) {
    console.error('resetPassword error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ── PUT /api/auth/change-password ────────────────────────────
// Allows a logged-in user to change their password by supplying the
// correct current password. Works for all 4 roles.
exports.changePassword = async (req, res) => {
  const { old_password, new_password } = req.body;
  if (!old_password || !new_password)
    return res.status(400).json({ message: 'old_password and new_password are required.' });
  if (String(new_password).length < 6)
    return res.status(400).json({ message: 'New password must be at least 6 characters.' });

  const u = req.user;

  try {
    let currentHash = null;
    let table = null;

    if (u.role === 'super_admin') {
      const [rows] = await db.query('SELECT password FROM super_admins WHERE id = ?', [u.id]);
      if (!rows.length) return res.status(404).json({ message: 'User not found.' });
      currentHash = rows[0].password; table = 'super_admins';
    } else if (u.role === 'admin') {
      const [rows] = await db.query('SELECT password FROM admins WHERE id = ?', [u.id]);
      if (!rows.length) return res.status(404).json({ message: 'User not found.' });
      currentHash = rows[0].password; table = 'admins';
    } else if (u.role === 'teacher') {
      const [rows] = await db.query('SELECT password FROM teachers WHERE id = ?', [u.id]);
      if (!rows.length) return res.status(404).json({ message: 'User not found.' });
      currentHash = rows[0].password; table = 'teachers';
    } else if (u.role === 'student') {
      const [rows] = await db.query('SELECT password FROM student_accounts WHERE id = ?', [u.id]);
      if (!rows.length) return res.status(404).json({ message: 'User not found.' });
      currentHash = rows[0].password; table = 'student_accounts';
    } else {
      return res.status(400).json({ message: 'Unknown role.' });
    }

    const valid = await bcrypt.compare(String(old_password), currentHash);
    if (!valid)
      return res.status(401).json({ message: 'Current password is incorrect.' });

    const hashed = await bcrypt.hash(String(new_password), 12);
    await db.query(`UPDATE ${table} SET password = ? WHERE id = ?`, [hashed, u.id]);

    return res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    console.error('changePassword error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};
