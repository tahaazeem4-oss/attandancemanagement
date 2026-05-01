const jwt = require('jsonwebtoken');

// ── protect ───────────────────────────────────────────────────
// Express middleware that verifies the JWT in the Authorization header.
// Sets req.user = decoded token payload (id, email, role, school_id, …)
// and req.teacher = same value for backward compatibility with older controllers
// that still read req.teacher.
// Must be used on every protected route BEFORE requireRole.
const protect = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user    = decoded; // { id, email, role, first_name, last_name, student_id? }
    req.teacher = decoded; // backward compatibility with existing controllers
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

// ── requireRole ────────────────────────────────────────────────
// Factory that returns a middleware function restricting access to the
// listed roles. Use AFTER protect so req.user is already set.
// Example: [protect, requireRole('admin', 'teacher')]
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied' });
  }
  next();
};

module.exports             = protect;
module.exports.requireRole = requireRole;
