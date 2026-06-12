import { PrismaClient } from '@prisma/client';
import { ApiError } from '../middleware/errorHandler.js';

const prisma = new PrismaClient();

const VALID_CONSENT_TYPES = ['ai_interaction', 'data_analytics', 'data_sharing'] as const;
type ConsentType = (typeof VALID_CONSENT_TYPES)[number];

export class ConsentService {
    /**
     * Grant consent for a specific type. Idempotent.
     */
    static async grantConsent(userId: string, consentType: string) {
        if (!VALID_CONSENT_TYPES.includes(consentType as ConsentType)) {
            throw ApiError.badRequest('Invalid consent type', {
                allowedTypes: VALID_CONSENT_TYPES,
            });
        }

        const activeGrant = await prisma.consentRecord.findFirst({
            where: {
                userId,
                consentType,
                granted: true,
                revokedAt: null,
            },
            orderBy: { grantedAt: 'desc' },
        });

        if (activeGrant) {
            return activeGrant;
        }

        const record = await prisma.consentRecord.create({
            data: {
                userId,
                consentType,
                granted: true,
                grantedAt: new Date(),
            },
        });

        return record;
    }

    /**
     * Revoke consent for a specific type. Idempotent.
     */
    static async revokeConsent(userId: string, consentType: string) {
        if (!VALID_CONSENT_TYPES.includes(consentType as ConsentType)) {
            throw ApiError.badRequest('Invalid consent type', {
                allowedTypes: VALID_CONSENT_TYPES,
            });
        }

        const activeGrant = await prisma.consentRecord.findFirst({
            where: {
                userId,
                consentType,
                granted: true,
                revokedAt: null,
            },
            orderBy: { grantedAt: 'desc' },
        });

        if (activeGrant) {
            await prisma.consentRecord.update({
                where: { id: activeGrant.id },
                data: { revokedAt: new Date() },
            });
        }

        return { success: true };
    }

    /**
     * Get consent records for a user.
     * currentOnly=true returns only active grants grouped by consentType.
     */
    static async getConsents(userId: string, currentOnly?: boolean) {
        if (currentOnly) {
            const activeGrants = await prisma.consentRecord.findMany({
                where: {
                    userId,
                    granted: true,
                    revokedAt: null,
                },
                orderBy: { grantedAt: 'desc' },
            });

            const grouped: Record<string, (typeof activeGrants)[number][]> = {};
            for (const grant of activeGrants) {
                if (!grouped[grant.consentType]) {
                    grouped[grant.consentType] = [];
                }
                grouped[grant.consentType].push(grant);
            }

            return grouped;
        }

        const history = await prisma.consentRecord.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
        });

        return history;
    }
}
