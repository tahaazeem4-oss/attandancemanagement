const bcrypt = require('bcryptjs');
const db     = require('../config/db');

// ── GET /api/super-admin/schools ─────────────────────────────
exports.listSchools = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT s.*, 
        (SELECT COUNT(*) FROM admins   a WHERE a.school_id = s.id) AS admin_count,
        (SELECT COUNT(*) FROM teachers t WHERE t.school_id = s.id) AS teacher_count,
        (SELECT COUNT(*) FROM students st WHERE st.school_id = s.id) AS student_count
       FROM schools s ORDER BY s.name`
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};

// ── POST /api/super-admin/schools ────────────────────────────
exports.addSchool = async (req, res) => {
  const { name, tagline, initials, logo_url, primary_color, accent_color } = req.body;
  if (!name || !name.trim())
    return res.status(400).json({ message: 'School name is required' });
  try {
    const [r] = await db.query(
      'INSERT INTO schools (name, tagline, initials, logo_url, primary_color, accent_color) VALUES (?,?,?,?,?,?)',
      [name.trim(), tagline || 'Attendance Management System', initials || name.trim().slice(0,2).toUpperCase(), logo_url || null, primary_color || '#2563EB', accent_color || '#1D4ED8']
    );
    res.status(201).json({ message: 'School added', id: r.insertId });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};

// ── PUT /api/super-admin/schools/:id ─────────────────────────
exports.updateSchool = async (req, res) => {
  const { name, tagline, initials, logo_url, primary_color, accent_color } = req.body;
  if (!name || !name.trim())
    return res.status(400).json({ message: 'School name is required' });
  try {
    await db.query(
      'UPDATE schools SET name=?, tagline=?, initials=?, logo_url=?, primary_color=?, accent_color=? WHERE id=?',
      [name.trim(), tagline || null, initials || null, logo_url || null, primary_color || '#2563EB', accent_color || '#1D4ED8', req.params.id]
    );
    res.json({ message: 'School updated' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};

// ── DELETE /api/super-admin/schools/:id ──────────────────────
exports.deleteSchool = async (req, res) => {
  try {
    await db.query('DELETE FROM schools WHERE id=?', [req.params.id]);
    res.json({ message: 'School deleted' });
  } catch (err) {
    if (err.code === 'ER_ROW_IS_REFERENCED_2')
      return res.status(409).json({ message: 'Cannot delete school with existing teachers, students, or admins' });
    console.error(err); res.status(500).json({ message: 'Server error' });
  }
};

// ── GET /api/super-admin/schools/:id/admins ──────────────────
exports.listSchoolAdmins = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, first_name, last_name, email, created_at FROM admins WHERE school_id=? ORDER BY last_name, first_name',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};

// ── POST /api/super-admin/schools/:id/admins ─────────────────
exports.addSchoolAdmin = async (req, res) => {
  const { first_name, last_name, email, password } = req.body;
  if (!first_name || !last_name || !email || !password)
    return res.status(400).json({ message: 'first_name, last_name, email and password are required' });
  if (password.length < 6)
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  try {
    const [ex] = await db.query('SELECT id FROM admins WHERE email=?', [email.trim().toLowerCase()]);
    if (ex.length > 0) return res.status(409).json({ message: 'Email already in use' });
    const hashed = await bcrypt.hash(password, 12);
    const [r] = await db.query(
      'INSERT INTO admins (school_id, first_name, last_name, email, password) VALUES (?,?,?,?,?)',
      [req.params.id, first_name, last_name, email.trim().toLowerCase(), hashed]
    );
    res.status(201).json({ message: 'School admin added', id: r.insertId });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};

// ── PUT /api/super-admin/schools/:schoolId/admins/:adminId ────
exports.updateSchoolAdmin = async (req, res) => {
  const { first_name, last_name, email } = req.body;
  if (!first_name || !last_name || !email)
    return res.status(400).json({ message: 'first_name, last_name and email are required' });
  try {
    // Check email not taken by another admin
    const [ex] = await db.query(
      'SELECT id FROM admins WHERE email=? AND id != ?',
      [email.trim().toLowerCase(), req.params.adminId]
    );
    if (ex.length > 0) return res.status(409).json({ message: 'Email already in use' });
    await db.query(
      'UPDATE admins SET first_name=?, last_name=?, email=? WHERE id=? AND school_id=?',
      [first_name, last_name, email.trim().toLowerCase(), req.params.adminId, req.params.schoolId]
    );
    res.json({ message: 'Admin updated' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};

// ── DELETE /api/super-admin/schools/:schoolId/admins/:adminId ─
exports.removeSchoolAdmin = async (req, res) => {
  try {
    await db.query('DELETE FROM admins WHERE id=? AND school_id=?', [req.params.adminId, req.params.schoolId]);
    res.json({ message: 'Admin removed' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};

// ── POST /api/super-admin/schools/:schoolId/admins/:adminId/reset-password
exports.resetAdminPassword = async (req, res) => {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 6)
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  try {
    const hashed = await bcrypt.hash(new_password, 12);
    await db.query('UPDATE admins SET password=? WHERE id=? AND school_id=?',
      [hashed, req.params.adminId, req.params.schoolId]);
    res.json({ message: 'Password reset successfully' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};

// ── GET /api/super-admin/schools/:id/stats ───────────────────
exports.getSchoolStats = async (req, res) => {
  const sid = req.params.id;
  try {
    const [[{ teachers }]] = await db.query('SELECT COUNT(*) AS teachers FROM teachers WHERE school_id=?', [sid]);
    const [[{ students }]] = await db.query('SELECT COUNT(*) AS students FROM students WHERE school_id=?', [sid]);
    const [[{ classes  }]] = await db.query('SELECT COUNT(*) AS classes  FROM classes  WHERE school_id=?', [sid]);
    const [[{ admins   }]] = await db.query('SELECT COUNT(*) AS admins   FROM admins   WHERE school_id=?', [sid]);
    res.json({ teachers, students, classes, admins });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};

// ── GET /api/super-admin/stats ───────────────────────────────
exports.getPlatformStats = async (req, res) => {
  try {
    const [[{ schools  }]] = await db.query('SELECT COUNT(*) AS schools  FROM schools');
    const [[{ teachers }]] = await db.query('SELECT COUNT(*) AS teachers FROM teachers');
    const [[{ students }]] = await db.query('SELECT COUNT(*) AS students FROM students');
    const [[{ admins   }]] = await db.query('SELECT COUNT(*) AS admins   FROM admins');
    res.json({ schools, teachers, students, admins });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};
