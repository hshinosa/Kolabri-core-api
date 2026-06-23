import { Response, NextFunction } from 'express';
import { GoalService } from '../services/goal.service.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

export class GoalController {
    /**
     * POST /api/goals
     * Submit a learning goal (student only)
     */
    static async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const goal = await GoalService.createGoal(req.body, req.user!.userId);

            res.status(201).json({
                data: goal,
                meta: {
                    message: 'Goal submitted successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/goals/session-discussion/:sessionDiscussionId
     * Get goals for a session discussion
     */
    static async getSessionDiscussionGoals(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const goals = await GoalService.getSessionDiscussionGoals(
                req.params.sessionDiscussionId,
                req.user!.userId,
                req.user!.role
            );

            res.json({
                data: goals,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/goals/me
     * Get my goals
     */
    static async getMyGoals(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const goals = await GoalService.getMyGoals(req.user!.userId);

            res.json({
                data: goals,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/goals/:id
     * Get goal details
     */
    static async show(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const goal = await GoalService.getGoalDetails(
                req.params.id,
                req.user!.userId,
                req.user!.role
            );

            res.json({
                data: goal,
            });
        } catch (error) {
            next(error);
        }
    }
}
