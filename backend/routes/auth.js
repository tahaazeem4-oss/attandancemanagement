const express = require('express');
const router  = express.Router();
const auth    = require('../controllers/authController');
const protect = require('../middleware/auth');
const { ipRateLimit, makeRateLimiter } = require('../middleware/rateLimit');

const loginRateLimit = ipRateLimit({
	windowMs: 15 * 60 * 1000,
	max: 10,
	message: 'Too many login attempts. Please try again in 15 minutes.',
});

const signupRateLimit = ipRateLimit({
	windowMs: 60 * 60 * 1000,
	max: 10,
	message: 'Too many signup attempts. Please try again later.',
});

const resetRequestRateLimit = makeRateLimiter({
	windowMs: 10 * 60 * 1000,
	max: 5,
	keyFn: (req) => `${req.ip || 'unknown'}:${String(req.body?.email || '').trim().toLowerCase() || 'no-email'}`,
	message: 'Too many reset requests. Please wait before requesting another code.',
});

const resetVerifyRateLimit = makeRateLimiter({
	windowMs: 10 * 60 * 1000,
	max: 10,
	keyFn: (req) => `${req.ip || 'unknown'}:${String(req.body?.email || '').trim().toLowerCase() || 'no-email'}`,
	message: 'Too many verification attempts. Please request a new code or try again later.',
});

const resetPasswordRateLimit = ipRateLimit({
	windowMs: 15 * 60 * 1000,
	max: 10,
	message: 'Too many password reset attempts. Please try again later.',
});

const changePasswordRateLimit = ipRateLimit({
	windowMs: 15 * 60 * 1000,
	max: 10,
	message: 'Too many password change attempts. Please try again later.',
});

router.post('/signup', signupRateLimit, auth.signup);
router.post('/login',  loginRateLimit, auth.login);
router.get('/me',      protect, auth.getMe);
router.put('/change-password', protect, changePasswordRateLimit, auth.changePassword);

// Forgot password — 3-step flow (email → OTP → new password)
router.post('/forgot-password/request', resetRequestRateLimit, auth.requestPasswordReset);
router.post('/forgot-password/verify',  resetVerifyRateLimit, auth.verifyPasswordResetCode);
router.post('/forgot-password/reset',   resetPasswordRateLimit, auth.resetPassword);

module.exports = router;
