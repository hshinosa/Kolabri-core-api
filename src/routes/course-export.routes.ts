import { Router } from 'express';
import { CourseExportController } from '../controllers/course-export.controller.js';
import { verifyToken, requireLecturer } from '../middleware/auth.js';
import { exportRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.use(verifyToken);

router.post('/courses/:id/export', requireLecturer, exportRateLimiter, CourseExportController.requestExport);
router.get('/export/:jobId/status', CourseExportController.getStatus);
router.get('/export/:jobId/download', CourseExportController.download);

export default router;
