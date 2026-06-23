import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../middleware/errorHandler.js';
import { AnalyticsService } from '../services/analytics.service.js';
import { AnalyticsController } from './analytics.controller.js';

vi.mock('../services/analytics.service.js', () => ({
    AnalyticsService: {
        getGroupAnalytics: vi.fn(),
        getCourseAnalytics: vi.fn(),
        analyzeText: vi.fn(),
        getGroupQualityStatus: vi.fn(),
        getSessionDiscussionAnalytics: vi.fn(),
        exportProcessMining: vi.fn(),
    },
}));

function mockReq(overrides: Partial<Request> = {}) {
    return {
        body: {},
        params: {},
        query: {},
        user: { userId: 'lecturer-1', role: 'lecturer', email: 'lecturer@example.com' },
        ...overrides,
    } as unknown as Request;
}

function mockRes() {
    const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn(), send: vi.fn() } as any;
    res.status.mockReturnValue(res);
    res.json.mockReturnValue(res);
    res.send.mockReturnValue(res);
    return res as Response;
}

function mockNext() {
    return vi.fn() as unknown as NextFunction;
}

describe('AnalyticsController Integration — Flow 6: SRL & Analytics', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('analyzes text engagement via AI Engine', async () => {
        vi.mocked(AnalyticsService.analyzeText).mockResolvedValue({
            success: true,
            analysis: { lexical_variety: 75 },
        } as any);

        const req = mockReq({ body: { text: 'Mengapa konsep ini penting untuk dipahami?' } });
        const res = mockRes();
        const next = mockNext();

        await AnalyticsController.analyzeText(req, res, next);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        expect(AnalyticsService.analyzeText).toHaveBeenCalledWith('Mengapa konsep ini penting untuk dipahami?');
    });

    it('rejects empty text for engagement analysis', async () => {
        vi.mocked(AnalyticsService.analyzeText).mockRejectedValue(ApiError.badRequest('Text is required'));

        const req = mockReq({ body: { text: '' } });
        const res = mockRes();
        const next = mockNext();

        await AnalyticsController.analyzeText(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Text is required' }));
    });

    it('returns group analytics for course owner', async () => {
        vi.mocked(AnalyticsService.getGroupAnalytics).mockResolvedValue({ success: true, group: { id: 'group-1' } } as any);

        const req = mockReq({ params: { groupId: 'group-1' } });
        const res = mockRes();
        const next = mockNext();

        await AnalyticsController.getGroupAnalytics(req, res, next);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        expect(AnalyticsService.getGroupAnalytics).toHaveBeenCalledWith('group-1', 'lecturer-1', 'lecturer');
    });

    it('rejects group analytics when lecturer does not own course', async () => {
        vi.mocked(AnalyticsService.getGroupAnalytics).mockRejectedValue(ApiError.forbidden('You do not own this course'));

        const req = mockReq({ params: { groupId: 'group-1' } });
        const res = mockRes();
        const next = mockNext();

        await AnalyticsController.getGroupAnalytics(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'You do not own this course' }));
    });

    it('returns course analytics overview', async () => {
        vi.mocked(AnalyticsService.getCourseAnalytics).mockResolvedValue({
            success: true,
            course: { id: 'course-1', name: 'Algo', code: 'CS101' },
            summary: { totalGroups: 1, totalMessages: 30, averageQualityScore: 65, groupsNeedingAttention: 0 },
            groups: [],
            trends: { engagement: [], completion: [], attendance: [] },
        } as any);

        const req = mockReq({ params: { courseId: 'course-1' } });
        const res = mockRes();
        const next = mockNext();

        await AnalyticsController.getCourseAnalytics(req, res, next);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
            summary: expect.objectContaining({ totalGroups: 1 }),
        }));
    });

    it('returns group quality status for live monitoring', async () => {
        vi.mocked(AnalyticsService.getGroupQualityStatus).mockResolvedValue({ success: true, status: 'needs_attention' } as any);

        const req = mockReq({ params: { groupId: 'group-1' } });
        const res = mockRes();
        const next = mockNext();

        await AnalyticsController.getGroupQualityStatus(req, res, next);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, status: 'needs_attention' }));
    });

    it('exports process mining data for course owner', async () => {
        vi.mocked(AnalyticsService.exportProcessMining).mockResolvedValue({
            success: true,
            export: { file_url: '/exports/data.csv' },
            course: { id: 'course-1', name: 'Algo' },
        } as any);

        const req = mockReq({ params: { courseId: 'course-1' } });
        const res = mockRes();
        const next = mockNext();

        await AnalyticsController.exportProcessMining(req, res, next);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('returns 404 when group not found for analytics', async () => {
        vi.mocked(AnalyticsService.getGroupAnalytics).mockRejectedValue(ApiError.notFound('Group not found'));

        const req = mockReq({ params: { groupId: 'nonexistent' } });
        const res = mockRes();
        const next = mockNext();

        await AnalyticsController.getGroupAnalytics(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Group not found' }));
    });
});
