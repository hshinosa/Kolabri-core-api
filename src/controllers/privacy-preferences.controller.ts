import { Response, NextFunction } from 'express';
import { PrivacyPreferencesService } from '../services/privacy-preferences.service.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

export class PrivacyPreferencesController {
    /**
     * GET /api/user/privacy-preferences
     * Get user privacy preferences
     */
    static async get(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            if (!req.user) {
                return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
            }

            const result = await PrivacyPreferencesService.get(req.user.userId);

            res.json({ data: result });
        } catch (error) {
            next(error);
        }
    }

    /**
     * PUT /api/user/privacy-preferences
     * Update user privacy preferences
     */
    static async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            if (!req.user) {
                return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
            }

            const result = await PrivacyPreferencesService.update(req.user.userId, req.body);

            res.json({ data: result, meta: { message: 'Privacy preferences updated' } });
        } catch (error) {
            next(error);
        }
    }
}
