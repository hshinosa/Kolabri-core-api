import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAnalyticsService } = vi.hoisted(() => ({
    mockAnalyticsService: {
        getGroupAnalytics: vi.fn(),
        getCourseAnalytics: vi.fn(),
        analyzeText: vi.fn(),
        exportProcessMining: vi.fn(),
        getAnalyticsSummary: vi.fn(),
        getChatSpaceAnalytics: vi.fn(),
        getGroupQualityStatus: vi.fn(),
        formatAnalyticsAsCSV: vi.fn(),
    },
}));

vi.mock('../services/analytics.service.js', () => ({
    AnalyticsService: mockAnalyticsService,
}));

import { AnalyticsController } from './analytics.controller.js';

function mockReq(overrides: Partial<Request> = {}) {
    return {
        body: {},
        params: {},
        query: {},
        user: {
            userId: 'lecturer-1',
            role: 'lecturer',
            email: 'lecturer@example.com',
        },
        ...overrides,
    } as Partial<Request>;
}

function mockRes(): Partial<Response> {
    const res: Partial<Response> & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn>; setHeader: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> } = {
        status: vi.fn(),
        json: vi.fn(),
        setHeader: vi.fn(),
        send: vi.fn(),
    };
    res.status.mockReturnValue(res as Response);
    res.json.mockReturnValue(res as Response);
    res.setHeader.mockReturnValue(res as Response);
    res.send.mockReturnValue(res as Response);
    return res;
}

function mockNext(): NextFunction {
    return vi.fn() as unknown as NextFunction;
}

describe('AnalyticsController', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns shaped group analytics with members, chat spaces, and recent activity', async () => {
        const payload = {
            success: true,
            group: {
                id: 'group-1',
                name: 'Alpha',
                course: { ownerId: 'lecturer-1', name: 'Intro AI', code: 'IF101' },
                memberCount: 2,
                chatSpaceCount: 2,
            },
            members: [
                { id: 'student-1', name: 'Alice', email: 'alice@example.com' },
                { id: 'student-2', name: 'Bob', email: 'bob@example.com' },
            ],
            chatSpaces: [],
            analytics: { qualityScore: 82 },
            recentActivity: [],
        };
        mockAnalyticsService.getGroupAnalytics.mockResolvedValue(payload);
        const req = mockReq({ params: { groupId: 'group-1' } });
        const res = mockRes();
        const next = mockNext();

        await AnalyticsController.getGroupAnalytics(req as Request, res as Response, next);

        expect(mockAnalyticsService.getGroupAnalytics).toHaveBeenCalledWith(
            'group-1',
            'lecturer-1',
            'lecturer'
        );
        expect(res.json).toHaveBeenCalledWith(payload);
        expect(next).not.toHaveBeenCalled();
    });

    it('forwards not found error when group does not exist', async () => {
        const err = Object.assign(new Error('Group not found'), {
            statusCode: 404,
            code: 'NOT_FOUND',
        });
        mockAnalyticsService.getGroupAnalytics.mockRejectedValue(err);
        const req = mockReq({ params: { groupId: 'missing-group' } });
        const res = mockRes();
        const next = mockNext();

        await AnalyticsController.getGroupAnalytics(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith(err);
    });

    it('forwards forbidden error when lecturer does not own the course group', async () => {
        const err = Object.assign(new Error('You do not own this course'), {
            statusCode: 403,
            code: 'FORBIDDEN',
        });
        mockAnalyticsService.getGroupAnalytics.mockRejectedValue(err);
        const req = mockReq({ params: { groupId: 'group-1' } });
        const res = mockRes();
        const next = mockNext();

        await AnalyticsController.getGroupAnalytics(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith(err);
    });

    it('returns aggregated course analytics summary across groups', async () => {
        const payload = {
            success: true,
            course: { id: 'course-1', name: 'Intro AI', code: 'IF101' },
            summary: {
                totalGroups: 2,
                totalMessages: 10,
                averageQualityScore: 80,
                groupsNeedingAttention: 0,
            },
            groups: [],
        };
        mockAnalyticsService.getCourseAnalytics.mockResolvedValue(payload);
        const req = mockReq({ params: { courseId: 'course-1' } });
        const res = mockRes();
        const next = mockNext();

        await AnalyticsController.getCourseAnalytics(req as Request, res as Response, next);

        expect(mockAnalyticsService.getCourseAnalytics).toHaveBeenCalledWith('course-1', 'lecturer-1');
        expect(res.json).toHaveBeenCalledWith(payload);
        expect(next).not.toHaveBeenCalled();
    });

    it('forwards bad request error when analyzeText receives invalid input', async () => {
        const err = Object.assign(new Error('Text is required'), {
            statusCode: 400,
            code: 'BAD_REQUEST',
        });
        mockAnalyticsService.analyzeText.mockRejectedValue(err);
        const req = mockReq({ body: { text: '' } });
        const res = mockRes();
        const next = mockNext();

        await AnalyticsController.analyzeText(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith(err);
    });

    it('analyzes text and returns the ai engine result', async () => {
        const analysis = { score: 0.82, type: 'cognitive' };
        mockAnalyticsService.analyzeText.mockResolvedValue({ success: true, analysis });
        const req = mockReq({ body: { text: 'Please analyze this discussion.' } });
        const res = mockRes();
        const next = mockNext();

        await AnalyticsController.analyzeText(req as Request, res as Response, next);

        expect(mockAnalyticsService.analyzeText).toHaveBeenCalledWith('Please analyze this discussion.');
        expect(res.json).toHaveBeenCalledWith({ success: true, analysis });
        expect(next).not.toHaveBeenCalled();
    });
});