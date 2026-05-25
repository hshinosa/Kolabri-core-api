import { Request, Response, NextFunction } from 'express';
import { NotificationService } from '../services/notification.service.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

export class NotificationController {
    static async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            if (!req.user) {
                return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
            }

            const limit = parseInt(req.query.limit as string) || 10;
            const notifications = await NotificationService.list(req.user.userId, limit);

            res.json({ data: notifications });
        } catch (error) {
            next(error);
        }
    }

    static async markRead(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            if (!req.user) {
                return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
            }

            const { id } = req.params;
            const notification = await NotificationService.markRead(id, req.user.userId);

            res.json({ data: notification, meta: { message: 'Notification marked as read' } });
        } catch (error) {
            next(error);
        }
    }

    static async markAllRead(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            if (!req.user) {
                return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
            }

            const updateCount = await NotificationService.markAllRead(req.user.userId);

            res.json({ data: updateCount, meta: { message: 'All notifications marked as read' } });
        } catch (error) {
            next(error);
        }
    }
}
