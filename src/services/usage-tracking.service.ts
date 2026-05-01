import prisma from '../config/database.js';

export interface AiUsageData {
    userId: string;
    courseId?: string | null;
    provider: string;
    providerId?: string | null;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCost: number;
    latencyMs: number;
}

type UsageFilters = {
    userId?: string;
    courseId?: string;
    startDate?: string | Date;
    endDate?: string | Date;
};

type AiUsageRecord = {
    createdAt: Date;
    totalTokens: number;
};

const aiUsageDelegate = (prisma as unknown as {
    ['aiUsage']: {
        create: (args: unknown) => Promise<unknown>;
        aggregate: (args: unknown) => Promise<{
            _sum: {
                promptTokens: number | null;
                completionTokens: number | null;
                totalTokens: number | null;
                estimatedCost: number | null;
                latencyMs: number | null;
            };
            _avg: {
                latencyMs: number | null;
            };
            _count: {
                _all: number;
            };
        }>;
        groupBy: (args: unknown) => Promise<Array<{ model: string; _sum: { totalTokens: number | null } }>>;
        findMany: (args: unknown) => Promise<AiUsageRecord[]>;
    };
})['aiUsage'];

export class UsageTrackingService {
    async trackUsage(data: AiUsageData) {
        return aiUsageDelegate.create({
            data: {
                userId: data.userId,
                courseId: data.courseId ?? null,
                provider: data.provider,
                providerId: data.providerId ?? null,
                model: data.model,
                promptTokens: data.promptTokens,
                completionTokens: data.completionTokens,
                totalTokens: data.totalTokens,
                estimatedCost: data.estimatedCost,
                latencyMs: data.latencyMs,
            },
        });
    }

    async getUsageStats(filters: UsageFilters) {
        const where = this.buildWhere(filters);
        const [aggregate, byModel, dailyUsage] = await Promise.all([
            aiUsageDelegate.aggregate({
                where,
                _sum: {
                    promptTokens: true,
                    completionTokens: true,
                    totalTokens: true,
                    estimatedCost: true,
                    latencyMs: true,
                },
                _avg: {
                    latencyMs: true,
                },
                _count: {
                    _all: true,
                },
            }),
            aiUsageDelegate.groupBy({
                by: ['model'],
                where,
                _sum: { totalTokens: true },
                orderBy: {
                    _sum: { totalTokens: 'desc' },
                },
            }),
            aiUsageDelegate.findMany({
                where,
                select: {
                    createdAt: true,
                    totalTokens: true,
                },
                orderBy: { createdAt: 'asc' },
            }),
        ]);

        const usageByDate = dailyUsage.reduce<Record<string, number>>((acc: Record<string, number>, entry: AiUsageRecord) => {
            const key = entry.createdAt.toISOString().slice(0, 10);
            acc[key] = (acc[key] ?? 0) + entry.totalTokens;
            return acc;
        }, {});

        return {
            totalPromptTokens: aggregate._sum.promptTokens ?? 0,
            totalCompletionTokens: aggregate._sum.completionTokens ?? 0,
            totalTokens: aggregate._sum.totalTokens ?? 0,
            estimatedCost: aggregate._sum.estimatedCost ?? 0,
            averageLatency: Math.round(aggregate._avg.latencyMs ?? 0),
            requestCount: aggregate._count._all,
            mostUsedModel: byModel[0]?.model ?? null,
            usageByDate: Object.entries(usageByDate).map(([date, totalTokens]) => ({ date, totalTokens })),
        };
    }

    async getMonthlyReport(userId: string, month: number, year: number) {
        const startDate = new Date(Date.UTC(year, month - 1, 1));
        const endDate = new Date(Date.UTC(year, month, 1));

        const [stats, entries] = await Promise.all([
            this.getUsageStats({
                userId,
                startDate,
                endDate,
            }),
            aiUsageDelegate.findMany({
                where: {
                    userId,
                    createdAt: {
                        gte: startDate,
                        lt: endDate,
                    },
                },
                orderBy: { createdAt: 'desc' },
            }),
        ]);

        return {
            month,
            year,
            stats,
            entries,
        };
    }

    private buildWhere(filters: UsageFilters) {
        return {
            ...(filters.userId ? { userId: filters.userId } : {}),
            ...(filters.courseId ? { courseId: filters.courseId } : {}),
            ...((filters.startDate || filters.endDate)
                ? {
                      createdAt: {
                          ...(filters.startDate ? { gte: new Date(filters.startDate) } : {}),
                          ...(filters.endDate ? { lte: new Date(filters.endDate) } : {}),
                      },
                  }
                : {}),
        };
    }
}

export const usageTrackingService = new UsageTrackingService();
