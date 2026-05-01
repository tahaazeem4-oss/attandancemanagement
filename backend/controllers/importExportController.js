/**
 * importExportController.js
 * Handles Excel/CSV import and export for:
 *   - Teachers
 *   - Students
 *   - Classes
 *   - Attendance report
 *   - Leave report
 *
 * All import endpoints expect multipart/form-data with field name "file".
 * All export endpoints stream an xlsx file back.
 */

const XLSX   = require('xlsx');
const bcrypt = require('bcryptjs');
const db     = require('../config/db');

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Convert an array-of-objects to an xlsx buffer */
function toXlsx(data, sheetName = 'Sheet1') {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/** Send an xlsx file as a download response */
function sendXlsx(res, buffer, filename) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

/** Parse uploaded xlsx/csv buffer into an array of row objects */
function parseUpload(buffer) {
  const wb   = XLSX.read(buffer, { type: 'buffer' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
}

// ─── TEACHERS ──────────────────────────────────────────────────────────────

/**
 * GET /api/import-export/teachers/template
 * Returns a blank Excel template for bulk teacher import.
 */
exports.teacherTemplate = (req, res) => {
  const sample = [
    { first_name: 'Ali', last_name: 'Khan', email: 'ali@school.com', password: 'Pass@123', phone: '03001234567' },
  ];
  sendXlsx(res, toXlsx(sample, 'Teachers'), 'teachers_template.xlsx');
};

/**
 * GET /api/import-export/teachers/export
 * Exports all teachers for the admin's school.
 */
exports.exportTeachers = async (req, res) => {
  const sid = req.user.school_id;
  try {
    const [rows] = await db.query(
      'SELECT first_name, last_name, email, phone, created_at FROM teachers WHERE school_id=? ORDER BY last_name, first_name',
      [sid]
    );
    sendXlsx(res, toXlsx(rows, 'Teachers'), 'teachers_export.xlsx');
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};

/**
 * POST /api/import-export/teachers/import
 * Bulk-creates teachers from uploaded Excel/CSV.
 * Required columns: first_name, last_name, email, password
 * Optional: phone
 */
exports.importTeachers = async (req, res) => {
  const sid = req.user.school_id;
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  const rows   = parseUpload(req.file.buffer);
  const errors = [];
  let   created = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 2; // 1-indexed + header row

    if (!r.first_name || !r.last_name || !r.email || !r.password) {
      errors.push(`Row ${rowNum}: first_name, last_name, email, password are required`);
      continue;
    }
    const email = String(r.email).trim().toLowerCase();
    const [ex] = await db.query('SELECT id FROM teachers WHERE email=?', [email]);
    if (ex.length > 0) {
      errors.push(`Row ${rowNum}: email "${email}" already exists — skipped`);
      continue;
    }
    const hashed = await bcrypt.hash(String(r.password), 12);
    await db.query(
      'INSERT INTO teachers (school_id, first_name, last_name, email, password, phone) VALUES (?,?,?,?,?,?)',
      [sid, r.first_name, r.last_name, email, hashed, r.phone || null]
    );
    created++;
  }

  res.json({ message: `Import complete. Created: ${created}, Skipped: ${errors.length}`, created, errors });
};

// ─── STUDENTS ──────────────────────────────────────────────────────────────

/**
 * GET /api/import-export/students/template
 */
exports.studentTemplate = async (req, res) => {
  const sid = req.user.school_id;
  const [classes] = await db.query(
    `SELECT c.id AS class_id, c.class_name, s.id AS section_id, s.section_name
     FROM classes c JOIN sections s ON s.class_id = c.id WHERE c.school_id=? ORDER BY c.class_name, s.section_name`,
    [sid]
  );
  const sample = classes.slice(0, 2).map((c, i) => ({
    first_name:   'Student',
    last_name:    `${i + 1}`,
    age:          10,
    roll_no:      `${c.class_name}${c.section_name}-0${i + 1}`,
    class_id:     c.class_id,
    section_id:   c.section_id,
    class_name:   c.class_name,
    section_name: c.section_name,
  }));
  sendXlsx(res, toXlsx(sample.length ? sample : [{ first_name: '', last_name: '', age: '', roll_no: '', class_id: '', section_id: '' }], 'Students'), 'students_template.xlsx');
};

/**
 * GET /api/import-export/students/export
 */
exports.exportStudents = async (req, res) => {
  const sid = req.user.school_id;
  try {
    const [rows] = await db.query(
      `SELECT s.first_name, s.last_name, s.age, s.roll_no,
              c.class_name, sec.section_name, s.class_id, s.section_id
       FROM students s
       JOIN classes c ON c.id=s.class_id
       JOIN sections sec ON sec.id=s.section_id
       WHERE s.school_id=? ORDER BY c.class_name, sec.section_name, s.last_name`,
      [sid]
    );
    sendXlsx(res, toXlsx(rows, 'Students'), 'students_export.xlsx');
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};

/**
 * POST /api/import-export/students/import
 * Required: first_name, last_name, class_id, section_id
 * Optional: age, roll_no
 */
exports.importStudents = async (req, res) => {
  const sid = req.user.school_id;
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  const rows   = parseUpload(req.file.buffer);
  const errors = [];
  let   created = 0;

  for (let i = 0; i < rows.length; i++) {
    const r      = rows[i];
    const rowNum = i + 2;

    if (!r.first_name || !r.last_name || !r.class_id || !r.section_id) {
      errors.push(`Row ${rowNum}: first_name, last_name, class_id, section_id are required`);
      continue;
    }
    // Verify class/section belongs to this school
    const [cls] = await db.query('SELECT id FROM classes WHERE id=? AND school_id=?', [r.class_id, sid]);
    if (cls.length === 0) { errors.push(`Row ${rowNum}: class_id ${r.class_id} not found`); continue; }

    await db.query(
      'INSERT INTO students (school_id, first_name, last_name, age, roll_no, class_id, section_id) VALUES (?,?,?,?,?,?,?)',
      [sid, r.first_name, r.last_name, r.age || null, r.roll_no || null, r.class_id, r.section_id]
    );
    created++;
  }

  res.json({ message: `Import complete. Created: ${created}, Skipped: ${errors.length}`, created, errors });
};

// ─── CLASSES ───────────────────────────────────────────────────────────────

/**
 * GET /api/import-export/classes/export
 */
exports.exportClasses = async (req, res) => {
  const sid = req.user.school_id;
  try {
    const [rows] = await db.query(
      `SELECT c.id AS class_id, c.class_name, s.id AS section_id, s.section_name
       FROM classes c JOIN sections s ON s.class_id=c.id WHERE c.school_id=? ORDER BY c.class_name, s.section_name`,
      [sid]
    );
    sendXlsx(res, toXlsx(rows, 'Classes'), 'classes_export.xlsx');
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};

/**
 * GET /api/import-export/classes/template
 */
exports.classTemplate = (req, res) => {
  const sample = [
    { class_name: 'Grade 1', section_name: 'A' },
    { class_name: 'Grade 1', section_name: 'B' },
    { class_name: 'Grade 2', section_name: 'A' },
  ];
  sendXlsx(res, toXlsx(sample, 'Classes'), 'classes_template.xlsx');
};

/**
 * POST /api/import-export/classes/import
 * Required: class_name, section_name
 * Creates class if not exists, then adds section if not exists.
 */
exports.importClasses = async (req, res) => {
  const sid = req.user.school_id;
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  const rows   = parseUpload(req.file.buffer);
  const errors = [];
  let   created = 0;

  for (let i = 0; i < rows.length; i++) {
    const r      = rows[i];
    const rowNum = i + 2;

    if (!r.class_name || !r.section_name) {
      errors.push(`Row ${rowNum}: class_name and section_name are required`);
      continue;
    }
    // Find or create class
    let [cls] = await db.query('SELECT id FROM classes WHERE class_name=? AND school_id=?', [r.class_name, sid]);
    let classId;
    if (cls.length === 0) {
      const [ins] = await db.query('INSERT INTO classes (school_id, class_name) VALUES (?,?) RETURNING id', [sid, r.class_name]);
      classId = ins[0].id;
    } else {
      classId = cls[0].id;
    }
    // Find or create section
    const [sec] = await db.query('SELECT id FROM sections WHERE class_id=? AND section_name=?', [classId, r.section_name]);
    if (sec.length > 0) {
      errors.push(`Row ${rowNum}: ${r.class_name} - ${r.section_name} already exists — skipped`);
      continue;
    }
    await db.query('INSERT INTO sections (class_id, section_name) VALUES (?,?)', [classId, r.section_name]);
    created++;
  }

  res.json({ message: `Import complete. Created: ${created}, Skipped: ${errors.length}`, created, errors });
};

// ─── ATTENDANCE REPORT ─────────────────────────────────────────────────────

/**
 * GET /api/import-export/attendance/export?class_id=&section_id=&date=
 * Exports the attendance report for a given class/section/date as Excel.
 */
exports.exportAttendance = async (req, res) => {
  const { class_id, section_id, date } = req.query;
  const sid = req.user.school_id;
  const reportDate = date || new Date().toISOString().slice(0, 10);

  if (!class_id || !section_id)
    return res.status(400).json({ message: 'class_id and section_id are required' });

  try {
    const [rows] = await db.query(
      `SELECT s.roll_no, s.first_name, s.last_name,
              COALESCE(a.status, 'not_marked') AS status
       FROM   students s
       LEFT   JOIN student_attendance a ON a.student_id=s.id AND a.date=?
       WHERE  s.class_id=? AND s.section_id=? AND s.school_id=?
       ORDER  BY s.last_name, s.first_name`,
      [reportDate, class_id, section_id, sid]
    );

    const [clsRows] = await db.query(
      `SELECT c.class_name, sec.section_name FROM classes c JOIN sections sec ON sec.id=? WHERE c.id=?`,
      [section_id, class_id]
    );
    const cls = clsRows[0] || {};
    const filename = `attendance_${cls.class_name || class_id}_${cls.section_name || section_id}_${reportDate}.xlsx`;

    const data = rows.map(r => ({
      'Roll No':    r.roll_no || '',
      'First Name': r.first_name,
      'Last Name':  r.last_name,
      'Status':     r.status,
      'Date':       reportDate,
    }));

    sendXlsx(res, toXlsx(data, 'Attendance'), filename);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};

// ─── LEAVE REPORT ──────────────────────────────────────────────────────────

/**
 * GET /api/import-export/leaves/export?status=&from=&to=
 * Exports leave applications as Excel.
 */
exports.exportLeaves = async (req, res) => {
  const sid = req.user.school_id;
  const { status, from, to } = req.query;

  try {
    let sql = `
      SELECT la.id, s.first_name, s.last_name, s.roll_no,
             c.class_name, sec.section_name,
             la.date, la.reason, la.status, la.created_at
      FROM leave_applications la
      JOIN students  s   ON s.id   = la.student_id
      JOIN classes   c   ON c.id   = s.class_id
      JOIN sections  sec ON sec.id = s.section_id
      WHERE s.school_id = ?
    `;
    const params = [sid];

    if (status) { sql += ' AND la.status = ?'; params.push(status); }
    if (from)   { sql += ' AND la.date >= ?';  params.push(from); }
    if (to)     { sql += ' AND la.date <= ?';  params.push(to); }
    sql += ' ORDER BY la.date DESC';

    const [rows] = await db.query(sql, params);
    const data = rows.map(r => ({
      'ID':           r.id,
      'First Name':   r.first_name,
      'Last Name':    r.last_name,
      'Roll No':      r.roll_no || '',
      'Class':        r.class_name,
      'Section':      r.section_name,
      'Date':         r.date,
      'Reason':       r.reason,
      'Status':       r.status,
      'Applied On':   r.created_at,
    }));

    sendXlsx(res, toXlsx(data, 'Leaves'), 'leaves_report.xlsx');
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error' }); }
};
