const express    = require('express');
const router     = express.Router();
const multer     = require('multer');
const ctrl       = require('../controllers/importExportController');
const protect    = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');

// Store files in memory (no disk writes needed — we parse the buffer directly)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel',                                           // .xls
      'text/csv',                                                            // .csv
      'application/csv',
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel (.xlsx, .xls) and CSV files are allowed'));
    }
  },
});

const staffAccess = [protect, requireRole('admin', 'teacher', 'super_admin', 'org_admin', 'orgadmin')];

// ── Teachers ──────────────────────────────────────────────────
router.get('/teachers/template', ...staffAccess, ctrl.teacherTemplate);
router.get('/teachers/export',   ...staffAccess, ctrl.exportTeachers);
router.post('/teachers/import',  ...staffAccess, upload.single('file'), ctrl.importTeachers);

// ── Students ──────────────────────────────────────────────────
router.get('/students/template', ...staffAccess, ctrl.studentTemplate);
router.get('/students/export',   ...staffAccess, ctrl.exportStudents);
router.post('/students/import',  ...staffAccess, upload.single('file'), ctrl.importStudents);

// ── Classes ───────────────────────────────────────────────────
router.get('/classes/template',  ...staffAccess, ctrl.classTemplate);
router.get('/classes/export',    ...staffAccess, ctrl.exportClasses);
router.post('/classes/import',   ...staffAccess, upload.single('file'), ctrl.importClasses);

// ── Attendance report export ─────────────────────────────────
router.get('/attendance/export', ...staffAccess, ctrl.exportAttendance);

// ── Leave report export ────────────────────────────────────────
router.get('/leaves/export',     ...staffAccess, ctrl.exportLeaves);

module.exports = router;
