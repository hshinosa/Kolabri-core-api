import { Request, Response, NextFunction } from 'express';
import { DataExportService } from '../services/data-export.service.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

export class DataExportController {
    static async requestExport(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            if (!req.user) {
                return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
            }

            const { exportType, courseId } = req.body as { exportType?: string; courseId?: string };
            const result = await DataExportService.requestExport(req.user.userId, exportType, courseId);

            res.status(202).json({ data: result, meta: { message: 'Export request accepted' } });
        } catch (error) {
            next(error);
        }
    }

    static async getExportStatus(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            if (!req.user) {
                return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
            }

            const { jobId } = req.params;
            const status = await DataExportService.getExportStatus(req.user.userId, jobId);

            if (status.status === 'expired') {
                return res.status(410).json({
                    error: { code: 'GONE', message: 'Export file has expired' }
                });
            }

            if (status.status === 'completed') {
                return res.status(200).json({
                    data: status,
                    meta: { message: 'Export completed' }
                });
            }

            // pending or processing
            return res.status(202).json({
                data: status,
                meta: { message: 'Export in progress' }
            });
        } catch (error) {
            next(error);
        }
    }
}
