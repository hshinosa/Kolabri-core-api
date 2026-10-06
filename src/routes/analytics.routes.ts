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

// Akses PUBLIK: laporan berbagi (token stateless, tanpa login) — harus sebelum verifyToken
router.get('/shared/:token', AnalyticsController.getSharedReport);

// All routes require authentication
router.use(verifyToken);

// Student stats endpoint (accessible by students)
router.get('/student/stats', StudentAnalyticsController.getStudentStats);

// Lecturer-only routes below
router.get('/activity/recent', requireLecturer, AnalyticsController.getRecentActivity);

router.get('/dashboard-charts', requireLecturer, AnalyticsController.getDashboardCharts);
router.get('/overview', requireLecturer, AnalyticsController.getAnalyticsOverview);

router.get('/course/:courseId', requireLecturer, AnalyticsController.getCourseAnalytics);

router.get('/courses/:courseId/students', requireLecturer, AnalyticsController.getStudentBreakdown);

// Live refresh + tren per hari (sebelumnya 404, dipakai halaman analitik dosen)
router.get('/courses/:courseId/live', requireLecturer, AnalyticsController.getCourseLive);
router.get('/courses/:courseId/trends', requireLecturer, AnalyticsController.getCourseTrends);
router.post('/courses/:courseId/share', requireLecturer, AnalyticsController.generateShareLink);

// Alias export dengan query courseId (dipakai BFF export-section)
router.get('/export', requireLecturer, AnalyticsController.exportProcessMining);

router.get('/group/:groupId', requireLecturer, AnalyticsController.getGroupAnalytics);

router.get('/group/:groupId/status', requireLecturer, AnalyticsController.getGroupQualityStatus);

router.get('/session-discussion/:sessionDiscussionId', requireLecturer, AnalyticsController.getSessionDiscussionAnalytics);

router.post('/analyze', requireLecturer, validateBody(analyzeTextSchema), AnalyticsController.analyzeText);

router.get('/export/:courseId', requireLecturer, AnalyticsController.exportProcessMining);

router.get('/export/:courseId/summary', requireLecturer, AnalyticsController.exportAnalyticsSummary);

export default router;
