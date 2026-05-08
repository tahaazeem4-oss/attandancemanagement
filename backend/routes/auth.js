const express = require('express');
const router  = express.Router();
const auth    = require('../controllers/authController');
const protect = require('../middleware/auth');

router.post('/signup', auth.signup);
router.post('/login',  auth.login);
router.get('/me',      protect, auth.getMe);
router.put('/change-password', protect, auth.changePassword);

// Forgot password — 3-step flow (email → OTP → new password)
router.post('/forgot-password/request', auth.requestPasswordReset);
router.post('/forgot-password/verify',  auth.verifyPasswordResetCode);
router.post('/forgot-password/reset',   auth.resetPassword);

module.exports = router;
