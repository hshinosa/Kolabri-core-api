import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { AccountDeletionService } from '../services/account-deletion.service.js';
import { runCleanupJobs } from '../jobs/cleanup-job.js';

export class AdminUserController {
    static async forceHardDelete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            if (!req.user) {
                return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
            }
            const { id } = req.params;
            const result = await AccountDeletionService.hardDeleteUserData(id);
            res.json({ data: result, meta: { message: 'User permanently deleted by admin' } });
        } catch (error) {
            next(error);
        }
    }

    static async triggerCleanup(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            if (!req.user) {
                return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
            }
            const result = await runCleanupJobs();
            res.json({ data: result, meta: { message: 'Cleanup jobs executed' } });
        } catch (error) {
            next(error);
        }
    }
}
