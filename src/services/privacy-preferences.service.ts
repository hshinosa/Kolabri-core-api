import { PrismaClient } from '@prisma/client';
import { ApiError } from '../middleware/errorHandler.js';

const prisma = new PrismaClient();

interface PrivacyPreferencesInput {
    analyticsVisibility?: boolean;
    aiInteractionConsent?: boolean;
    dataSharingConsent?: boolean;
}

export class PrivacyPreferencesService {
    /**
     * Get user privacy preferences
     */
    static async get(userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                analyticsVisibility: true,
                aiInteractionConsent: true,
                dataSharingConsent: true,
            },
        });

        if (!user) {
            throw ApiError.notFound('User not found');
        }

        return user;
    }

    /**
     * Update user privacy preferences
     */
    static async update(userId: string, prefs: PrivacyPreferencesInput) {
        const user = await prisma.user.findUnique({ where: { id: userId } });

        if (!user) {
            throw ApiError.notFound('User not found');
        }

        const data: Record<string, boolean> = {};
        for (const [key, value] of Object.entries(prefs)) {
            if (value !== undefined) {
                if (typeof value !== 'boolean') {
                    throw ApiError.badRequest(`Field ${key} must be a boolean`);
                }
                data[key] = value;
            }
        }

        const updated = await prisma.user.update({
            where: { id: userId },
            data,
            select: {
                analyticsVisibility: true,
                aiInteractionConsent: true,
                dataSharingConsent: true,
            },
        });

        return updated;
    }
}
