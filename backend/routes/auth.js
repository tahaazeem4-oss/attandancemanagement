const express = require('express');
const router  = express.Router();
const auth    = require('../controllers/authController');
const protect = require('../middleware/auth');

router.post('/signup', auth.signup);
router.post('/login',  auth.login);
router.get('/me',      protect, auth.getMe);

module.exports = router;
