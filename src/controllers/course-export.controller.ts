import { Response, NextFunction } from 'express';
import { CourseExportService } from '../services/course-export.service.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import fs from 'fs';

export class CourseExportController {
    static async requestExport(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const userId = req.user!.userId;
            const courseId = req.params.id;

            const result = await CourseExportService.requestCourseExport(userId, courseId);

            res.status(202).json({
                success: true,
                message: 'Export job created',
                jobId: result.jobId,
                status: result.status
            });
        } catch (error) {
            next(error);
        }
    }

    static async getStatus(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const userId = req.user!.userId;
            const jobId = req.params.jobId;

            const status = await CourseExportService.getExportStatus(userId, jobId);

            res.json({
                success: true,
                ...status
            });
        } catch (error) {
            next(error);
        }
    }

    static async download(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const userId = req.user!.userId;
            const jobId = req.params.jobId;

            const filePath = await CourseExportService.downloadExport(userId, jobId);

            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename="course-export-${jobId}.zip"`);

            const fileStream = fs.createReadStream(filePath);
            fileStream.pipe(res);

            fileStream.on('error', (error) => {
                next(error);
            });
        } catch (error) {
            next(error);
        }
    }
}
