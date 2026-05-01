import { Router } from 'express';

import { AdminAiController } from '../controllers/admin-ai.controller.js';
import { checkRole, verifyToken } from '../middleware/auth.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import { validateBody, validateParams, validateQuery } from '../validators/validate.js';
import { aiCompareSchema, usageReportParamsSchema, usageStatsQuerySchema } from '../validators/admin-ai.validator.js';

const router = Router();

router.use(verifyToken);
router.use(checkRole(['admin']));
router.use(rateLimiter);

router.get('/usage-stats', validateQuery(usageStatsQuerySchema), AdminAiController.getUsageStats);
router.get('/usage-report/:userId/:month/:year', validateParams(usageReportParamsSchema), AdminAiController.getUsageReport);
router.post('/ai-compare', validateBody(aiCompareSchema), AdminAiController.compareModels);

export default router;
