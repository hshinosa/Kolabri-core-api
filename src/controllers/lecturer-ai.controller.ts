import { NextFunction, Response } from 'express';

import { AuthenticatedRequest } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import prisma from '../config/database.js';
import { aiService } from '../services/ai.service.js';
import { usageTrackingService } from '../services/usage-tracking.service.js';
import {
    CourseContextParams,
    CourseContextQuery,
    HistoryQuery,
    PreviewRequest,
} from '../validators/lecturer-ai.validator.js';

export class LecturerAiController {
    static async preview(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const input = req.body as PreviewRequest;
            const userId = req.user!.userId;

            const result = await aiService.sendWithConfiguredFallback(input.prompt, {
                userId,
                courseId: input.courseId ?? null,
                systemPrompt: input.systemPrompt,
                temperature: input.temperature,
                maxTokens: input.maxTokens,
                model: input.model,
            });

            res.json({
                data: {
                    response: result.response,
                    provider: result.provider,
                    model: result.model,
                    promptTokens: result.promptTokens,
                    completionTokens: result.completionTokens,
                    totalTokens: result.totalTokens,
                    latencyMs: result.latencyMs,
                    estimatedCost: result.estimatedCost,
                },
            });
        } catch (error) {
            next(error);
        }
    }

    static async getCourseContext(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const { courseId } = req.params as unknown as CourseContextParams;
            const query = (req.query as unknown as CourseContextQuery) ?? {};
            const userId = req.user!.userId;

            const course = await prisma.course.findFirst({
                where: { id: courseId, ownerId: userId, deletedAt: null },
                select: {
                    id: true,
                    name: true,
                    code: true,
                    description: true,
                    knowledgeBases: query.includeKnowledgeBase
                        ? { select: { id: true, fileName: true } }
                        : false,
                    students: query.includeStudents
                        ? { select: { id: true, user: { select: { id: true, name: true, email: true } } } }
                        : false,
                },
            });

            if (!course) {
                throw ApiError.notFound('Course not found');
            }

            res.json({ data: course });
        } catch (error) {
            next(error);
        }
    }

    static async getHistory(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const query = req.query as unknown as HistoryQuery;
            const userId = req.user!.userId;

            const where: Record<string, unknown> = { userId };

            if (query.courseId) where.courseId = query.courseId;
            if (query.studentId) where.userId = query.studentId;
            if (query.provider) where.provider = query.provider;

            if (query.startDate || query.endDate) {
                where.createdAt = {
                    ...(query.startDate && { gte: new Date(query.startDate) }),
                    ...(query.endDate && { lte: new Date(query.endDate) }),
                };
            }

            const skip = (query.page - 1) * query.limit;

            const [records, total] = await Promise.all([
                prisma.aiUsage.findMany({
                    where,
                    orderBy: { createdAt: 'desc' },
                    skip,
                    take: query.limit,
                }),
                prisma.aiUsage.count({ where }),
            ]);

            res.json({
                data: records,
                meta: {
                    total,
                    page: query.page,
                    limit: query.limit,
                    totalPages: Math.ceil(total / query.limit),
                },
            });
        } catch (error) {
            next(error);
        }
    }

    static async archiveHistory(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const userId = req.user!.userId;
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - 90);

            const oldRecords = await prisma.aiUsage.findMany({
                where: {
                    userId,
                    createdAt: { lt: cutoffDate },
                },
            });

            res.json({
                data: {
                    archivedCount: oldRecords.length,
                    cutoffDate: cutoffDate.toISOString(),
                },
                meta: { message: 'Archive query completed. Records identified for archival.' },
            });
        } catch (error) {
            next(error);
        }
    }
}
