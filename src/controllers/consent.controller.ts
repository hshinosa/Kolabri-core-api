import { Response, NextFunction } from 'express';
import { ConsentService } from '../services/consent.service.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

export class ConsentController {
    /**
     * POST /api/consent/grant
     * Grant consent for a specific type
     */
    static async grant(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            if (!req.user) {
                return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
            }

            const { consentType } = req.body;
            const record = await ConsentService.grantConsent(req.user.userId, consentType);

            res.json({ data: record, meta: { message: 'Consent granted' } });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/consent/revoke
     * Revoke consent for a specific type
     */
    static async revoke(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            if (!req.user) {
                return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
            }

            const { consentType } = req.body;
            await ConsentService.revokeConsent(req.user.userId, consentType);

            res.json({ data: { success: true }, meta: { message: 'Consent revoked' } });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/consent
     * List consent records for the authenticated user
     */
    static async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            if (!req.user) {
                return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
            }

            const currentOnly = req.query.current === 'true';
            const records = await ConsentService.getConsents(req.user.userId, currentOnly);

            res.json({ data: records });
        } catch (error) {
            next(error);
        }
    }
}
