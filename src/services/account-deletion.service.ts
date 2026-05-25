import { PrismaClient } from '@prisma/client';
import { ApiError } from '../middleware/errorHandler.js';

const prisma = new PrismaClient();

export class AccountDeletionService {
    /**
     * Soft delete user account
     */
    static async deleteAccount(userId: string): Promise<{ message: string }> {
        const user = await prisma.user.findUnique({ where: { id: userId } });

        if (!user) {
            throw ApiError.notFound('User not found');
        }

        if (user.deletedAt) {
            throw ApiError.badRequest('Account already deleted');
        }

        await prisma.user.update({
            where: { id: userId },
            data: {
                deletedAt: new Date(),
                isActive: false,
            },
        });

        return { message: 'Account deleted successfully' };
    }
}
