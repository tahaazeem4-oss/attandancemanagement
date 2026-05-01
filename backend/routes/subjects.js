const express         = require('express');
const router          = express.Router();
const ctrl            = require('../controllers/subjectController');
const protect         = require('../middleware/auth');
const { requireRole } = protect; // requireRole is attached to the protect export

// Who can access what:
//   anyStaff  = teacher + admin (read subjects for upload form / subject picker)
//   adminOnly = admin only (add / delete subjects from the master list)
const anyStaff  = [protect, requireRole('teacher', 'admin')];
const adminOnly = [protect, requireRole('admin')];

// GET  /api/subjects        – returns [{ id, name }] for this school
router.get('/',       ...anyStaff,  ctrl.listSubjects);
// POST /api/subjects        – adds a subject to the school's master list
router.post('/',      ...adminOnly, ctrl.addSubject);
// DELETE /api/subjects/:id  – removes a subject from the school's master list
router.delete('/:id', ...adminOnly, ctrl.deleteSubject);

module.exports = router;
