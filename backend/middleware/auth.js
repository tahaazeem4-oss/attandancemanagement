const jwt = require('jsonwebtoken');

// ── protect: verify JWT, set req.user (and req.teacher for compat) ──
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

// ── requireRole: gate a route to specific roles ───────────────
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied' });
  }
  next();
};

module.exports             = protect;
module.exports.requireRole = requireRole;
