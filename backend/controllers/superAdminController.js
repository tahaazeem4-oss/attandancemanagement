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
      'INSERT INTO schools (name, tagline, initials, logo_url, primary_color, accent_color) VALUES (?,?,?,?,?,?) RETURNING id',
      [name.trim(), tagline || 'Attendance Management System', initials || name.trim().slice(0,2).toUpperCase(), logo_url || null, primary_color || '#2563EB', accent_color || '#1D4ED8']
    );
    res.status(201).json({ message: 'School added', id: r[0].id });
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
    if (err.code === '23503')
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
      'INSERT INTO admins (school_id, first_name, last_name, email, password) VALUES (?,?,?,?,?) RETURNING id',
      [req.params.id, first_name, last_name, email.trim().toLowerCase(), hashed]
    );
    res.status(201).json({ message: 'School admin added', id: r[0].id });
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

// ── GET /api/super-admin/schools/:schoolId/teachers ──────────
exports.listSchoolTeachers = async (req, res) => {
  const { class_id, section_id } = req.query;
  try {
    let rows;
    if (class_id && section_id) {
      [rows] = await db.query(
        `SELECT DISTINCT t.id, t.first_name, t.last_name, t.email, t.phone, t.created_at
         FROM teachers t
         JOIN teacher_classes tc ON tc.teacher_id = t.id
         WHERE t.school_id = ? AND tc.class_id = ? AND tc.section_id = ?
         ORDER BY t.last_name, t.first_name`,
        [req.params.schoolId, class_id, section_id]
      );
    } else if (class_id) {
      [rows] = await db.query(
        `SELECT DISTINCT t.id, t.first_name, t.last_name, t.email, t.phone, t.created_at
         FROM teachers t
         JOIN teacher_classes tc ON tc.teacher_id = t.id
         WHERE t.school_id = ? AND tc.class_id = ?
         ORDER BY t.last_name, t.first_name`,
        [req.params.schoolId, class_id]
      );
    } else {
      [rows] = await db.query(
        `SELECT t.id, t.first_name, t.last_name, t.email, t.phone, t.created_at
         FROM teachers t
         WHERE t.school_id = ?
         ORDER BY t.last_name, t.first_name`,
        [req.params.schoolId]
      );
    }
    if (rows.length === 0) return res.json([]);
    const ids = rows.map(t => t.id);
    const [assignments] = await db.query(
      `SELECT tc.teacher_id, tc.class_id, tc.section_id, c.class_name, s.section_name
       FROM teacher_classes tc
       JOIN classes  c ON c.id = tc.class_id
       JOIN sections s ON s.id = tc.section_id
       WHERE tc.teacher_id = ANY(?)`,
      [ids]
    );
    const result = rows.map(t => {
      const ta = assignments.filter(a => a.teacher_id === t.id);
      const teacher_role = ta.length === 0 ? 'subject_teacher' : ta.length === 1 ? 'class_teacher' : 'floor_incharge';
      return { ...t, assignments: ta, teacher_role };
    });
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};

// ── POST /api/super-admin/schools/:schoolId/teachers ─────────
exports.addSchoolTeacher = async (req, res) => {
  const { first_name, last_name, email, phone, password, assignments } = req.body;
  if (!first_name || !last_name || !email || !password)
    return res.status(400).json({ message: 'first_name, last_name, email and password are required' });
  if (password.length < 6)
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  try {
    const [ex] = await db.query('SELECT id FROM teachers WHERE email=?', [email.trim().toLowerCase()]);
    if (ex.length > 0) return res.status(409).json({ message: 'Email already in use' });
    const hashed = await bcrypt.hash(password, 12);
    const [r] = await db.query(
      'INSERT INTO teachers (school_id, first_name, last_name, email, phone, password) VALUES (?,?,?,?,?,?) RETURNING id',
      [req.params.schoolId, first_name, last_name, email.trim().toLowerCase(), phone || null, hashed]
    );
    const newId = r[0].id;
    if (Array.isArray(assignments)) {
      for (const { class_id, section_id } of assignments) {
        if (class_id && section_id)
          await db.query('INSERT INTO teacher_classes (teacher_id, class_id, section_id) VALUES (?,?,?) ON CONFLICT DO NOTHING', [newId, class_id, section_id]);
      }
    }
    res.status(201).json({ message: 'Teacher added', id: newId });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};

// ── PUT /api/super-admin/schools/:schoolId/teachers/:teacherId
exports.updateSchoolTeacher = async (req, res) => {
  const { first_name, last_name, email, phone, assignments } = req.body;
  if (!first_name || !last_name || !email)
    return res.status(400).json({ message: 'first_name, last_name and email are required' });
  try {
    const [ex] = await db.query(
      'SELECT id FROM teachers WHERE email=? AND id != ?',
      [email.trim().toLowerCase(), req.params.teacherId]
    );
    if (ex.length > 0) return res.status(409).json({ message: 'Email already in use' });
    await db.query(
      'UPDATE teachers SET first_name=?, last_name=?, email=?, phone=? WHERE id=? AND school_id=?',
      [first_name, last_name, email.trim().toLowerCase(), phone || null, req.params.teacherId, req.params.schoolId]
    );
    if (Array.isArray(assignments)) {
      await db.query('DELETE FROM teacher_classes WHERE teacher_id = ?', [req.params.teacherId]);
      for (const { class_id, section_id } of assignments) {
        if (class_id && section_id)
          await db.query('INSERT INTO teacher_classes (teacher_id, class_id, section_id) VALUES (?,?,?) ON CONFLICT DO NOTHING', [req.params.teacherId, class_id, section_id]);
      }
    }
    res.json({ message: 'Teacher updated' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};

// ── DELETE /api/super-admin/schools/:schoolId/teachers/:teacherId
exports.removeSchoolTeacher = async (req, res) => {
  try {
    await db.query('DELETE FROM teachers WHERE id=? AND school_id=?', [req.params.teacherId, req.params.schoolId]);
    res.json({ message: 'Teacher removed' });
  } catch (err) {
    if (err.code === '23503')
      return res.status(409).json({ message: 'Cannot delete teacher with existing attendance records' });
    console.error(err); res.status(500).json({ message: 'Server error' });
  }
};

// ── POST /api/super-admin/schools/:schoolId/teachers/:teacherId/reset-password
exports.resetTeacherPassword = async (req, res) => {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 6)
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  try {
    const hashed = await bcrypt.hash(new_password, 12);
    await db.query('UPDATE teachers SET password=? WHERE id=? AND school_id=?',
      [hashed, req.params.teacherId, req.params.schoolId]);
    res.json({ message: 'Password reset successfully' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};

// ── GET /api/super-admin/schools/:schoolId/classes ───────────
exports.listSchoolClasses = async (req, res) => {
  try {
    const [classes] = await db.query(
      'SELECT id, class_name FROM classes WHERE school_id=? ORDER BY class_name',
      [req.params.schoolId]
    );
    const result = await Promise.all(classes.map(async (cls) => {
      const [sections] = await db.query(
        'SELECT id, section_name FROM sections WHERE class_id=? ORDER BY section_name',
        [cls.id]
      );
      return { ...cls, sections };
    }));
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};

// ── GET /api/super-admin/schools/:schoolId/students ──────────
exports.listSchoolStudents = async (req, res) => {
  const { admin_id, class_id, section_id } = req.query;
  try {
    const conditions = ['s.school_id = ?'];
    const params = [req.params.schoolId];
    if (admin_id)   { conditions.push('s.admin_id = ?');   params.push(admin_id); }
    if (class_id)   { conditions.push('s.class_id = ?');   params.push(class_id); }
    if (section_id) { conditions.push('s.section_id = ?'); params.push(section_id); }
    const where = conditions.join(' AND ');
    const [rows] = await db.query(
      `SELECT s.id, s.first_name, s.last_name, s.age, s.roll_no, s.class_id, s.section_id,
              c.class_name, sec.section_name
       FROM   students s
       JOIN   classes  c   ON c.id   = s.class_id
       JOIN   sections sec ON sec.id = s.section_id
       WHERE  ${where}
       ORDER  BY s.last_name, s.first_name`,
      params
    );
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};

// ── POST /api/super-admin/schools/:schoolId/students ─────────
exports.addSchoolStudent = async (req, res) => {
  const { first_name, last_name, age, class_id, section_id, roll_no } = req.body;
  if (!first_name || !last_name || !age || !class_id || !section_id)
    return res.status(400).json({ message: 'first_name, last_name, age, class_id and section_id are required' });
  try {
    const [r] = await db.query(
      'INSERT INTO students (school_id, first_name, last_name, age, class_id, section_id, roll_no) VALUES (?,?,?,?,?,?,?) RETURNING id',
      [req.params.schoolId, first_name, last_name, parseInt(age), class_id, section_id, roll_no || null]
    );
    res.status(201).json({ message: 'Student added', id: r.insertId });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};

// ── PUT /api/super-admin/schools/:schoolId/students/:studentId
exports.updateSchoolStudent = async (req, res) => {
  const { first_name, last_name, age, class_id, section_id, roll_no } = req.body;
  if (!first_name || !last_name || !age || !class_id || !section_id)
    return res.status(400).json({ message: 'first_name, last_name, age, class_id and section_id are required' });
  try {
    await db.query(
      'UPDATE students SET first_name=?, last_name=?, age=?, class_id=?, section_id=?, roll_no=? WHERE id=? AND school_id=?',
      [first_name, last_name, parseInt(age), class_id, section_id, roll_no || null, req.params.studentId, req.params.schoolId]
    );
    res.json({ message: 'Student updated' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};

// ── DELETE /api/super-admin/schools/:schoolId/students/:studentId
exports.removeSchoolStudent = async (req, res) => {
  try {
    await db.query('DELETE FROM students WHERE id=? AND school_id=?', [req.params.studentId, req.params.schoolId]);
    res.json({ message: 'Student removed' });
  } catch (err) {
    if (err.code === '23503')
      return res.status(409).json({ message: 'Cannot delete student with existing attendance records' });
    console.error(err); res.status(500).json({ message: 'Server error' });
  }
};

// ── POST /api/super-admin/schools/:schoolId/students/:studentId/reset-password
exports.resetStudentPassword = async (req, res) => {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 6)
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  try {
    const hashed = await bcrypt.hash(new_password, 12);
    const [r, meta] = await db.query(
      'UPDATE student_accounts SET password=? WHERE student_id=?',
      [hashed, req.params.studentId]
    );
    if (meta.rowCount === 0)
      return res.status(404).json({ message: 'No portal account found for this student' });
    res.json({ message: 'Password reset successfully' });
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
