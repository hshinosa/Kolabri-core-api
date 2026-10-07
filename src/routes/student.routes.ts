import { Router } from 'express';
import { StudentAnalyticsController } from '../controllers/student-analytics.controller.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.use(verifyToken);

router.get('/analytics', StudentAnalyticsController.getStudentAnalytics);
router.get('/stats', StudentAnalyticsController.getStudentStats);
router.get('/activity/recent', StudentAnalyticsController.getRecentActivity);
router.get('/srl', StudentAnalyticsController.getMySrl);

export default router;
