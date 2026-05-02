import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDashboardService } = vi.hoisted(() => ({
    mockDashboardService: {
        getStats: vi.fn(),
        getActivityFeed: vi.fn(),
        getUserGrowthChart: vi.fn(),
        getMessageActivityChart: vi.fn(),
    },
}));

vi.mock('../services/dashboard.service.js', () => ({
    DashboardService: mockDashboardService,
}));

import { DashboardController } from './dashboard.controller.js';

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

describe('DashboardController', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns dashboard stats', async () => {
        const stats = { users: 10, courses: 5 };
        mockDashboardService.getStats.mockResolvedValue(stats);
        const req = mockReq();
        const res = mockRes();
        const next = mockNext();

        await DashboardController.getStats(req as Request, res as Response, next);

        expect(mockDashboardService.getStats).toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({ data: stats });
        expect(next).not.toHaveBeenCalled();
    });

    it('returns activity feed data with meta', async () => {
        const result = { data: [{ id: 'activity-1' }], meta: { total: 1 } };
        mockDashboardService.getActivityFeed.mockResolvedValue(result);
        const req = mockReq({ query: { limit: '10' } });
        const res = mockRes();
        const next = mockNext();

        await DashboardController.getActivityFeed(req as Request, res as Response, next);

        expect(mockDashboardService.getActivityFeed).toHaveBeenCalledWith(req.query);
        expect(res.json).toHaveBeenCalledWith({ data: result.data, meta: result.meta });
        expect(next).not.toHaveBeenCalled();
    });

    it('returns user growth chart for the requested period', async () => {
        const chart = [{ label: 'May', value: 10 }];
        mockDashboardService.getUserGrowthChart.mockResolvedValue(chart);
        const req = mockReq({ query: { period: 'monthly' } });
        const res = mockRes();
        const next = mockNext();

        await DashboardController.getUserGrowthChart(req as Request, res as Response, next);

        expect(mockDashboardService.getUserGrowthChart).toHaveBeenCalledWith('monthly');
        expect(res.json).toHaveBeenCalledWith({ data: chart });
        expect(next).not.toHaveBeenCalled();
    });

    it('forwards message activity chart errors to next', async () => {
        const error = new Error('chart failed');
        mockDashboardService.getMessageActivityChart.mockRejectedValue(error);
        const req = mockReq({ query: { period: 'weekly' } });
        const res = mockRes();
        const next = mockNext();

        await DashboardController.getMessageActivityChart(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith(error);
    });
});
