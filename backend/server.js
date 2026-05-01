require('dotenv').config();

// Prevent unhandled promise rejections from crashing the server
process.on('unhandledRejection', (reason) => {
  console.warn('[unhandledRejection]', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
  console.warn('[uncaughtException]', err.message);
});

const express    = require('express');
const cors       = require('cors');

const authRoutes          = require('./routes/auth');
const teacherRoutes       = require('./routes/teachers');
const classRoutes         = require('./routes/classes');
const studentRoutes       = require('./routes/students');
const attendanceRoutes    = require('./routes/attendance');
const adminRoutes         = require('./routes/admin');
const studentPortalRoutes = require('./routes/studentPortal');
const superAdminRoutes    = require('./routes/superAdmin');
const uploadRoutes         = require('./routes/upload');
const importExportRoutes   = require('./routes/importExport');
const lectureRoutes        = require('./routes/lectures');
const notificationRoutes   = require('./routes/notifications');
const subjectRoutes        = require('./routes/subjects');
const db                  = require('./config/db');
const path                = require('path');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Static: uploaded school logos ────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Routes ────────────────────────────────────────────────────
// Each module handles its own sub-path under /api/.
// To add a new feature: create routes/myFeature.js, require it here,
// and register it with app.use('/api/myFeature', myFeatureRoutes).
app.use('/api/auth',           authRoutes);         // login, signup, /me
app.use('/api/teachers',       teacherRoutes);       // teacher CRUD (admin)
app.use('/api/classes',        classRoutes);         // classes + sections
app.use('/api/students',       studentRoutes);       // student CRUD (admin)
app.use('/api/attendance',     attendanceRoutes);    // mark / view attendance
app.use('/api/admin',          adminRoutes);         // admin dashboard helpers
app.use('/api/student-portal', studentPortalRoutes); // student home, leaves
app.use('/api/super-admin',    superAdminRoutes);    // super-admin school mgmt
app.use('/api/upload',         uploadRoutes);        // school logo upload
app.use('/api/import-export',  importExportRoutes);  // bulk Excel import/export
app.use('/api/lectures',       lectureRoutes);       // upload/list/delete PDFs
app.use('/api/notifications',  notificationRoutes);  // push notifications (future)
app.use('/api/subjects',       subjectRoutes);       // school subject master list

// ── Public: list schools (used by signup screen) ─────────────
app.get('/api/schools', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, name, initials, tagline, logo_url, primary_color, accent_color FROM schools ORDER BY name');
    const host = `${req.protocol}://${req.get('host')}`;
    const expanded = rows.map(r => ({
      ...r,
      logo_url: r.logo_url
        ? (r.logo_url.startsWith('http') ? r.logo_url : `${host}${r.logo_url}`)
        : null,
    }));
    res.json(expanded);
  } catch (err) { res.status(500).json({ message: 'Server error' }); }
});
// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'OK', time: new Date() }));

// ── Start server ──────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

server.on('error', (err) => {
  console.error('[server error]', err.message);
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Kill the existing process and retry.`);
    process.exit(1);
  }
});

