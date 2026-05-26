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

// Student stats endpoint (before requireLecturer middleware)
router.get('/student/stats', StudentAnalyticsController.getStudentStats);

// Lecturer-only routes
router.use(requireLecturer);

/**
 * GET /analytics/activity/recent
 * Get recent activity across all lecturer's courses
 */
router.get('/activity/recent', AnalyticsController.getRecentActivity);

router.get('/dashboard-charts', AnalyticsController.getDashboardCharts);
router.get('/overview', AnalyticsController.getAnalyticsOverview);

/**
 * GET /analytics/course/:courseId
 * Get analytics overview for all groups in a course
 */
router.get('/course/:courseId', AnalyticsController.getCourseAnalytics);

/**
 * GET /analytics/group/:groupId
 * Get detailed analytics for a specific group
 */
router.get('/group/:groupId', AnalyticsController.getGroupAnalytics);

/**
 * GET /analytics/group/:groupId/status
 * Get real-time quality status for live monitoring
 */
router.get('/group/:groupId/status', AnalyticsController.getGroupQualityStatus);

/**
 * GET /analytics/chat-space/:chatSpaceId
 * Get analytics for a specific chat space/session
 */
router.get('/chat-space/:chatSpaceId', AnalyticsController.getChatSpaceAnalytics);

/**
 * POST /analytics/analyze
 * Analyze a text for engagement metrics
 */
router.post('/analyze', validateBody(analyzeTextSchema), AnalyticsController.analyzeText);

/**
 * GET /analytics/export/:courseId
 * Export process mining data for a course
 */
router.get('/export/:courseId', AnalyticsController.exportProcessMining);

export default router;
