import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { authRateLimiter } from '../middleware/rateLimiter.js';
import { verifyToken } from '../middleware/auth.js';
import { validateBody } from '../validators/validate.js';
import { registerSchema, loginSchema } from '../validators/auth.validator.js';

const router = Router();

router.post('/register', authRateLimiter, validateBody(registerSchema), AuthController.register);
router.post('/login', authRateLimiter, validateBody(loginSchema), AuthController.login);
router.post('/refresh', authRateLimiter, AuthController.refresh);
router.post('/logout', authRateLimiter, AuthController.logout);

router.get('/me', verifyToken, AuthController.getProfile);

export default router;
