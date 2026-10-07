import { Request, Response, NextFunction } from 'express';
import { StudentAnalyticsService } from '../services/student-analytics.service.js';
import { AnalyticsService } from '../services/analytics.service.js';
import prisma from '../config/database.js';

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

    static async getStudentStats(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = req.user?.userId;

            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const [activeGroups, reflections, chatMessages] = await Promise.all([
                prisma.groupMember.count({ where: { userId } }),
                prisma.reflection.count({ where: { userId } }),
                prisma.chatMessage.count({ where: { senderId: userId } }),
            ]);

            res.json({
                data: {
                    activeGroups,
                    reflections,
                    chatMessages,
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /** SRL Zimmerman pribadi mahasiswa (dari classifier AI engine). */
    static async getMySrl(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = req.user?.userId;

            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const srl = await AnalyticsService.getStudentSrl(userId);
            res.json({ data: srl });
        } catch (error) {
            next(error);
        }
    }

    static async getRecentActivity(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = req.user?.userId;

            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const limit = Math.min(Number(req.query.limit) || 5, 20);
            const activity = await AnalyticsService.getStudentRecentActivity(userId, limit);
            res.json({ data: activity });
        } catch (error) {
            next(error);
        }
    }
}
