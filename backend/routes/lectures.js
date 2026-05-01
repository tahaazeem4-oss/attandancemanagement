const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const protect      = require('../middleware/auth');
const requireRole  = protect.requireRole;
const ctrl         = require('../controllers/lectureController');

const router = express.Router();

// Ensure upload directory exists
const LECTURES_DIR = path.join(__dirname, '..', 'uploads', 'lectures');
if (!fs.existsSync(LECTURES_DIR)) fs.mkdirSync(LECTURES_DIR, { recursive: true });

// Multer: disk storage, PDF only, 20 MB limit
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, LECTURES_DIR),
  filename:    (_req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = `lecture_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});

const fileFilter = (_req, file, cb) => {
  const ext  = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype?.toLowerCase() || '';
  if (mime === 'application/pdf' || ext === '.pdf') cb(null, true);
  else cb(new Error('Only PDF files are allowed'));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 20 * 1024 * 1024 } });

// Roles allowed to upload / manage
const canUpload = [protect, requireRole('teacher', 'admin')];
const anyAuth   = [protect, requireRole('teacher', 'admin', 'student')];

// ── Classes list for the upload form (teacher + admin) ────────
router.get('/classes',          ...canUpload, ctrl.getClassesForUpload);

// ── Distinct subjects for this school ────────────────────────
router.get('/subjects',         ...canUpload, ctrl.getSubjects);

// ── Check for duplicate before uploading ─────────────────────
router.get('/check-duplicate',  ...canUpload, ctrl.checkDuplicate);

// ── Upload a lecture ─────────────────────────────────────────
router.post('/', ...canUpload, upload.single('file'), ctrl.uploadLecture);

// ── List lectures ────────────────────────────────────────────
router.get('/', ...anyAuth, ctrl.getLectures);

// ── Stream / download the PDF ─────────────────────────────────
router.get('/:id/file', ...anyAuth, ctrl.getFile);

// ── Delete a lecture ─────────────────────────────────────────
router.delete('/:id', ...canUpload, ctrl.deleteLecture);

module.exports = router;
