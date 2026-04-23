const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/classController');
const protect  = require('../middleware/auth');

router.get('/',                        protect, ctrl.getAllClasses);
router.get('/:classId/sections',       protect, ctrl.getSections);

module.exports = router;
