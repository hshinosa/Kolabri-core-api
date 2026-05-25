import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { PasswordResetController } from '../controllers/password-reset.controller.js';
import { EmailVerificationController } from '../controllers/email-verification.controller.js';
import { authRateLimiter, loginRateLimiter, registerRateLimiter } from '../middleware/rateLimiter.js';
import { verifyToken } from '../middleware/auth.js';
import { validateBody } from '../validators/validate.js';
import { registerSchema, loginSchema } from '../validators/auth.validator.js';

const router = Router();

router.post('/register', registerRateLimiter, validateBody(registerSchema), AuthController.register);
router.post('/login', loginRateLimiter, validateBody(loginSchema), AuthController.login);
router.post('/refresh', authRateLimiter, AuthController.refresh);
router.post('/logout', authRateLimiter, AuthController.logout);

router.get('/me', verifyToken, AuthController.getProfile);

router.post('/password-reset/request', authRateLimiter, PasswordResetController.requestReset);
router.post('/password-reset/verify', authRateLimiter, PasswordResetController.verifyToken);
router.post('/password-reset/reset', authRateLimiter, PasswordResetController.resetPassword);

router.post('/email-verification/verify', authRateLimiter, EmailVerificationController.verify);
router.post('/email-verification/resend', authRateLimiter, EmailVerificationController.resend);

export default router;
