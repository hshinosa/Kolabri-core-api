import { Router } from 'express';

import { LecturerAiController } from '../controllers/lecturer-ai.controller.js';
import { requireLecturer, verifyToken } from '../middleware/auth.js';
import { previewRateLimiter, rateLimiter } from '../middleware/rateLimiter.js';
import { validateBody, validateParams, validateQuery } from '../validators/validate.js';
import {
    courseContextParamsSchema,
    courseContextQuerySchema,
    historyQuerySchema,
    previewRequestSchema,
} from '../validators/lecturer-ai.validator.js';

const router = Router();

router.use(verifyToken);
router.use(requireLecturer);

router.post('/preview', previewRateLimiter, validateBody(previewRequestSchema), LecturerAiController.preview);
router.get('/courses/:courseId/context', validateParams(courseContextParamsSchema), validateQuery(courseContextQuerySchema), LecturerAiController.getCourseContext);
router.get('/history', rateLimiter, validateQuery(historyQuerySchema), LecturerAiController.getHistory);
router.post('/history/archive', rateLimiter, LecturerAiController.archiveHistory);


export default router;
