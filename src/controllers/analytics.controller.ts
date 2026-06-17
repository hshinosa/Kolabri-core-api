import { Request, Response, NextFunction } from 'express';
import { AnalyticsService } from '../services/analytics.service.js';

export class AnalyticsController {
    static async getGroupAnalytics(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await AnalyticsService.getGroupAnalytics(
                req.params.groupId,
                req.user?.userId,
                req.user?.role
            );
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async getCourseAnalytics(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await AnalyticsService.getCourseAnalytics(
                req.params.courseId,
                req.user?.userId
            );
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async getStudentBreakdown(req: Request, res: Response, next: NextFunction) {
        try {
            const page = parseInt(req.query.page as string) || 1;
            const perPage = parseInt(req.query.perPage as string) || 15;
            const sortBy = (req.query.sortBy as string) || 'quality_score';
            const sortDir = (req.query.sortDir as string) || 'desc';
            const search = req.query.search as string;
            const minScore = req.query.minScore ? parseFloat(req.query.minScore as string) : undefined;
            const maxScore = req.query.maxScore ? parseFloat(req.query.maxScore as string) : undefined;
            const startDate = req.query.startDate as string;
            const endDate = req.query.endDate as string;

            const result = await AnalyticsService.getStudentBreakdown(
                req.params.courseId,
                { page, perPage, sortBy, sortDir, search, minScore, maxScore, startDate, endDate }
            );
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async analyzeText(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await AnalyticsService.analyzeText(req.body.text);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async exportProcessMining(req: Request, res: Response, next: NextFunction) {
        try {
            const format = (req.query.format as string) || 'json';
            
            if (!['json', 'csv'].includes(format)) {
                return res.status(400).json({ 
                    error: { 
                        code: 'INVALID_FORMAT', 
                        message: 'Format must be either json or csv' 
                    } 
                });
            }

            const result = await AnalyticsService.exportProcessMining(
                req.params.courseId,
                req.user?.userId,
                format
            );

            if (format === 'csv') {
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="analytics-${req.params.courseId}.csv"`);
                res.send(result.data);
            } else {
                res.json(result);
            }
        } catch (error) {
            next(error);
        }
    }

    static async exportAnalyticsSummary(req: Request, res: Response, next: NextFunction) {
        try {
            const format = (req.query.format as string) || 'json';
            
            if (!['json', 'csv'].includes(format)) {
                return res.status(400).json({ 
                    error: { 
                        code: 'INVALID_FORMAT', 
                        message: 'Format must be either json or csv' 
                    } 
                });
            }

            const result = await AnalyticsService.getAnalyticsSummary(
                req.params.courseId,
                req.user?.userId
            );

            if (format === 'csv') {
                const csvData = AnalyticsService.formatAnalyticsAsCSV(result.summary);
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename="analytics-summary-${req.params.courseId}.csv"`);
                res.send(csvData);
            } else {
                res.json(result);
            }
        } catch (error) {
            next(error);
        }
    }

    static async getChatSpaceAnalytics(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await AnalyticsService.getChatSpaceAnalytics(
                req.params.chatSpaceId,
                req.user?.userId,
                req.user?.role
            );
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async getGroupQualityStatus(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await AnalyticsService.getGroupQualityStatus(
                req.params.groupId,
                req.user?.userId
            );
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async getParticipantActivity(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await AnalyticsService.getParticipantActivity(
                req.params.groupId,
                req.user?.userId
            );
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    static async getRecentActivity(req: Request, res: Response, next: NextFunction) {
        try {
            const limit = parseInt(req.query.limit as string) || 5;
            const result = await AnalyticsService.getRecentActivity(
                req.user!.userId,
                limit
            );
            res.json({ data: result });
        } catch (error) {
            next(error);
        }
    }

    static async getDashboardCharts(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await AnalyticsService.getDashboardCharts(req.user!.userId);
            res.json({ data: result });
        } catch (error) {
            next(error);
        }
    }

    static async getAnalyticsOverview(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await AnalyticsService.getAnalyticsOverview(req.user!.userId);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
}
