import { PrismaClient } from '@prisma/client';
import { ApiError } from '../middleware/errorHandler.js';

const prisma = new PrismaClient();

interface UserPreferences {
    themePreference?: string;
    languagePreference?: string;
}

export class UserPreferencesService {
    /**
     * Get user preferences
     */
    static async get(userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                themePreference: true,
                languagePreference: true,
            },
        });

        if (!user) {
            throw ApiError.notFound('User not found');
        }

        return user;
    }

    /**
     * Update user preferences
     */
    static async update(userId: string, preferences: UserPreferences) {
        const user = await prisma.user.findUnique({ where: { id: userId } });

        if (!user) {
            throw ApiError.notFound('User not found');
        }

        const updated = await prisma.user.update({
            where: { id: userId },
            data: preferences,
            select: {
                themePreference: true,
                languagePreference: true,
            },
        });

        return updated;
    }
}
