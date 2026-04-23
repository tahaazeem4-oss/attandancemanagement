require('dotenv').config();
const express    = require('express');
const cors       = require('cors');

const authRoutes       = require('./routes/auth');
const teacherRoutes    = require('./routes/teachers');
const classRoutes      = require('./routes/classes');
const studentRoutes    = require('./routes/students');
const attendanceRoutes = require('./routes/attendance');
const whatsappService  = require('./services/whatsappService');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────
app.use('/api/auth',       authRoutes);
app.use('/api/teachers',   teacherRoutes);
app.use('/api/classes',    classRoutes);
app.use('/api/students',   studentRoutes);
app.use('/api/attendance', attendanceRoutes);

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'OK', time: new Date() }));

// ── Start server ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  // Initialise WhatsApp client (scan QR once)
  whatsappService.init();
});
