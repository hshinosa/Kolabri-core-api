import { Router } from 'express';

import { LecturerAiController } from '../controllers/lecturer-ai.controller.js';
import { requireLecturer, verifyToken } from '../middleware/auth.js';
import { previewRateLimiter, rateLimiter } from '../middleware/rateLimiter.js';
import { validateBody, validateParams, validateQuery } from '../validators/validate.js';
import {
    abTestCreateSchema,
    abTestListQuerySchema,
    abTestParamsSchema,
    abTestUpdateSchema,
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

router.get('/ab-tests', rateLimiter, validateQuery(abTestListQuerySchema), LecturerAiController.listAbTests);
router.post('/ab-tests', rateLimiter, validateBody(abTestCreateSchema), LecturerAiController.createAbTest);
router.get('/ab-tests/:testId', rateLimiter, validateParams(abTestParamsSchema), LecturerAiController.getAbTest);
router.put('/ab-tests/:testId', rateLimiter, validateParams(abTestParamsSchema), validateBody(abTestUpdateSchema), LecturerAiController.updateAbTest);
router.delete('/ab-tests/:testId', rateLimiter, validateParams(abTestParamsSchema), LecturerAiController.deleteAbTest);
router.get('/ab-tests/:testId/stats', rateLimiter, validateParams(abTestParamsSchema), LecturerAiController.getAbTestStats);
router.post('/ab-tests/:testId/assign', previewRateLimiter, validateParams(abTestParamsSchema), LecturerAiController.assignAbTestVariant);

export default router;
