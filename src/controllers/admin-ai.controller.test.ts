import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAiService, mockUsageTrackingService } = vi.hoisted(() => ({
    mockAiService: {
        compareModels: vi.fn(),
    },
    mockUsageTrackingService: {
        getUsageStats: vi.fn(),
        getMonthlyReport: vi.fn(),
    },
}));

vi.mock('../services/ai.service.js', () => ({
    aiService: mockAiService,
}));

vi.mock('../services/usage-tracking.service.js', () => ({
    usageTrackingService: mockUsageTrackingService,
}));

import { AdminAiController } from './admin-ai.controller.js';

function mockReq(overrides: Partial<Request> = {}) {
    return {
        body: {},
        params: {},
        query: {},
        user: {
            userId: 'user-1',
            role: 'admin',
            email: 'admin@example.com',
        },
        ...overrides,
    } as Partial<Request>;
}

function mockRes(): Partial<Response> {
    const res: Partial<Response> & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } = {
        status: vi.fn(),
        json: vi.fn(),
    };
    res.status.mockReturnValue(res as Response);
    res.json.mockReturnValue(res as Response);
    return res;
}

function mockNext(): NextFunction {
    return vi.fn() as unknown as NextFunction;
}

describe('AdminAiController', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns usage stats from query filters', async () => {
        const stats = { totalRequests: 12 };
        mockUsageTrackingService.getUsageStats.mockResolvedValue(stats);
        const req = mockReq({ query: { month: '5', year: '2026' } });
        const res = mockRes();
        const next = mockNext();

        await AdminAiController.getUsageStats(req as Request, res as Response, next);

        expect(mockUsageTrackingService.getUsageStats).toHaveBeenCalledWith(req.query);
        expect(res.json).toHaveBeenCalledWith({ data: stats });
        expect(next).not.toHaveBeenCalled();
    });

    it('returns a monthly usage report from route params', async () => {
        const report = { month: '5', year: '2026', usage: [] };
        mockUsageTrackingService.getMonthlyReport.mockResolvedValue(report);
        const req = mockReq({ params: { userId: 'user-2', month: '5', year: '2026' } });
        const res = mockRes();
        const next = mockNext();

        await AdminAiController.getUsageReport(req as Request, res as Response, next);

        expect(mockUsageTrackingService.getMonthlyReport).toHaveBeenCalledWith('user-2', '5', '2026');
        expect(res.json).toHaveBeenCalledWith({ data: report });
        expect(next).not.toHaveBeenCalled();
    });

    it('compares AI models with the authenticated user as creator', async () => {
        const result = [{ model: 'gpt-4o', response: 'hello' }];
        mockAiService.compareModels.mockResolvedValue(result);
        const req = mockReq({ body: { prompt: 'Explain AI', models: ['gpt-4o', 'gemini-2.5'] } });
        const res = mockRes();
        const next = mockNext();

        await AdminAiController.compareModels(req as Request, res as Response, next);

        expect(mockAiService.compareModels).toHaveBeenCalledWith({
            prompt: 'Explain AI',
            models: ['gpt-4o', 'gemini-2.5'],
            createdBy: 'user-1',
        });
        expect(res.json).toHaveBeenCalledWith({
            data: result,
            meta: { message: 'AI model comparison completed successfully' },
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('forwards compare model errors to next', async () => {
        const error = new Error('comparison failed');
        mockAiService.compareModels.mockRejectedValue(error);
        const req = mockReq({ body: { prompt: 'Explain AI', models: ['gpt-4o'] } });
        const res = mockRes();
        const next = mockNext();

        await AdminAiController.compareModels(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith(error);
    });
});
