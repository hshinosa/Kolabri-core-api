import { Request, Response, NextFunction } from 'express';
import { AccountDeletionService } from '../services/account-deletion.service.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

export class AccountDeletionController {
    /**
     * DELETE /api/user/account
     * Soft delete user account
     */
    static async deleteAccount(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            if (!req.user) {
                return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
            }

            const result = await AccountDeletionService.deleteAccount(req.user.userId);

            res.json({ data: result, meta: { message: 'Account deleted successfully' } });
        } catch (error) {
            next(error);
        }
    }
}
