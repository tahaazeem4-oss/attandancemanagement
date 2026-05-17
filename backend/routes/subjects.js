const express         = require('express');
const router          = express.Router();
const ctrl            = require('../controllers/subjectController');
const protect         = require('../middleware/auth');
const { requireRole } = protect; // requireRole is attached to the protect export

// Who can access what:
//   anyStaff  = teacher + admin (read subjects for upload form / subject picker)
//   writeStaff = teacher + admin (manage subjects from the master list)
const anyStaff  = [protect, requireRole('teacher', 'admin')];
const writeStaff = [protect, requireRole('teacher', 'admin')];

// GET  /api/subjects        – returns [{ id, name }] for this school
router.get('/',       ...anyStaff,  ctrl.listSubjects);
// POST /api/subjects        – adds a subject to the school's master list
router.post('/',      ...writeStaff, ctrl.addSubject);
// PUT  /api/subjects/:id    – renames a subject in the school's master list
router.put('/:id',    ...writeStaff, ctrl.updateSubject);
// DELETE /api/subjects/:id  – removes a subject from the school's master list
router.delete('/:id', ...writeStaff, ctrl.deleteSubject);

module.exports = router;
