import { Router } from 'express';
import { SessionDiscussionController } from '../controllers/sessionDiscussion.controller.js';
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

// Session discussion session routes
router.post('/:id/close', SessionDiscussionController.close);
router.post('/:id/reopen', requireLecturer, SessionDiscussionController.reopen);
router.get('/:id/status', SessionDiscussionController.getStatus);
router.get('/:id/summary', SessionDiscussionController.getSummary);
router.post('/:id/regenerate-summary', SessionDiscussionController.regenerateSummary);
router.post('/:id/reflection', requireStudent, validateBody(sessionReflectionSchema), SessionDiscussionController.submitReflection);

export default router;
