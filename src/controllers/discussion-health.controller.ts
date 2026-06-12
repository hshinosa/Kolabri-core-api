import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { DiscussionHealthService } from '../services/discussion-health.service.js';

export class DiscussionHealthController {
  static async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
      }

      await DiscussionHealthService.assertLecturerAccess(req.user.userId, req.user.role);
      const result = await DiscussionHealthService.listForLecturer(
        req.user.userId,
        req.user.role
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
}