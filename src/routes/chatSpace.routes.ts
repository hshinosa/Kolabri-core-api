import { Router } from 'express';
import { ChatSpaceController } from '../controllers/chatSpace.controller.js';
import { verifyToken, requireLecturer, requireStudent } from '../middleware/auth.js';
import { validateBody } from '../validators/validate.js';
import { z } from 'zod';

const router = Router();

// All routes require authentication
router.use(verifyToken);

// Session reflection schema
const sessionReflectionSchema = z.object({
    content: z.string().min(10, 'Reflection must be at least 10 characters').max(2000),
});

// Chat space session routes
router.post('/:id/close', ChatSpaceController.close);
router.post('/:id/reopen', requireLecturer, ChatSpaceController.reopen);
router.get('/:id/status', ChatSpaceController.getStatus);
router.get('/:id/summary', ChatSpaceController.getSummary);
router.post('/:id/regenerate-summary', ChatSpaceController.regenerateSummary);
router.post('/:id/reflection', requireStudent, validateBody(sessionReflectionSchema), ChatSpaceController.submitReflection);

export default router;
