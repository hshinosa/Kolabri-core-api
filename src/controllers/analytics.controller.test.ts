import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockAiEngineService,
    mockChatAnalyticsService,
    prismaMock,
    chatLogFindMock,
    recentMessagesSortMock,
    recentMessagesLimitMock,
    recentMessagesLeanMock,
} = vi.hoisted(() => {
    const recentMessagesLeanMock = vi.fn();
    const recentMessagesLimitMock = vi.fn(() => ({ lean: recentMessagesLeanMock }));
    const recentMessagesSortMock = vi.fn(() => ({ limit: recentMessagesLimitMock }));
    const chatLogFindMock = vi.fn(() => ({ sort: recentMessagesSortMock }));

    return {
        mockAiEngineService: {
            analyzeEngagement: vi.fn(),
            exportProcessMiningData: vi.fn(),
        },
        mockChatAnalyticsService: {
            getGroupAnalytics: vi.fn(),
        },
        prismaMock: {
            group: { findUnique: vi.fn() },
            course: { findUnique: vi.fn() },
        },
        chatLogFindMock,
        recentMessagesSortMock,
        recentMessagesLimitMock,
        recentMessagesLeanMock,
    };
});

vi.mock('../services/aiEngine.service.js', () => ({
    aiEngineService: mockAiEngineService,
}));

vi.mock('../services/chatAnalytics.service.js', () => ({
    chatAnalyticsService: mockChatAnalyticsService,
}));

vi.mock('../config/database.js', () => ({
    default: prismaMock,
}));

vi.mock('../models/ChatLog.js', () => ({
    ChatLog: {
        find: chatLogFindMock,
    },
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

describe('AnalyticsController', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns shaped group analytics with members, chat spaces, and recent activity', async () => {
        prismaMock.group.findUnique.mockResolvedValue({
            id: 'group-1',
            name: 'Alpha',
            course: { ownerId: 'lecturer-1', name: 'Intro AI', code: 'IF101' },
            members: [
                { user: { id: 'student-1', name: 'Alice', email: 'alice@example.com' } },
                { user: { id: 'student-2', name: 'Bob', email: 'bob@example.com' } },
            ],
            chatSpaces: [
                { id: 'chat-1', name: 'General', closedAt: null, createdAt: new Date('2026-05-01T00:00:00.000Z') },
                { id: 'chat-2', name: 'Review', closedAt: new Date('2026-05-02T00:00:00.000Z'), createdAt: new Date('2026-05-02T00:00:00.000Z') },
            ],
        });
        mockChatAnalyticsService.getGroupAnalytics.mockResolvedValue({
            qualityScore: 82,
            recommendation: 'Diskusi sangat baik.',
            engagementDistribution: { cognitive: 60, behavioral: 25, emotional: 15 },
            engagementExamples: [{ type: 'cognitive', excerpt: 'analysis' }],
            qualityBreakdown: { hotPercentage: 50, lexicalVariety: 70 },
            participantCount: 2,
            messageCount: 12,
            participants: ['Alice', 'Bob'],
        });
        recentMessagesLeanMock.mockResolvedValue([
            {
                _id: { toString: () => 'msg-1' },
                senderName: 'Alice',
                senderType: 'student',
                content: 'x'.repeat(110),
                createdAt: new Date('2026-05-03T10:00:00.000Z'),
                isIntervention: false,
            },
        ]);
        const req = mockReq({ params: { groupId: 'group-1' } });
        const res = mockRes();
        const next = mockNext();

        await AnalyticsController.getGroupAnalytics(req as Request, res as Response, next);

        expect(prismaMock.group.findUnique).toHaveBeenCalledWith({
            where: { id: 'group-1' },
            include: expect.objectContaining({
                course: { select: { ownerId: true, name: true, code: true } },
            }),
        });
        expect(chatLogFindMock).toHaveBeenCalledWith({
            groupId: 'group-1',
            isDeleted: { $ne: true },
        });
        expect(recentMessagesSortMock).toHaveBeenCalledWith({ createdAt: -1 });
        expect(recentMessagesLimitMock).toHaveBeenCalledWith(20);
        expect(mockChatAnalyticsService.getGroupAnalytics).toHaveBeenCalledWith('group-1');
        expect(res.json).toHaveBeenCalledWith({
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
            chatSpaces: [
                {
                    id: 'chat-1',
                    name: 'General',
                    isClosed: false,
                    closedAt: null,
                    createdAt: new Date('2026-05-01T00:00:00.000Z'),
                },
                {
                    id: 'chat-2',
                    name: 'Review',
                    isClosed: true,
                    closedAt: new Date('2026-05-02T00:00:00.000Z'),
                    createdAt: new Date('2026-05-02T00:00:00.000Z'),
                },
            ],
            analytics: {
                qualityScore: 82,
                recommendation: 'Diskusi sangat baik.',
                engagementDistribution: { cognitive: 60, behavioral: 25, emotional: 15 },
                engagementExamples: [{ type: 'cognitive', excerpt: 'analysis' }],
                hotPercentage: 50,
                qualityBreakdown: {
                    lexical_variety: 0.7,
                    hot_percentage: 50,
                    participation: 2,
                    lexical_score: 70,
                    hot_score: 50,
                    cognitive_ratio: 60,
                },
                local_message_count: 12,
                participants: ['Alice', 'Bob'],
                participantCount: 2,
            },
            recentActivity: [
                {
                    id: 'msg-1',
                    senderName: 'Alice',
                    senderType: 'student',
                    content: `${'x'.repeat(100)}...`,
                    createdAt: new Date('2026-05-03T10:00:00.000Z'),
                    isIntervention: false,
                },
            ],
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('forwards not found error when group does not exist', async () => {
        prismaMock.group.findUnique.mockResolvedValue(null);
        const req = mockReq({ params: { groupId: 'missing-group' } });
        const res = mockRes();
        const next = mockNext();

        await AnalyticsController.getGroupAnalytics(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith(
            expect.objectContaining({
                statusCode: 404,
                code: 'NOT_FOUND',
                message: 'Group not found',
            })
        );
    });

    it('forwards forbidden error when lecturer does not own the course group', async () => {
        prismaMock.group.findUnique.mockResolvedValue({
            id: 'group-1',
            name: 'Alpha',
            course: { ownerId: 'lecturer-2', name: 'Intro AI', code: 'IF101' },
            members: [],
            chatSpaces: [],
        });
        const req = mockReq({ params: { groupId: 'group-1' }, user: { userId: 'lecturer-1', role: 'lecturer' } as Request['user'] });
        const res = mockRes();
        const next = mockNext();

        await AnalyticsController.getGroupAnalytics(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith(
            expect.objectContaining({
                statusCode: 403,
                code: 'FORBIDDEN',
                message: 'You do not own this course',
            })
        );
    });

    it('returns aggregated course analytics summary across groups', async () => {
        prismaMock.course.findUnique.mockResolvedValue({
            id: 'course-1',
            name: 'Intro AI',
            code: 'IF101',
            ownerId: 'lecturer-1',
            groups: [
                {
                    id: 'group-1',
                    name: 'Alpha',
                    members: [{ userId: 'student-1' }, { userId: 'student-2' }],
                    chatSpaces: [{ id: 'chat-1', name: 'General', closedAt: null }],
                },
                {
                    id: 'group-2',
                    name: 'Beta',
                    members: [{ userId: 'student-3' }],
                    chatSpaces: [
                        { id: 'chat-2', name: 'Review', closedAt: null },
                        { id: 'chat-3', name: 'Archive', closedAt: null },
                    ],
                },
            ],
        });
        mockChatAnalyticsService.getGroupAnalytics
            .mockResolvedValueOnce({
                messageCount: 10,
                qualityScore: 80,
                recommendation: 'Solid',
                engagementDistribution: { cognitive: 50, behavioral: 30, emotional: 20 },
            })
            .mockResolvedValueOnce({
                messageCount: 0,
                qualityScore: 30,
                recommendation: 'No data',
                engagementDistribution: { cognitive: 0, behavioral: 0, emotional: 0 },
            });
        const req = mockReq({ params: { courseId: 'course-1' }, user: { userId: 'lecturer-1', role: 'lecturer' } as Request['user'] });
        const res = mockRes();
        const next = mockNext();

        await AnalyticsController.getCourseAnalytics(req as Request, res as Response, next);

        expect(mockChatAnalyticsService.getGroupAnalytics).toHaveBeenNthCalledWith(1, 'group-1');
        expect(mockChatAnalyticsService.getGroupAnalytics).toHaveBeenNthCalledWith(2, 'group-2');
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            course: {
                id: 'course-1',
                name: 'Intro AI',
                code: 'IF101',
            },
            summary: {
                totalGroups: 2,
                totalMessages: 10,
                averageQualityScore: 80,
                groupsNeedingAttention: 0,
            },
            groups: [
                {
                    groupId: 'group-1',
                    groupName: 'Alpha',
                    memberCount: 2,
                    chatSpaceCount: 1,
                    messageCount: 10,
                    qualityScore: 80,
                    recommendation: 'Solid',
                    engagementDistribution: { cognitive: 50, behavioral: 30, emotional: 20 },
                    needsAttention: false,
                },
                {
                    groupId: 'group-2',
                    groupName: 'Beta',
                    memberCount: 1,
                    chatSpaceCount: 2,
                    messageCount: 0,
                    qualityScore: 30,
                    recommendation: 'No data',
                    engagementDistribution: { cognitive: 0, behavioral: 0, emotional: 0 },
                    needsAttention: true,
                },
            ],
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('forwards bad request error when analyzeText receives invalid input', async () => {
        const req = mockReq({ body: { text: '' } });
        const res = mockRes();
        const next = mockNext();

        await AnalyticsController.analyzeText(req as Request, res as Response, next);

        expect(mockAiEngineService.analyzeEngagement).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith(
            expect.objectContaining({
                statusCode: 400,
                code: 'BAD_REQUEST',
                message: 'Text is required',
            })
        );
    });

    it('analyzes text and returns the ai engine result', async () => {
        const analysis = { score: 0.82, type: 'cognitive' };
        mockAiEngineService.analyzeEngagement.mockResolvedValue(analysis);
        const req = mockReq({ body: { text: 'Please analyze this discussion.' } });
        const res = mockRes();
        const next = mockNext();

        await AnalyticsController.analyzeText(req as Request, res as Response, next);

        expect(mockAiEngineService.analyzeEngagement).toHaveBeenCalledWith('Please analyze this discussion.');
        expect(res.json).toHaveBeenCalledWith({
            success: true,
            analysis,
        });
        expect(next).not.toHaveBeenCalled();
    });
});
