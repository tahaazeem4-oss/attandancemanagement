const bcrypt = require('bcryptjs');
const db     = require('../config/db');

// ── Stats overview ────────────────────────────────────────────
exports.getStats = async (req, res) => {
  const sid = req.user.school_id;
  try {
    const [[{ teachers }]] = await db.query('SELECT COUNT(*) AS teachers FROM teachers WHERE school_id=?', [sid]);
    const [[{ students }]] = await db.query('SELECT COUNT(*) AS students FROM students WHERE school_id=?', [sid]);
    const [[{ classes  }]] = await db.query('SELECT COUNT(*) AS classes  FROM classes  WHERE school_id=?', [sid]);
    const [[{ pending  }]] = await db.query(`SELECT COUNT(*) AS pending FROM leave_applications la JOIN students s ON s.id=la.student_id WHERE s.school_id=? AND la.status='pending'`, [sid]);
    const [[{ accounts }]] = await db.query('SELECT COUNT(*) AS accounts FROM student_accounts sa JOIN students s ON s.id=sa.student_id WHERE s.school_id=?', [sid]);
    res.json({ teachers, students, classes, pending_leaves: pending, student_accounts: accounts });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};

// ── Teachers CRUD ─────────────────────────────────────────────
exports.listTeachers = async (req, res) => {
  const sid = req.user.school_id;
  try {
    const [teachers] = await db.query(
      'SELECT id, first_name, last_name, email, phone, created_at FROM teachers WHERE school_id=? ORDER BY last_name, first_name',
      [sid]
    );
    if (teachers.length === 0) return res.json([]);
    const ids = teachers.map(t => t.id);
    const [assignments] = await db.query(
      `SELECT tc.teacher_id, tc.class_id, tc.section_id, c.class_name, s.section_name
       FROM teacher_classes tc
       JOIN classes  c ON c.id = tc.class_id
       JOIN sections s ON s.id = tc.section_id
       WHERE tc.teacher_id = ANY(?)`,
      [ids]
    );
    const rows = teachers.map(t => {
      const ta = assignments.filter(a => a.teacher_id === t.id);
      const teacher_role = ta.length === 0 ? 'subject_teacher' : ta.length === 1 ? 'class_teacher' : 'floor_incharge';
      return { ...t, assignments: ta, teacher_role };
    });
    res.json(rows);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

exports.addTeacher = async (req, res) => {
  const { first_name, last_name, email, password, phone, assignments } = req.body;
  const sid = req.user.school_id;
  if (!first_name || !last_name || !email || !password)
    return res.status(400).json({ message: 'first_name, last_name, email, password required' });
  try {
    const [ex] = await db.query('SELECT id FROM teachers WHERE email = ?', [email]);
    if (ex.length > 0) return res.status(409).json({ message: 'Email already in use' });
    const hashed = await bcrypt.hash(password, 12);
    const [r] = await db.query(
      'INSERT INTO teachers (school_id, first_name, last_name, email, password, phone) VALUES (?,?,?,?,?,?) RETURNING id',
      [sid, first_name, last_name, email, hashed, phone || null]
    );
    const newId = r[0].id;
    if (Array.isArray(assignments)) {
      for (const { class_id, section_id } of assignments) {
        if (class_id && section_id)
          await db.query('INSERT INTO teacher_classes (teacher_id, class_id, section_id) VALUES (?,?,?) ON CONFLICT DO NOTHING', [newId, class_id, section_id]);
      }
    }
    res.status(201).json({ message: 'Teacher added', id: newId });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

exports.updateTeacher = async (req, res) => {
  const { first_name, last_name, email, phone, assignments } = req.body;
  try {
    const [ex] = await db.query('SELECT id FROM teachers WHERE email = ? AND id != ?', [email, req.params.id]);
    if (ex.length > 0) return res.status(409).json({ message: 'Email already in use' });
    await db.query(
      'UPDATE teachers SET first_name=?, last_name=?, email=?, phone=? WHERE id=?',
      [first_name, last_name, email, phone || null, req.params.id]
    );
    if (Array.isArray(assignments)) {
      await db.query('DELETE FROM teacher_classes WHERE teacher_id = ?', [req.params.id]);
      for (const { class_id, section_id } of assignments) {
        if (class_id && section_id)
          await db.query('INSERT INTO teacher_classes (teacher_id, class_id, section_id) VALUES (?,?,?) ON CONFLICT DO NOTHING', [req.params.id, class_id, section_id]);
      }
    }
    res.json({ message: 'Teacher updated' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

exports.deleteTeacher = async (req, res) => {
  const sid = req.user.school_id;
  try {
    await db.query('DELETE FROM teachers WHERE id = ? AND school_id = ?', [req.params.id, sid]);
    res.json({ message: 'Teacher deleted' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

exports.resetTeacherPassword = async (req, res) => {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 6)
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  try {
    const hashed = await bcrypt.hash(new_password, 12);
    await db.query('UPDATE teachers SET password = ? WHERE id = ?', [hashed, req.params.id]);
    res.json({ message: 'Password reset successfully' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

// ── Students CRUD ─────────────────────────────────────────────
exports.listStudents = async (req, res) => {
  const { class_id, section_id } = req.query;
  const sid = req.user.school_id;
  let q = `SELECT s.*, c.class_name, sec.section_name,
                  (SELECT COUNT(*) FROM student_accounts sa WHERE sa.student_id = s.id) AS has_account
           FROM students s
           JOIN classes  c   ON c.id   = s.class_id
           JOIN sections sec ON sec.id = s.section_id
           WHERE s.school_id = ?`;
  const params = [sid];
  if (class_id && section_id) { q += ' AND s.class_id=? AND s.section_id=?'; params.push(class_id, section_id); }
  else if (class_id)          { q += ' AND s.class_id=?'; params.push(class_id); }
  q += ' ORDER BY s.last_name, s.first_name';
  try {
    const [rows] = await db.query(q, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

exports.addStudent = async (req, res) => {
  const { first_name, last_name, age, class_id, section_id, roll_no } = req.body;
  const sid = req.user.school_id;
  if (!first_name || !last_name || !age || !class_id || !section_id)
    return res.status(400).json({ message: 'All fields required' });
  try {
    const [r] = await db.query(
      'INSERT INTO students (school_id, first_name, last_name, age, class_id, section_id, roll_no) VALUES (?,?,?,?,?,?,?) RETURNING id',
      [sid, first_name, last_name, age, class_id, section_id, roll_no || null]
    );
    res.status(201).json({ message: 'Student added', id: r[0].id });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

exports.updateStudent = async (req, res) => {
  const { first_name, last_name, age, class_id, section_id, roll_no } = req.body;
  try {
    await db.query(
      'UPDATE students SET first_name=?,last_name=?,age=?,class_id=?,section_id=?,roll_no=? WHERE id=?',
      [first_name, last_name, age, class_id, section_id, roll_no || null, req.params.id]
    );
    res.json({ message: 'Student updated' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

exports.deleteStudent = async (req, res) => {
  const sid = req.user.school_id;
  try {
    await db.query('DELETE FROM students WHERE id = ? AND school_id = ?', [req.params.id, sid]);
    res.json({ message: 'Student deleted' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

exports.resetStudentPassword = async (req, res) => {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 6)
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  try {
    const hashed = await bcrypt.hash(new_password, 12);
    const [r, meta] = await db.query(
      'UPDATE student_accounts SET password = ? WHERE student_id = ?',
      [hashed, req.params.id]
    );
    if (meta.rowCount === 0)
      return res.status(404).json({ message: 'No portal account found for this student' });
    res.json({ message: 'Password reset successfully' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

// ── Classes & Sections CRUD ───────────────────────────────────
exports.listClasses = async (req, res) => {
  const sid = req.user.school_id;
  try {
    const [classes]  = await db.query('SELECT * FROM classes WHERE school_id=? ORDER BY id', [sid]);
    const classIds   = classes.map(c => c.id);
    if (classIds.length === 0) return res.json([]);
    const [sections] = await db.query('SELECT * FROM sections WHERE class_id = ANY(?) ORDER BY class_id, section_name', [classIds]);
    res.json(classes.map(c => ({ ...c, sections: sections.filter(s => s.class_id === c.id) })));
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

exports.addClass = async (req, res) => {
  const { class_name } = req.body;
  const sid = req.user.school_id;
  if (!class_name) return res.status(400).json({ message: 'class_name required' });
  try {
    const [r] = await db.query('INSERT INTO classes (school_id, class_name) VALUES (?,?) RETURNING id', [sid, class_name]);
    res.status(201).json({ message: 'Class added', id: r[0].id });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

exports.updateClass = async (req, res) => {
  const { class_name } = req.body;
  try {
    await db.query('UPDATE classes SET class_name=? WHERE id=?', [class_name, req.params.id]);
    res.json({ message: 'Class updated' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

exports.deleteClass = async (req, res) => {
  try {
    await db.query('DELETE FROM classes WHERE id=?', [req.params.id]);
    res.json({ message: 'Class deleted' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

exports.addSection = async (req, res) => {
  const { section_name } = req.body;
  const { classId } = req.params;
  if (!section_name) return res.status(400).json({ message: 'section_name required' });
  try {
    const [r] = await db.query(
      'INSERT INTO sections (class_id, section_name) VALUES (?,?) RETURNING id',
      [classId, section_name]
    );
    res.status(201).json({ message: 'Section added', id: r[0].id });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

exports.deleteSection = async (req, res) => {
  try {
    await db.query('DELETE FROM sections WHERE id=?', [req.params.id]);
    res.json({ message: 'Section deleted' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

// ── Teacher-Class Assignments ─────────────────────────────────
exports.listAssignments = async (req, res) => {
  const sid = req.user.school_id;
  try {
    const [rows] = await db.query(
      `SELECT tc.id, tc.teacher_id, tc.class_id, tc.section_id,
              CONCAT(t.first_name,' ',t.last_name) AS teacher_name,
              c.class_name, s.section_name
       FROM   teacher_classes tc
       JOIN   teachers  t ON t.id = tc.teacher_id
       JOIN   classes   c ON c.id = tc.class_id
       JOIN   sections  s ON s.id = tc.section_id
       WHERE  t.school_id = ?
       ORDER  BY t.last_name, c.id`,
      [sid]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

exports.addAssignment = async (req, res) => {
  const { teacher_id, class_id, section_id } = req.body;
  if (!teacher_id || !class_id || !section_id)
    return res.status(400).json({ message: 'teacher_id, class_id, section_id required' });
  try {
    const [r] = await db.query(
      'INSERT INTO teacher_classes (teacher_id, class_id, section_id) VALUES (?,?,?) RETURNING id',
      [teacher_id, class_id, section_id]
    );
    res.status(201).json({ message: 'Assignment added', id: r[0].id });
  } catch (err) {
    if (err.code === '23505')
      return res.status(409).json({ message: 'Assignment already exists' });
    res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteAssignment = async (req, res) => {
  try {
    await db.query('DELETE FROM teacher_classes WHERE id=?', [req.params.id]);
    res.json({ message: 'Assignment removed' });
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

// ── Leave Applications ────────────────────────────────────────
exports.listLeaves = async (req, res) => {
  const { status } = req.query;
  const sid = req.user.school_id;
  let q = `SELECT la.id, la.group_id, la.date, la.reason, la.status, la.applied_at,
                  s.id AS student_id, s.first_name, s.last_name, s.roll_no,
                  c.class_name, sec.section_name
           FROM   leave_applications la
           JOIN   students  s   ON s.id   = la.student_id
           JOIN   classes   c   ON c.id   = s.class_id
           JOIN   sections  sec ON sec.id = s.section_id
           WHERE  s.school_id = ?`;
  const params = [sid];
  if (status && status !== 'all') { q += ' AND la.status = ?'; params.push(status); }
  q += ' ORDER BY la.applied_at DESC, la.date';
  try {
    const [rows] = await db.query(q, params);

    // Group by group_id so multi-date requests appear as one card
    const groupMap = {};
    const STATUS_PRIORITY = { pending: 4, approved: 3, rejected: 2, cancelled: 1 };
    for (const row of rows) {
      const gid = row.group_id;
      if (!groupMap[gid]) {
        groupMap[gid] = {
          group_id: gid,
          student_id: row.student_id,
          first_name: row.first_name,
          last_name: row.last_name,
          roll_no: row.roll_no,
          class_name: row.class_name,
          section_name: row.section_name,
          reason: row.reason,
          status: row.status,
          applied_at: row.applied_at,
          dates: [],
          ids: [],
        };
      }
      groupMap[gid].dates.push(row.date);
      groupMap[gid].ids.push(row.id);
      if ((STATUS_PRIORITY[row.status] || 0) > (STATUS_PRIORITY[groupMap[gid].status] || 0)) {
        groupMap[gid].status = row.status;
      }
    }
    res.json(Object.values(groupMap));
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
};

// ── PUT /admin/leaves/group/:group_id/status  (approve / reject whole group) ─
exports.updateLeaveGroupStatus = async (req, res) => {
  const { status } = req.body;
  const { group_id } = req.params;
  if (!['approved', 'rejected'].includes(status))
    return res.status(400).json({ message: 'status must be approved or rejected' });
  try {
    // Find all pending leaves in this group
    const [leaves] = await db.query(
      `SELECT la.id, la.student_id, la.date
       FROM leave_applications la
       WHERE la.group_id = ? AND la.status = 'pending'`,
      [group_id]
    );
    if (leaves.length === 0)
      return res.status(404).json({ message: 'No pending leaves found for this group' });

    // Update all to new status
    await db.query(
      `UPDATE leave_applications SET status=? WHERE group_id=? AND status='pending'`,
      [status, group_id]
    );

    // Auto-mark attendance as 'leave' when approved
    if (status === 'approved') {
      for (const leave of leaves) {
        await db.query(
          `INSERT INTO student_attendance (student_id, teacher_id, date, status)
           VALUES (?,NULL,?,'leave')
           ON CONFLICT (student_id, date) DO UPDATE SET status = 'leave'`,
          [leave.student_id, leave.date]
        );
      }
    }
    res.json({ message: `Leave ${status}`, count: leaves.length });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};

exports.updateLeaveStatus = async (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status))
    return res.status(400).json({ message: 'status must be approved or rejected' });
  try {
    // Find the leave and its group to apply group-wide update
    const [found] = await db.query(
      'SELECT group_id, student_id, date FROM leave_applications WHERE id=?',
      [req.params.id]
    );
    if (!found.length) return res.status(404).json({ message: 'Leave not found' });

    const group_id = found[0].group_id;
    const [leaves] = await db.query(
      `SELECT id, student_id, date FROM leave_applications WHERE group_id=? AND status='pending'`,
      [group_id]
    );
    await db.query(
      `UPDATE leave_applications SET status=? WHERE group_id=? AND status='pending'`,
      [status, group_id]
    );
    if (status === 'approved') {
      for (const leave of leaves) {
        await db.query(
          `INSERT INTO student_attendance (student_id, teacher_id, date, status)
           VALUES (?,NULL,?,'leave')
           ON CONFLICT (student_id, date) DO UPDATE SET status = 'leave'`,
          [leave.student_id, leave.date]
        );
      }
    }
    res.json({ message: 'Leave status updated' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};
