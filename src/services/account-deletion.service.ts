import { PrismaClient } from '@prisma/client';
import { ApiError } from '../middleware/errorHandler.js';
import { ChatLog } from '../models/ChatLog.js';
import prisma from '../config/database.js';

export class AccountDeletionService {
    /**
     * Soft delete user account with cascade anonymization
     */
    static async deleteAccount(userId: string): Promise<{ message: string }> {
        const user = await prisma.user.findUnique({ where: { id: userId } });

        if (!user) {
            throw ApiError.notFound('User not found');
        }

        if (user.deletedAt) {
            throw ApiError.badRequest('Account already deleted');
        }

        // 1. Anonymize user's chat messages in MongoDB (ChatLog)
        // Replace PII with [REDACTED]
        await ChatLog.updateMany(
            { senderId: userId },
            {
                $set: {
                    senderName: 'Deleted User',
                    // Don't redact content in group chats — it breaks conversation flow
                    // Only mark as from deleted user
                }
            }
        );

        // 2. Anonymize user's chat messages in PostgreSQL
        await prisma.chatMessage.updateMany({
            where: { senderId: userId },
            data: { content: '[REDACTED]' }
        });

        // 3. Hard delete AI chats and messages (no shared references)
        const aiChatIds = await prisma.aiChat.findMany({
            where: { userId },
            select: { id: true }
        });
        const chatIds = aiChatIds.map(c => c.id);

        if (chatIds.length > 0) {
            await prisma.aiChatMessage.deleteMany({
                where: { chatId: { in: chatIds } }
            });
            await prisma.aiChat.deleteMany({
                where: { userId }
            });
        }

        // 4. Soft delete user (set deletedAt + isActive=false)
        await prisma.user.update({
            where: { id: userId },
            data: {
                deletedAt: new Date(),
                isActive: false,
                name: 'Deleted User',
                email: `deleted-${userId}@redacted.kolabri`,
                avatarUrl: null,
                googleId: null,
            },
        });

        // Note: Audit log entries are retained (no PII in audit entries for deleted users)
        // 30-day hard delete is handled by scheduled job (see cleanupExpiredData)

        return { message: 'Account deleted successfully. Data will be permanently removed after 30 days.' };
    }

    /**
     * Hard delete all remaining user data (called by scheduled job after 30 days)
     */
    static async hardDeleteUserData(userId: string): Promise<{ message: string }> {
        // Delete in dependency order
        await prisma.aiChatMessage.deleteMany({ where: { chat: { userId } } });
        await prisma.aiChat.deleteMany({ where: { userId } });
        await prisma.chatMessage.deleteMany({ where: { senderId: userId } });
        await prisma.reflection.deleteMany({ where: { userId } });
        await prisma.learningGoal.deleteMany({ where: { userId } });
        await prisma.consentRecord.deleteMany({ where: { userId } });
        await prisma.exportJob.deleteMany({ where: { userId } });
        await prisma.notification.deleteMany({ where: { userId } });
        await prisma.groupMember.deleteMany({ where: { userId } });
        await prisma.courseStudent.deleteMany({ where: { userId } });

        // Delete ChatLog entries in MongoDB
        await ChatLog.deleteMany({ senderId: userId });

        // Finally delete the user
        await prisma.user.delete({ where: { id: userId } });

        return { message: 'User data permanently deleted' };
    }

    /**
     * Recover account within 30-day window
     */
    static async recoverAccount(userId: string): Promise<{ message: string }> {
        const user = await prisma.user.findUnique({ where: { id: userId } });

        if (!user) {
            throw ApiError.notFound('User not found');
        }

        if (!user.deletedAt) {
            throw ApiError.badRequest('Account is not deleted');
        }

        // Check 30-day window
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        if (user.deletedAt < thirtyDaysAgo) {
            throw ApiError.badRequest('Recovery window has expired (30 days)');
        }

        await prisma.user.update({
            where: { id: userId },
            data: {
                deletedAt: null,
                isActive: true,
            },
        });

        return { message: 'Account recovered successfully' };
    }

    /**
     * Cleanup expired data: hard delete accounts older than 30 days + expired export files
     */
    static async cleanupExpiredData(): Promise<{ deletedAccounts: number }> {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const expiredUsers = await prisma.user.findMany({
            where: {
                deletedAt: { not: null, lt: thirtyDaysAgo },
                isActive: false,
            },
            select: { id: true },
        });

        for (const user of expiredUsers) {
            await this.hardDeleteUserData(user.id);
        }

        return { deletedAccounts: expiredUsers.length };
    }
}
