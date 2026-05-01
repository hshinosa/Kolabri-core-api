import { Router } from 'express';
import { DashboardController } from '../controllers/dashboard.controller.js';
import { verifyToken, checkRole } from '../middleware/auth.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import { validateQuery } from '../validators/validate.js';
import { activityQuerySchema, chartPeriodSchema, statsDateRangeSchema } from '../validators/dashboard.validator.js';

const router = Router();

router.use(verifyToken);
router.use(checkRole(['admin']));
router.use(rateLimiter);

router.get('/stats', validateQuery(statsDateRangeSchema), DashboardController.getStats);
router.get('/activity', validateQuery(activityQuerySchema), DashboardController.getActivityFeed);
router.get('/charts/user-growth', validateQuery(chartPeriodSchema), DashboardController.getUserGrowthChart);
router.get(
    '/charts/message-activity',
    validateQuery(chartPeriodSchema),
    DashboardController.getMessageActivityChart
);

export default router;
