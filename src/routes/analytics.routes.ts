/**
 * Analytics Routes
 * 
 * API endpoints for analytics dashboard (lecturer/admin).
 * Provides group analytics, course overview, engagement metrics,
 * and process mining data export.
 */

import { Router } from 'express';
import { AnalyticsController } from '../controllers/analytics.controller.js';
import { StudentAnalyticsController } from '../controllers/student-analytics.controller.js';
import { verifyToken, requireLecturer } from '../middleware/auth.js';
import { validateBody } from '../validators/validate.js';
import { z } from 'zod';

const router = Router();

// Validation schemas
const analyzeTextSchema = z.object({
    text: z.string().min(1, 'Text is required').max(10000, 'Text must be less than 10000 characters'),
});

// All routes require authentication
router.use(verifyToken);

// Student stats endpoint (accessible by students)
router.get('/student/stats', StudentAnalyticsController.getStudentStats);

// Lecturer-only routes below
router.get('/activity/recent', requireLecturer, AnalyticsController.getRecentActivity);

router.get('/dashboard-charts', requireLecturer, AnalyticsController.getDashboardCharts);
router.get('/overview', requireLecturer, AnalyticsController.getAnalyticsOverview);

router.get('/course/:courseId', requireLecturer, AnalyticsController.getCourseAnalytics);

router.get('/group/:groupId', requireLecturer, AnalyticsController.getGroupAnalytics);

router.get('/group/:groupId/status', requireLecturer, AnalyticsController.getGroupQualityStatus);

router.get('/chat-space/:chatSpaceId', requireLecturer, AnalyticsController.getChatSpaceAnalytics);

router.post('/analyze', requireLecturer, validateBody(analyzeTextSchema), AnalyticsController.analyzeText);

router.get('/export/:courseId', requireLecturer, AnalyticsController.exportProcessMining);

export default router;
