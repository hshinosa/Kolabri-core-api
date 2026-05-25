import { Request, Response, NextFunction } from 'express';
import { UserPreferencesService } from '../services/user-preferences.service.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

export class UserPreferencesController {
    /**
     * GET /api/user/preferences
     * Get user preferences
     */
    static async get(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            if (!req.user) {
                return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
            }

            const result = await UserPreferencesService.get(req.user.userId);

            res.json({ data: result });
        } catch (error) {
            next(error);
        }
    }

    /**
     * PATCH /api/user/preferences
     * Update user preferences
     */
    static async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            if (!req.user) {
                return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
            }

            const result = await UserPreferencesService.update(req.user.userId, req.body);

            res.json({ data: result, meta: { message: 'Preferences updated' } });
        } catch (error) {
            next(error);
        }
    }
}
