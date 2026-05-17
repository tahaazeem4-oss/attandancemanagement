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
const pushTokenRoutes      = require('./routes/pushToken');
const db                  = require('./config/db');
const path                = require('path');

const app  = express();
const PORT = process.env.PORT || 5000;
const DEFAULT_JWT_SECRET = 'your_super_secret_jwt_key_change_this_in_production';

const allowedOrigins = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (!allowedOrigins.length && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
  return false;
}

const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'X-User-Token', 'apikey'],
  credentials: false,
  maxAge: 86400,
};

if (!process.env.JWT_SECRET || process.env.JWT_SECRET === DEFAULT_JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  const message = 'JWT_SECRET is missing, using a placeholder, or too short. Set a strong 32+ character secret before deployment.';
  if (process.env.NODE_ENV === 'production') {
    throw new Error(message);
  }
  console.warn(`[security] ${message}`);
}

// ── Middleware ────────────────────────────────────────────────
app.disable('x-powered-by');
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// ── Static: uploaded school logos only ───────────────────────
app.use(
  '/uploads/logos',
  express.static(path.join(__dirname, 'uploads', 'logos'), {
    index: false,
    fallthrough: false,
    maxAge: '7d',
    setHeaders(res) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    },
  })
);

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
app.use('/api/push-token',     pushTokenRoutes);     // Expo push token registration

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

// ── Global error handler (catches multer errors etc.) ───────────
// Must be defined AFTER all routes. Returns JSON so the app can display it.
app.use((err, req, res, next) => {
  const status  = err.status || err.statusCode || 500;
  const message = err.message || 'Server error';
  console.error('[error handler]', message);
  res.status(status).json({ message });
});

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

