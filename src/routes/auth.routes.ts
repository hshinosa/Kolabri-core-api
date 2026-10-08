import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { PasswordResetController } from '../controllers/password-reset.controller.js';
import { EmailVerificationController } from '../controllers/email-verification.controller.js';
import { loginRateLimiter, registerRateLimiter, refreshRateLimiter, logoutRateLimiter, passwordResetLimiter, resendVerifyRateLimiter, verifyCodeRateLimiter } from '../middleware/rateLimiter.js';
import { verifyToken } from '../middleware/auth.js';
import { validateBody } from '../validators/validate.js';
import { registerSchema, loginSchema } from '../validators/auth.validator.js';

const router = Router();

// Rate limit per-endpoint (lihat rateLimiter.ts): array = lapis IP + lapis email/user.
router.post('/register', ...registerRateLimiter, validateBody(registerSchema), AuthController.register);
router.post('/login', ...loginRateLimiter, validateBody(loginSchema), AuthController.login);
router.post('/refresh', ...refreshRateLimiter, AuthController.refresh);
router.post('/logout', logoutRateLimiter, AuthController.logout);

router.get('/me', verifyToken, AuthController.getProfile);

router.post('/password-reset/request', ...passwordResetLimiter, PasswordResetController.requestReset);
router.post('/password-reset/verify', verifyCodeRateLimiter, PasswordResetController.verifyToken);
router.post('/password-reset/reset', ...passwordResetLimiter, PasswordResetController.resetPassword);

router.post('/email-verification/verify', verifyCodeRateLimiter, EmailVerificationController.verify);
router.post('/email-verification/resend', resendVerifyRateLimiter, EmailVerificationController.resend);

export default router;
