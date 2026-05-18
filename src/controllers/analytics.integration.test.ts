import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, aiEngineServiceMock, chatAnalyticsServiceMock, ChatLogMock } = vi.hoisted(() => ({
    prismaMock: {
group: { findUnique: vi.fn(), findFirst: vi.fn() },
course: { findUnique: vi.fn(), findFirst: vi.fn() },
chatSpace: { findUnique: vi.fn(), findFirst: vi.fn() },
    },
    aiEngineServiceMock: {
        analyzeEngagement: vi.fn(),
        exportProcessMiningData: vi.fn(),
    },
    chatAnalyticsServiceMock: {
        getGroupAnalytics: vi.fn(),
        getChatSpaceAnalytics: vi.fn(),
        getParticipantActivity: vi.fn(),
    },
    ChatLogMock: {
        find: vi.fn().mockReturnValue({ sort: vi.fn().mockReturnValue({ limit: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) }) }),
        countDocuments: vi.fn().mockResolvedValue(0),
    },
}));

vi.mock('../config/database.js', () => ({ default: prismaMock }));
vi.mock('../services/aiEngine.service.js', () => ({ aiEngineService: aiEngineServiceMock }));
vi.mock('../services/chatAnalytics.service.js', () => ({ chatAnalyticsService: chatAnalyticsServiceMock }));
vi.mock('../models/ChatLog.js', () => ({ ChatLog: ChatLogMock }));
vi.mock('../middleware/errorHandler.js', async () => {
    const actual = await vi.importActual('../middleware/errorHandler.js');
    return actual;
});

import { AnalyticsController } from './analytics.controller.js';

function mockReq(overrides: Partial<Request> = {}) {
    return {
        body: {}, params: {}, query: {},
        user: { userId: 'lecturer-1', role: 'lecturer', email: 'lecturer@example.com' },
        ...overrides,
    } as unknown as Request;
}

function mockRes() {
    const res = { status: vi.fn(), json: vi.fn() } as any;
    res.status.mockReturnValue(res);
    res.json.mockReturnValue(res);
    return res as Response;
}

const mockNext: () => NextFunction = () => vi.fn() as unknown as NextFunction;

describe('AnalyticsController Integration — Flow 6: SRL & Analytics', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('analyzes text engagement via AI Engine', async () => {
        aiEngineServiceMock.analyzeEngagement.mockResolvedValue({
            success: true, lexical_variety: 75, engagement_type: 'Cognitive',
            is_higher_order: true, hot_indicators: ['mengapa'], word_count: 20, unique_words: 15, confidence: 0.8,
        });

        const req = mockReq({ body: { text: 'Mengapa konsep ini penting untuk dipahami?' } });
        const res = mockRes();
        const next = mockNext();

        await AnalyticsController.analyzeText(req, res, next);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        expect(aiEngineServiceMock.analyzeEngagement).toHaveBeenCalledWith('Mengapa konsep ini penting untuk dipahami?');
    });

    it('rejects empty text for engagement analysis', async () => {
        const req = mockReq({ body: { text: '' } });
        const res = mockRes();
        const next = mockNext();

        await AnalyticsController.analyzeText(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Text is required' }));
    });

    it('returns group analytics for course owner', async () => {
        prismaMock.group.findFirst.mockResolvedValue({
            id: 'group-1', name: 'Kelompok 1',
            course: { ownerId: 'lecturer-1', name: 'Algo', code: 'CS101' },
            members: [{ user: { id: 'student-1', name: 'Student', email: 's@e.com' } }],
            chatSpaces: [{ id: 'cs-1', name: 'Sesi 1', closedAt: null, createdAt: new Date() }],
        });
        chatAnalyticsServiceMock.getGroupAnalytics.mockResolvedValue({
            qualityScore: 72, recommendation: 'Good', messageCount: 50, participantCount: 3,
            qualityBreakdown: { hotPercentage: 30, lexicalVariety: 60 },
            engagementDistribution: { cognitive: 40, behavioral: 35, emotional: 25 },
            engagementExamples: {}, participants: ['Student'],
        });

        const req = mockReq({ params: { groupId: 'group-1' } });
        const res = mockRes();
        const next = mockNext();

        await AnalyticsController.getGroupAnalytics(req, res, next);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        expect(chatAnalyticsServiceMock.getGroupAnalytics).toHaveBeenCalledWith('group-1');
    });

    it('rejects group analytics when lecturer does not own course', async () => {
        prismaMock.group.findFirst.mockResolvedValue({
            id: 'group-1', name: 'K1',
            course: { ownerId: 'other-lecturer', name: 'Algo', code: 'CS101' },
            members: [], chatSpaces: [],
        });

        const req = mockReq({ params: { groupId: 'group-1' } });
        const res = mockRes();
        const next = mockNext();

        await AnalyticsController.getGroupAnalytics(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'You do not own this course' }));
    });

    it('returns course analytics overview', async () => {
        prismaMock.course.findFirst.mockResolvedValue({
            id: 'course-1', name: 'Algo', code: 'CS101', ownerId: 'lecturer-1',
            groups: [
                { id: 'g-1', name: 'K1', members: [{ userId: 's-1' }], chatSpaces: [{ id: 'cs-1', name: 'S1', closedAt: null }] },
            ],
        });
        chatAnalyticsServiceMock.getGroupAnalytics.mockResolvedValue({
            qualityScore: 65, recommendation: 'Moderate', messageCount: 30, participantCount: 2,
            qualityBreakdown: { hotPercentage: 20, lexicalVariety: 50 },
            engagementDistribution: { cognitive: 30, behavioral: 40, emotional: 30 },
            engagementExamples: {}, participants: [],
        });

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
        prismaMock.group.findFirst.mockResolvedValue({
            id: 'group-1', name: 'K1', course: { ownerId: 'lecturer-1' },
        });
        ChatLogMock.countDocuments.mockResolvedValue(5);
        chatAnalyticsServiceMock.getGroupAnalytics.mockResolvedValue({
            qualityScore: 45, recommendation: 'Needs improvement', messageCount: 10,
            qualityBreakdown: {}, engagementDistribution: {}, engagementExamples: {}, participants: [], participantCount: 2,
        });

        const req = mockReq({ params: { groupId: 'group-1' } });
        const res = mockRes();
        const next = mockNext();

        await AnalyticsController.getGroupQualityStatus(req, res, next);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: true, status: 'needs_attention',
        }));
    });

    it('exports process mining data for course owner', async () => {
        prismaMock.course.findFirst.mockResolvedValue({ id: 'course-1', name: 'Algo', ownerId: 'lecturer-1' });
        aiEngineServiceMock.exportProcessMiningData.mockResolvedValue({
            success: true, file_url: '/exports/data.csv', total_events: 100,
        });

        const req = mockReq({ params: { courseId: 'course-1' } });
        const res = mockRes();
        const next = mockNext();

        await AnalyticsController.exportProcessMining(req, res, next);

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('returns 404 when group not found for analytics', async () => {
        prismaMock.group.findFirst.mockResolvedValue(null);

        const req = mockReq({ params: { groupId: 'nonexistent' } });
        const res = mockRes();
        const next = mockNext();

        await AnalyticsController.getGroupAnalytics(req, res, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Group not found' }));
    });
});
