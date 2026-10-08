import { Response, NextFunction } from 'express';
import { SessionDiscussionService } from '../services/sessionDiscussion.service.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

export class SessionDiscussionController {
    /**
     * POST /api/session-discussions/:id/close
     * Close a chat session (lecturer only)
     */
    static async close(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const result = await SessionDiscussionService.closeSession(
                req.params.id,
                req.user!.userId,
                req.user!.role
            );

            res.json({
                data: result,
                meta: {
                    message: 'Session closed successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/session-discussions/:id/reopen
     * Reopen a chat session (lecturer only)
     */
    static async reopen(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const result = await SessionDiscussionService.reopenSession(
                req.params.id,
                req.user!.userId,
                req.user!.role
            );

            res.json({
                data: result,
                meta: {
                    message: 'Session reopened successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/session-discussions/:id/status
     * Get session discussion status including reflection requirement
     */
    static async getStatus(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const status = await SessionDiscussionService.getSessionDiscussionStatus(
                req.params.id,
                req.user!.userId,
                req.user!.role
            );

            res.json({
                data: status,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/session-discussions/:id/reflection
     * Submit session reflection
     */
    static async submitReflection(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const reflection = await SessionDiscussionService.submitSessionReflection(
                req.params.id,
                req.body.content,
                req.user!.userId
            );

            res.status(201).json({
                data: reflection,
                meta: {
                    message: 'Reflection submitted successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    static async getSummary(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const result = await SessionDiscussionService.getSummary(
                req.params.id,
                req.user!.userId,
                req.user!.role
            );
            res.json({
                summary: result.summary,
                generatedAt: result.generatedAt,
                goalAssessment: result.goalAssessment ?? null,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/session-discussions/:id/regenerate-summary
     * Regenerate summary when initial generation failed
     */
    static async regenerateSummary(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const result = await SessionDiscussionService.regenerateSummary(
                req.params.id,
                req.user!.userId,
                req.user!.role
            );
            res.json({ data: result });
        } catch (error) {
            next(error);
        }
    }
    /**
     * POST /api/session-discussions/bulk-close
     * Close multiple sessions at once (lecturer only)
     */
    static async bulkClose(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const { sessionDiscussionIds } = req.body as { sessionDiscussionIds: string[] };
            const results: Array<{ id: string; success: boolean; error?: string; attendanceData?: unknown }> = [];

            for (const id of sessionDiscussionIds) {
                try {
                    const result = await SessionDiscussionService.closeSession(id, req.user!.userId, req.user!.role);
                    results.push({ id, success: true, attendanceData: (result as { attendanceData?: unknown }).attendanceData });
                } catch (error) {
                    results.push({ id, success: false, error: error instanceof Error ? error.message : 'Unknown error' });
                }
            }

            res.json({ results });
        } catch (error) {
            next(error);
        }
    }
}
