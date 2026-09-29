import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { AccountDeletionService } from '../services/account-deletion.service.js';

export class AdminUserController {
    static async forceHardDelete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            if (!req.user) {
                return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
            }
            const { id } = req.params;
            if (id === req.user.userId) {
                return res.status(403).json({
                    error: { code: 'FORBIDDEN', message: 'Cannot delete your own account' },
                });
            }
            const result = await AccountDeletionService.hardDeleteUserData(id);
            res.json({ data: result, meta: { message: 'User permanently deleted by admin' } });
        } catch (error) {
            next(error);
        }
    }

}
