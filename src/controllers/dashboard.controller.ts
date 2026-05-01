import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { DashboardService } from '../services/dashboard.service.js';
import { ActivityQuery, ChartPeriod } from '../validators/dashboard.validator.js';

export class DashboardController {
    static async getStats(_req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const stats = await DashboardService.getStats();

            res.json({
                data: stats,
            });
        } catch (error) {
            next(error);
        }
    }

    static async getActivityFeed(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const result = await DashboardService.getActivityFeed(req.query as unknown as ActivityQuery);

            res.json({
                data: result.data,
                meta: result.meta,
            });
        } catch (error) {
            next(error);
        }
    }

    static async getUserGrowthChart(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const result = await DashboardService.getUserGrowthChart(
                (req.query as unknown as ChartPeriod).period
            );

            res.json({
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }

    static async getMessageActivityChart(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const result = await DashboardService.getMessageActivityChart(
                (req.query as unknown as ChartPeriod).period
            );

            res.json({
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }
}
