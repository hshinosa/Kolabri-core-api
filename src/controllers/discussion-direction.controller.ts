import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import { DiscussionDirectionService } from '../services/discussion-direction.service.js';

export class DiscussionDirectionController {
  /**
   * POST /api/discussion-direction/classify
   * Batch classify messages against learning goal
   */
  static async classify(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { messages, goal } = req.body;

      if (!messages || !Array.isArray(messages)) {
        return next(ApiError.badRequest('Messages array is required'));
      }

      if (!goal || typeof goal !== 'string') {
        return next(ApiError.badRequest('Goal string is required'));
      }

      const classifications =
        await DiscussionDirectionService.classifyMessages(messages, goal);

      res.json({
        data: { classifications },
        meta: {
          message: 'Messages classified successfully',
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/discussion-direction/summary
   * Generate session summary using AI
   */
  static async summary(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { messages, goal, stats } = req.body;

      if (!messages || !Array.isArray(messages)) {
        return next(ApiError.badRequest('Messages array is required'));
      }

      if (!goal || typeof goal !== 'string') {
        return next(ApiError.badRequest('Goal string is required'));
      }

      if (!stats || typeof stats !== 'object') {
        return next(ApiError.badRequest('Stats object is required'));
      }

      const summary = await DiscussionDirectionService.generateSessionSummary(
        messages,
        goal,
        stats
      );

      res.json({
        data: summary,
        meta: {
          message: 'Session summary generated successfully',
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
