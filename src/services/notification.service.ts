import { PrismaClient, NotificationType } from '@prisma/client';
import { ApiError } from '../middleware/errorHandler.js';

const prisma = new PrismaClient();

export class NotificationService {
    /**
     * Get user notifications
     */
    static async list(userId: string, limit: number = 10) {
        const notifications = await prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });

        const unreadCount = await prisma.notification.count({
            where: { userId, isRead: false },
        });

        return { notifications, unreadCount };
    }

    /**
     * Mark notification as read
     */
    static async markRead(notificationId: string, userId: string): Promise<{ message: string }> {
        const notification = await prisma.notification.findUnique({
            where: { id: notificationId },
        });

        if (!notification || notification.userId !== userId) {
            throw ApiError.notFound('Notification not found');
        }

        await prisma.notification.update({
            where: { id: notificationId },
            data: { isRead: true, readAt: new Date() },
        });

        return { message: 'Notification marked as read' };
    }

    /**
     * Mark all notifications as read
     */
    static async markAllRead(userId: string): Promise<{ message: string }> {
        await prisma.notification.updateMany({
            where: { userId, isRead: false },
            data: { isRead: true, readAt: new Date() },
        });

        return { message: 'All notifications marked as read' };
    }

    static async create(
        userId: string,
        type: NotificationType,
        title: string,
        message: string
    ) {
        return prisma.notification.create({
            data: { userId, type, title, message },
        });
    }
}
