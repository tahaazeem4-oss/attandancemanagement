const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../config/db');

// ── POST /api/auth/signup ─────────────────────────────────────
exports.signup = async (req, res) => {
  const { first_name, last_name, email, password, phone } = req.body;

  if (!first_name || !last_name || !email || !password) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    // Check duplicate email
    const [existing] = await db.query('SELECT id FROM teachers WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const hashed = await bcrypt.hash(password, 12);

    const [result] = await db.query(
      'INSERT INTO teachers (first_name, last_name, email, password, phone) VALUES (?,?,?,?,?)',
      [first_name, last_name, email, hashed, phone || null]
    );

    const token = jwt.sign(
      { id: result.insertId, email, first_name, last_name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.status(201).json({
      message: 'Teacher registered successfully',
      token,
      teacher: { id: result.insertId, first_name, last_name, email, phone }
    });
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ── POST /api/auth/login ──────────────────────────────────────
exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const [rows] = await db.query('SELECT * FROM teachers WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const teacher = rows[0];
    const match   = await bcrypt.compare(password, teacher.password);
    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: teacher.id, email: teacher.email, first_name: teacher.first_name, last_name: teacher.last_name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.json({
      token,
      teacher: {
        id:         teacher.id,
        first_name: teacher.first_name,
        last_name:  teacher.last_name,
        email:      teacher.email,
        phone:      teacher.phone
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// ── GET /api/auth/me ──────────────────────────────────────────
exports.getMe = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, first_name, last_name, email, phone, created_at FROM teachers WHERE id = ?',
      [req.teacher.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Teacher not found' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('GetMe error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};
