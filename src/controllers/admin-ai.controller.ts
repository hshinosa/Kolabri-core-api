import { NextFunction, Response } from 'express';

import { AuthenticatedRequest } from '../middleware/auth.js';

import { usageTrackingService } from '../services/usage-tracking.service.js';
import { UsageReportParams, UsageStatsQuery } from '../validators/admin-ai.validator.js';

export class AdminAiController {
    static async getUsageStats(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const result = await usageTrackingService.getUsageStats(req.query as unknown as UsageStatsQuery);

            res.json({
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }

    static async getUsageReport(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const params = req.params as unknown as UsageReportParams;
            const result = await usageTrackingService.getMonthlyReport(params.userId, params.month, params.year);

            res.json({
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }
}
