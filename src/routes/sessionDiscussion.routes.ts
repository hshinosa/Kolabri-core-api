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

// P2-06 (pass2): payload rusak ({} / null / string) dulu memicu 500 saat
// diiterasi — wajib lolos zod dulu (string malah diiterasi per-karakter).
const bulkCloseSchema = z.object({
    sessionDiscussionIds: z
        .array(z.string().min(1))
        .min(1, 'sessionDiscussionIds must be a non-empty array'),
});

// Session discussion session routes
router.post('/bulk-close', requireLecturer, validateBody(bulkCloseSchema), SessionDiscussionController.bulkClose);
router.post('/:id/close', SessionDiscussionController.close);
// Reopen disabled — sessions cannot be reopened (BR-023)
router.get('/:id/status', SessionDiscussionController.getStatus);
router.get('/:id/summary', SessionDiscussionController.getSummary);
router.post('/:id/regenerate-summary', SessionDiscussionController.regenerateSummary);
router.post('/:id/reflection', requireStudent, validateBody(sessionReflectionSchema), SessionDiscussionController.submitReflection);

export default router;
