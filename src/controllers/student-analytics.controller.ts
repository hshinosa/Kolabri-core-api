import { Request, Response, NextFunction } from 'express';
import { StudentAnalyticsService } from '../services/student-analytics.service.js';

export class StudentAnalyticsController {
    static async getStudentAnalytics(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = req.user?.userId;

            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const analytics = await StudentAnalyticsService.getStudentAnalytics(userId);
            res.json(analytics);
        } catch (error) {
            next(error);
        }
    }
}
