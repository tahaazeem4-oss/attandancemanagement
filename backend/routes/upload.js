const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const protect      = require('../middleware/auth');
const requireRole  = protect.requireRole;

const router = express.Router();

// Ensure uploads/logos directory exists
const uploadDir = path.join(__dirname, '..', 'uploads', 'logos');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename:    (_req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = `logo_${Date.now()}${ext}`;
    cb(null, name);
  },
});

const fileFilter = (_req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml'];
  const allowedExts  = ['.jpg', '.jpeg', '.png', '.webp', '.svg'];
  const ext  = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype?.toLowerCase() || '';
  if (allowedMimes.includes(mime) || allowedExts.includes(ext)) cb(null, true);
  else cb(new Error(`File type not allowed. Got mime: ${mime}, ext: ${ext}`));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB max
});

// POST /api/upload/logo  — super_admin only
router.post('/logo', protect, requireRole('super_admin'), (req, res, next) => {
  multer({ storage, fileFilter, limits: { fileSize: 2 * 1024 * 1024 } }).any()(req, res, (err) => {
    if (err) {
      console.error('[UPLOAD] Multer error:', err.message);
      return res.status(400).json({ message: err.message });
    }

    const file = req.files?.[0];
    if (!file) return res.status(400).json({ message: 'No file uploaded' });

    // Return full URL for immediate display; the frontend/backend will store
    // a relative path so logos survive server IP changes.
    const relativePath = `/uploads/logos/${file.filename}`;
    const host         = `${req.protocol}://${req.get('host')}`;
    res.json({ logo_url: `${host}${relativePath}` });
  });
});

module.exports = router;
