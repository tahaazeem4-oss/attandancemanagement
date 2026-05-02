const path = require('path');
const fs   = require('fs');
const db   = require('../config/db');
const push = require('../services/pushService');

// Absolute path to the directory where lecture PDFs are stored on disk.
// Created automatically on first run.
const LECTURES_DIR = path.join(__dirname, '..', 'uploads', 'lectures');

// Ensure the lectures upload directory exists
if (!fs.existsSync(LECTURES_DIR)) fs.mkdirSync(LECTURES_DIR, { recursive: true });

// ── POST /api/lectures ────────────────────────────────────────
// Teacher or Admin uploads a lecture PDF.
// Validates: file present, required fields, type enum, class belongs to
// uploader's school, section belongs to the chosen class (if provided).
// section_id='' / '0' / undefined is stored as NULL meaning "All Sections".
// teacher_id stores the uploader's user ID for BOTH teachers and admins
// so ownership checks (delete permission) work uniformly.
exports.uploadLecture = async (req, res) => {
  try {
    const { id: uploader_id, role, school_id, first_name, last_name } = req.user;

    if (!req.file) return res.status(400).json({ message: 'PDF file is required' });

    const { lecture_name, subject_name, type, date, class_id, section_id } = req.body;

    if (!lecture_name || !subject_name || !type || !date || !class_id) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'lecture_name, subject_name, type, date, and class_id are all required' });
    }

    // Validate type
    if (!['classwork', 'homework'].includes(type)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'type must be classwork or homework' });
    }

    // Validate class belongs to this school
    const [cls] = await db.query(
      'SELECT id FROM classes WHERE id = $1 AND school_id = $2',
      [class_id, school_id]
    );
    if (!cls.length) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'Invalid class for this school' });
    }

    // section_id = '' / '0' / undefined → NULL (all sections)
    const secId = section_id && section_id !== '0' && section_id !== ''
      ? Number(section_id)
      : null;

    // Validate section belongs to class (if provided)
    if (secId) {
      const [sec] = await db.query(
        'SELECT id FROM sections WHERE id = $1 AND class_id = $2',
        [secId, class_id]
      );
      if (!sec.length) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ message: 'Invalid section for this class' });
      }
    }

    const teacher_id    = uploader_id; // stores uploader's ID for both teachers and admins
    const uploaded_by   = `${first_name} ${last_name}`;
    const file_path     = req.file.filename; // just the filename, stored in uploads/lectures/

    const [rows] = await db.query(
      `INSERT INTO lectures
         (school_id, teacher_id, class_id, section_id, subject_name, lecture_name, type, date, file_path, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [school_id, teacher_id, class_id, secId, subject_name, lecture_name, type, date, file_path, uploaded_by]
    );

    res.status(201).json(rows[0]);

    // Notify relevant students (non-blocking)
    push.tokensForClassStudents(school_id, class_id, secId || null).then(tokens =>
      push.send(
        tokens,
        `New ${type === 'homework' ? 'Homework' : 'Lecture'} Uploaded`,
        `${subject_name}: ${lecture_name} has been uploaded by ${first_name} ${last_name}.`,
        { type: 'lecture', lecture_id: rows[0].id, lecture_type: type }
      )
    );
  } catch (err) {
    console.error('[uploadLecture]', err);
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── GET /api/lectures ─────────────────────────────────────────
// Returns lectures based on the caller's role:
//   Teacher / Admin → all lectures for their school.
//   Student → only lectures for their class_id where section_id matches
//              theirs OR is NULL ("All Sections" lectures).
//
// Optional query params (all roles): class_id, section_id, date, month
// (YYYY-MM), year, type, subject, search.
// NOTE: the React Native frontend fetches ALL lectures once and does
// client-side filtering, so params are mostly used by direct API clients.
exports.getLectures = async (req, res) => {
  try {
    const { role, school_id, class_id: studentClass, section_id: studentSection } = req.user;
    const { class_id, section_id, date, month, year, subject, search, type } = req.query;
    // `month` param format: 'YYYY-MM'  (preferred over exact `date`)

    if (role === 'student') {
      let q = `
        SELECT l.*, c.class_name, sec.section_name
        FROM   lectures l
        JOIN   classes  c   ON c.id = l.class_id
        LEFT JOIN sections sec ON sec.id = l.section_id
        WHERE  l.class_id = $1
          AND  (l.section_id = $2 OR l.section_id IS NULL)
      `;
      const params = [studentClass, studentSection];
      let idx = 3;

      if (month)  { q += ` AND TO_CHAR(l.date, 'YYYY-MM') = $${idx++}`; params.push(month); }
      else if (year) { q += ` AND EXTRACT(YEAR FROM l.date) = $${idx++}`; params.push(year); }
      else if (date) { q += ` AND l.date = $${idx++}`; params.push(date); }
      if (type)   { q += ` AND l.type = $${idx++}`; params.push(type); }
      if (subject) { q += ` AND LOWER(l.subject_name) = LOWER($${idx++})`; params.push(subject); }
      if (search) {
        q += ` AND (LOWER(l.lecture_name) LIKE $${idx} OR LOWER(l.subject_name) LIKE $${idx})`;
        params.push(`%${search.toLowerCase()}%`);
        idx++;
      }
      q += ' ORDER BY l.date DESC, l.created_at DESC';

      const [rows] = await db.query(q, params);
      return res.json(rows);
    }

    // Teacher / Admin
    let q = `
      SELECT l.*, c.class_name, sec.section_name
      FROM   lectures l
      JOIN   classes  c   ON c.id = l.class_id
      LEFT JOIN sections sec ON sec.id = l.section_id
      WHERE  l.school_id = $1
    `;
    const params = [school_id];
    let idx = 2;

    if (class_id)   { q += ` AND l.class_id = $${idx++}`;   params.push(class_id); }
    if (section_id) { q += ` AND l.section_id = $${idx++}`; params.push(section_id); }
    if (month)      { q += ` AND TO_CHAR(l.date, 'YYYY-MM') = $${idx++}`; params.push(month); }
    else if (year)  { q += ` AND EXTRACT(YEAR FROM l.date) = $${idx++}`; params.push(year); }
    else if (date)  { q += ` AND l.date = $${idx++}`;        params.push(date); }
    if (type)       { q += ` AND l.type = $${idx++}`;        params.push(type); }
    if (subject)    { q += ` AND LOWER(l.subject_name) = LOWER($${idx++})`; params.push(subject); }
    if (search) {
      // $idx is referenced twice (lecture_name + subject_name) — valid in Postgres.
      q += ` AND (LOWER(l.lecture_name) LIKE $${idx} OR LOWER(l.subject_name) LIKE $${idx})`;
      params.push(`%${search.toLowerCase()}%`);
      idx++;
    }
    q += ' ORDER BY l.date DESC, l.created_at DESC';

    const [rows] = await db.query(q, params);
    res.json(rows);
  } catch (err) {
    console.error('[getLectures]', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── GET /api/lectures/:id/file ────────────────────────────────
// Streams the lecture PDF file to the client.
// Access control:
//   Student  → must belong to the lecture's class AND section
//              (NULL section_id = all sections, so students always pass).
//   Teacher / Admin → must belong to the same school as the lecture.
exports.getFile = async (req, res) => {
  try {
    const { role, school_id, class_id: studentClass, section_id: studentSection } = req.user;

    const [rows] = await db.query('SELECT * FROM lectures WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Lecture not found' });

    const lecture = rows[0];

    // Access check
    if (role === 'student') {
      const classMismatch   = lecture.class_id !== studentClass;
      const sectionMismatch = lecture.section_id !== null && lecture.section_id !== studentSection;
      if (classMismatch || sectionMismatch) {
        return res.status(403).json({ message: 'Access denied' });
      }
    } else {
      // Teacher / Admin — must belong to same school
      if (lecture.school_id !== school_id) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    const filePath = path.join(LECTURES_DIR, lecture.file_path);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'File not found on server' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(lecture.lecture_name)}.pdf"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('[getFile]', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── DELETE /api/lectures/:id ──────────────────────────────────
// Deletes the DB record AND the physical PDF file on disk.
// Authorization rules:
//   1. Lecture must belong to the caller's school.
//   2. Only the uploader (teacher_id === caller's id) can delete.
//   3. Legacy lectures with teacher_id = NULL (before ownership tracking
//      was added) can be deleted by any admin of that school for cleanup.
exports.deleteLecture = async (req, res) => {
  try {
    const { id: userId, school_id } = req.user;  // role is not needed here

    const [rows] = await db.query('SELECT * FROM lectures WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Lecture not found' });

    const lecture = rows[0];

    // Must belong to the same school
    if (lecture.school_id !== school_id) {
      return res.status(403).json({ message: 'Access denied' });
    }
    // Only the uploader can delete — teacher_id stores uploader's ID for all roles.
    // Legacy null records (uploaded before this change) allow any school admin to clean up.
    if (lecture.teacher_id !== null && lecture.teacher_id !== userId) {
      return res.status(403).json({ message: 'You can only delete lectures you uploaded' });
    }

    // Delete the physical file
    const filePath = path.join(LECTURES_DIR, lecture.file_path);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await db.query('DELETE FROM lectures WHERE id = $1', [lecture.id]);
    res.json({ message: 'Lecture deleted' });
  } catch (err) {
    console.error('[deleteLecture]', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── GET /api/lectures/subjects ─────────────────────────────────────────
// Returns a merged, sorted list of subject names for this school.
// Source 1: school_subjects table (admin-managed master list).
// Source 2: subject_name from past lectures (catches legacy data).
// Falls back to source 2 only if school_subjects table doesn't exist yet
// (error code 42P01 = table not found, migration not yet run).
exports.getSubjects = async (req, res) => {
  try {
    const { school_id } = req.user;
    let names = [];
    try {
      const [rows] = await db.query(
        `SELECT name FROM school_subjects WHERE school_id = $1
         UNION
         SELECT DISTINCT subject_name AS name FROM lectures WHERE school_id = $1
         ORDER BY name`,
        [school_id]
      );
      names = rows.map(r => r.name);
    } catch (unionErr) {
      // school_subjects table may not exist yet — fall back to lectures only
      const [rows] = await db.query(
        `SELECT DISTINCT subject_name AS name FROM lectures WHERE school_id = $1 ORDER BY subject_name`,
        [school_id]
      );
      names = rows.map(r => r.name);
    }
    res.json(names);
  } catch (err) {
    console.error('[getSubjects]', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── GET /api/lectures/check-duplicate ────────────────────────
// Checks whether a lecture already exists for the same school + subject
// + date + class + section combination.
// Called by UploadLectureScreen (debounced 400ms) to warn before uploading.
// Returns { exists: bool, lecture: { id, lecture_name } | null }.
exports.checkDuplicate = async (req, res) => {
  try {
    const { school_id } = req.user;
    const { subject_name, date, class_id, section_id } = req.query;
    if (!subject_name || !date || !class_id) return res.json({ exists: false });

    const secId = section_id && section_id !== '' && section_id !== '0'
      ? Number(section_id) : null;

    let q = `SELECT id, lecture_name FROM lectures
             WHERE school_id = $1 AND LOWER(subject_name) = LOWER($2) AND date = $3 AND class_id = $4`;
    const params = [school_id, subject_name, date, class_id];

    if (secId) { q += ` AND section_id = $5`; params.push(secId); }
    else        { q += ` AND section_id IS NULL`; }

    q += ' LIMIT 1';
    const [rows] = await db.query(q, params);
    res.json({ exists: rows.length > 0, lecture: rows[0] || null });
  } catch (err) {
    console.error('[checkDuplicate]', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ── GET /api/lectures/classes ─────────────────────────────────
// Returns all classes with their sections for the uploader's school.
// Used to populate the class/section pickers on:
//   - UploadLectureScreen (upload form)
//   - LectureListScreen (filter form)
// Shape: [{ id, class_name, sections: [{ id, section_name }] }]
exports.getClassesForUpload = async (req, res) => {
  try {
    const { school_id } = req.user;
    const [rows] = await db.query(
      `SELECT c.id AS class_id, c.class_name,
              sec.id AS section_id, sec.section_name
       FROM   classes c
       LEFT JOIN sections sec ON sec.class_id = c.id
       WHERE  c.school_id = $1
       ORDER  BY c.class_name, sec.section_name`,
      [school_id]
    );

    // Group sections under each class
    const map = {};
    for (const row of rows) {
      if (!map[row.class_id]) {
        map[row.class_id] = { id: row.class_id, class_name: row.class_name, sections: [] };
      }
      // LEFT JOIN rows with no section have section_id = null — skip those
      if (row.section_id !== null) {
        map[row.class_id].sections.push({ id: row.section_id, section_name: row.section_name });
      }
    }
    res.json(Object.values(map));
  } catch (err) {
    console.error('[getClassesForUpload]', err);
    res.status(500).json({ message: 'Server error' });
  }
};
