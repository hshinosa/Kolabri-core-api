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
            const result = await AnalyticsService.exportProcessMining(
                req.params.courseId,
                req.user?.userId
            );
            res.json(result);
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
}
