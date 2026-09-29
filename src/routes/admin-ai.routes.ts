import { Router } from 'express';

import { AdminAiController } from '../controllers/admin-ai.controller.js';
import { AdminEmbeddingController } from '../controllers/admin-embedding.controller.js';
import { checkRole, verifyToken } from '../middleware/auth.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import { validateParams, validateQuery } from '../validators/validate.js';
import { usageReportParamsSchema, usageStatsQuerySchema } from '../validators/admin-ai.validator.js';

const router = Router();

router.use(verifyToken);
router.use(checkRole(['admin']));
router.use(rateLimiter);

router.get('/embedding-config', AdminEmbeddingController.getConfig);
router.put('/embedding-config', AdminEmbeddingController.updateConfig);
router.get('/usage-stats', validateQuery(usageStatsQuerySchema), AdminAiController.getUsageStats);
router.get('/usage-report/:userId/:month/:year', validateParams(usageReportParamsSchema), AdminAiController.getUsageReport);

export default router;
