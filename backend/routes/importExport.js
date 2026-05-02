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

const adminOnly = [protect, requireRole('admin')];

// ── Teachers ──────────────────────────────────────────────────
router.get('/teachers/template', ...adminOnly, ctrl.teacherTemplate);
router.get('/teachers/export',   ...adminOnly, ctrl.exportTeachers);
router.post('/teachers/import',  ...adminOnly, upload.single('file'), ctrl.importTeachers);

// ── Students ──────────────────────────────────────────────────
router.get('/students/template', ...adminOnly, ctrl.studentTemplate);
router.get('/students/export',   ...adminOnly, ctrl.exportStudents);
router.post('/students/import',  ...adminOnly, upload.single('file'), ctrl.importStudents);

// ── Classes ───────────────────────────────────────────────────
router.get('/classes/template',  ...adminOnly, ctrl.classTemplate);
router.get('/classes/export',    ...adminOnly, ctrl.exportClasses);
router.post('/classes/import',   ...adminOnly, upload.single('file'), ctrl.importClasses);

// ── Attendance report export ─────────────────────────────────
// Any authenticated user (admin / teacher / student-portal admin) may export.
// The controller filters by school_id from the token so cross-school access is impossible.
router.get('/attendance/export', protect, ctrl.exportAttendance);

// ── Leave report export ────────────────────────────────────────
router.get('/leaves/export',     ...adminOnly, ctrl.exportLeaves);

module.exports = router;
