const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/studentController');
const protect  = require('../middleware/auth');

router.get('/',        protect, ctrl.getStudents);
router.post('/',       protect, ctrl.addStudent);
router.put('/:id',     protect, ctrl.updateStudent);
router.delete('/:id',  protect, ctrl.deleteStudent);

module.exports = router;
