import { Response, NextFunction } from 'express';
import { ChatSpaceService } from '../services/chatSpace.service.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

export class ChatSpaceController {
    /**
     * POST /api/chat-spaces/:id/close
     * Close a chat session (lecturer only)
     */
    static async close(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const result = await ChatSpaceService.closeSession(
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
     * POST /api/chat-spaces/:id/reopen
     * Reopen a chat session (lecturer only)
     */
    static async reopen(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const result = await ChatSpaceService.reopenSession(
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
     * GET /api/chat-spaces/:id/status
     * Get chat space status including reflection requirement
     */
    static async getStatus(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const status = await ChatSpaceService.getChatSpaceStatus(
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
     * POST /api/chat-spaces/:id/reflection
     * Submit session reflection
     */
    static async submitReflection(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const reflection = await ChatSpaceService.submitSessionReflection(
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
            const result = await ChatSpaceService.getSummary(
                req.params.id,
                req.user!.userId,
                req.user!.role
            );
            res.json({
                summary: result.summary,
                generatedAt: result.generatedAt,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/chat-spaces/:id/regenerate-summary
     * Regenerate summary when initial generation failed
     */
    static async regenerateSummary(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const result = await ChatSpaceService.regenerateSummary(
                req.params.id,
                req.user!.userId,
                req.user!.role
            );
            res.json({ data: result });
        } catch (error) {
            next(error);
        }
    }
}
