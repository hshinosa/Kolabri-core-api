import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
    prismaMock: {
        aiUsage: { create: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn(), findMany: vi.fn() },
    },
}));

vi.mock('../config/database.js', () => ({
    default: prismaMock,
}));

import { UsageTrackingService } from './usage-tracking.service.js';

describe('UsageTrackingService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('tracks ai usage with normalized nullable fields', async () => {
        prismaMock.aiUsage.create.mockResolvedValue({ id: 'usage-1' });
        const service = new UsageTrackingService();

        await service.trackUsage({
            userId: 'user-1',
            courseId: undefined,
            provider: 'openai',
            providerId: undefined,
            model: 'gpt-4.1-mini',
            promptTokens: 100,
            completionTokens: 40,
            totalTokens: 140,
            estimatedCost: 0.02,
            latencyMs: 250,
        });

        expect(prismaMock.aiUsage.create).toHaveBeenCalledWith({
            data: {
                userId: 'user-1',
                courseId: null,
                provider: 'openai',
                providerId: null,
                model: 'gpt-4.1-mini',
                promptTokens: 100,
                completionTokens: 40,
                totalTokens: 140,
                estimatedCost: 0.02,
                latencyMs: 250,
            },
        });
    });

    it('aggregates usage stats by totals, average latency, model, and date', async () => {
        const service = new UsageTrackingService();
        prismaMock.aiUsage.aggregate.mockResolvedValue({
            _sum: { promptTokens: 300, completionTokens: 150, totalTokens: 450, estimatedCost: 1.25, latencyMs: 600 },
            _avg: { latencyMs: 201.6 },
            _count: { _all: 3 },
        });
        prismaMock.aiUsage.groupBy.mockResolvedValue([{ model: 'gpt-4.1-mini', _sum: { totalTokens: 300 } }]);
        prismaMock.aiUsage.findMany.mockResolvedValue([
            { createdAt: new Date('2026-05-01T00:00:00.000Z'), totalTokens: 100 },
            { createdAt: new Date('2026-05-01T12:00:00.000Z'), totalTokens: 150 },
            { createdAt: new Date('2026-05-02T00:00:00.000Z'), totalTokens: 200 },
        ]);

        const result = await service.getUsageStats({ userId: 'user-1', startDate: '2026-05-01', endDate: '2026-05-02' });

        expect(result).toEqual({
            totalPromptTokens: 300,
            totalCompletionTokens: 150,
            totalTokens: 450,
            estimatedCost: 1.25,
            averageLatency: 202,
            requestCount: 3,
            mostUsedModel: 'gpt-4.1-mini',
            usageByDate: [
                { date: '2026-05-01', totalTokens: 250 },
                { date: '2026-05-02', totalTokens: 200 },
            ],
        });
    });

    it('returns a monthly report with stats and latest entries', async () => {
        const service = new UsageTrackingService();
        vi.spyOn(service, 'getUsageStats').mockResolvedValue({
            totalPromptTokens: 100,
            totalCompletionTokens: 50,
            totalTokens: 150,
            estimatedCost: 0.5,
            averageLatency: 180,
            requestCount: 2,
            mostUsedModel: 'gpt-4.1-mini',
            usageByDate: [],
        });
        prismaMock.aiUsage.findMany.mockResolvedValue([{ id: 'usage-1' }, { id: 'usage-2' }]);

        const result = await service.getMonthlyReport('user-1', 5, 2026);

        expect(prismaMock.aiUsage.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ userId: 'user-1' }),
                orderBy: { createdAt: 'desc' },
            })
        );
        expect(result).toEqual({
            month: 5,
            year: 2026,
            stats: {
                totalPromptTokens: 100,
                totalCompletionTokens: 50,
                totalTokens: 150,
                estimatedCost: 0.5,
                averageLatency: 180,
                requestCount: 2,
                mostUsedModel: 'gpt-4.1-mini',
                usageByDate: [],
            },
            entries: [{ id: 'usage-1' }, { id: 'usage-2' }],
        });
    });
});
