import { NextFunction, Response } from 'express';

import { AuthenticatedRequest } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import prisma from '../config/database.js';
import { aiService } from '../services/ai.service.js';
import { usageTrackingService } from '../services/usage-tracking.service.js';
import {
    AbTestCreateInput,
    AbTestListQuery,
    AbTestParams,
    AbTestUpdateInput,
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

    static async listAbTests(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const query = req.query as unknown as AbTestListQuery;
            const userId = req.user!.userId;

            const where: Record<string, unknown> = { createdBy: userId };
            if (query.courseId) where.courseId = query.courseId;
            if (query.status) where.status = query.status;

            const skip = (query.page - 1) * query.limit;

            const [tests, total] = await Promise.all([
                prisma.aiAbTest.findMany({
                    where,
                    include: {
                        _count: { select: { results: true } },
                    },
                    orderBy: { createdAt: 'desc' },
                    skip,
                    take: query.limit,
                }),
                prisma.aiAbTest.count({ where }),
            ]);

            res.json({
                data: tests,
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

    static async createAbTest(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const input = req.body as AbTestCreateInput;
            const userId = req.user!.userId;

            const course = await prisma.course.findFirst({
                where: { id: input.courseId, ownerId: userId, deletedAt: null },
                select: { id: true },
            });

            if (!course) {
                throw ApiError.notFound('Course not found');
            }

            const test = await prisma.aiAbTest.create({
                data: {
                    name: input.name,
                    description: input.description ?? null,
                    courseId: input.courseId,
                    createdBy: userId,
                    variantA: input.variantA,
                    variantB: input.variantB,
                    status: 'draft',
                },
            });

            res.status(201).json({ data: test });
        } catch (error) {
            next(error);
        }
    }

    static async getAbTest(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const { testId } = req.params as unknown as AbTestParams;
            const userId = req.user!.userId;

            const test = await prisma.aiAbTest.findFirst({
                where: { id: testId, createdBy: userId },
                include: {
                    results: { orderBy: { assignedAt: 'desc' }, take: 50 },
                    _count: { select: { results: true } },
                },
            });

            if (!test) {
                throw ApiError.notFound('A/B test not found');
            }

            res.json({ data: test });
        } catch (error) {
            next(error);
        }
    }

    static async updateAbTest(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const { testId } = req.params as unknown as AbTestParams;
            const input = req.body as AbTestUpdateInput;
            const userId = req.user!.userId;

            const existing = await prisma.aiAbTest.findFirst({
                where: { id: testId, createdBy: userId },
            });

            if (!existing) {
                throw ApiError.notFound('A/B test not found');
            }

            const test = await prisma.aiAbTest.update({
                where: { id: testId },
                data: input,
            });

            res.json({ data: test });
        } catch (error) {
            next(error);
        }
    }

    static async deleteAbTest(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const { testId } = req.params as unknown as AbTestParams;
            const userId = req.user!.userId;

            const existing = await prisma.aiAbTest.findFirst({
                where: { id: testId, createdBy: userId },
            });

            if (!existing) {
                throw ApiError.notFound('A/B test not found');
            }

            await prisma.aiAbTest.delete({ where: { id: testId } });

            res.json({ meta: { message: 'A/B test deleted' } });
        } catch (error) {
            next(error);
        }
    }

    static async getAbTestStats(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const { testId } = req.params as unknown as AbTestParams;
            const userId = req.user!.userId;

            const test = await prisma.aiAbTest.findFirst({
                where: { id: testId, createdBy: userId },
                include: { results: true },
            });

            if (!test) {
                throw ApiError.notFound('A/B test not found');
            }

            const variantA = test.results.filter((r: any) => r.variant === 'A');
            const variantB = test.results.filter((r: any) => r.variant === 'B');

            const calcStats = (records: any[]) => {
                if (records.length === 0) return { count: 0, avgLatency: 0, avgTokens: 0, avgCost: 0 };
                return {
                    count: records.length,
                    avgLatency: Math.round(records.reduce((s, r) => s + r.latencyMs, 0) / records.length),
                    avgTokens: Math.round(records.reduce((s, r) => s + r.totalTokens, 0) / records.length),
                    avgCost: Number((records.reduce((s, r) => s + r.estimatedCost, 0) / records.length).toFixed(6)),
                };
            };

            res.json({
                data: {
                    testId: test.id,
                    name: test.name,
                    status: test.status,
                    totalResults: test.results.length,
                    variantA: calcStats(variantA),
                    variantB: calcStats(variantB),
                    minResultsPerVariant: 30,
                    readyForAnalysis: variantA.length >= 30 && variantB.length >= 30,
                },
            });
        } catch (error) {
            next(error);
        }
    }

    static async assignAbTestVariant(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const { testId } = req.params as unknown as AbTestParams;
            const userId = req.user!.userId;

            const test = await prisma.aiAbTest.findFirst({
                where: { id: testId, createdBy: userId, status: 'active' },
            });

            if (!test) {
                throw ApiError.notFound('Active A/B test not found');
            }

            const existingAssignment = await prisma.aiAbTestResult.findFirst({
                where: { testId, userId },
            });

            if (existingAssignment) {
                res.json({ data: { variant: existingAssignment.variant, alreadyAssigned: true } });
                return;
            }

            const variant = Math.random() < 0.5 ? 'A' : 'B';

            const result = await prisma.aiAbTestResult.create({
                data: {
                    testId,
                    userId,
                    variant,
                    promptTokens: 0,
                    completionTokens: 0,
                    totalTokens: 0,
                    estimatedCost: 0,
                    latencyMs: 0,
                },
            });

            res.json({ data: { variant: result.variant, alreadyAssigned: false } });
        } catch (error) {
            next(error);
        }
    }
}
