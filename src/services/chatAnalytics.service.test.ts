import { beforeEach, describe, expect, it, vi } from 'vitest';

const { leanMock, sortMock, findMock, aggregateMock, loggerErrorMock } = vi.hoisted(() => {
    const leanMock = vi.fn();
    const sortMock = vi.fn(() => ({ lean: leanMock }));
    const findMock = vi.fn(() => ({ sort: sortMock }));
    const aggregateMock = vi.fn();
    const loggerErrorMock = vi.fn();
    return { leanMock, sortMock, findMock, aggregateMock, loggerErrorMock };
});

vi.mock('../models/ChatLog.js', () => ({
    ChatLog: {
        find: findMock,
        aggregate: aggregateMock,
    },
}));

vi.mock('../utils/logger.js', () => ({
    logger: {
        error: loggerErrorMock,
    },
}));

import { ChatAnalyticsService } from './chatAnalytics.service.js';

describe('ChatAnalyticsService', () => {
    let service: ChatAnalyticsService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new ChatAnalyticsService();
    });

    it('returns an empty analytics payload when a group has no messages', async () => {
        leanMock.mockResolvedValue([]);
        aggregateMock.mockResolvedValue([]);

        const result = await service.getGroupAnalytics('group-1');

        expect(result).toEqual({
            success: true,
            groupId: 'group-1',
            messageCount: 0,
            qualityScore: 0,
            qualityBreakdown: {
                hotPercentage: 0,
                lexicalVariety: 0,
                participation: 0,
                engagementBalance: 0,
            },
            participants: [],
            participantCount: 0,
            engagementDistribution: {
                cognitive: 0,
                behavioral: 0,
                emotional: 0,
            },
            engagementExamples: [],
            recommendation: 'Belum ada data diskusi untuk dianalisis.',
            sessionDiscussionStats: [],
        });
    });

    it('calculates analytics, participants, examples, and session discussion stats for a group', async () => {
        leanMock.mockResolvedValue([
            {
                groupId: 'group-1',
                sessionDiscussionId: 'chat-1',
                senderName: 'Alice',
                senderType: 'student',
                content: 'A very long analytical message that explains concepts in depth and connects several course ideas together.',
                isDeleted: false,
                isIntervention: false,
                courseId: 'course-1',
                senderId: 'user-1',
                createdAt: new Date('2026-05-03T10:00:00.000Z'),
                engagement: {
                    engagementType: 'cognitive',
                    isHigherOrder: true,
                    lexicalVariety: 70,
                    hotIndicators: ['analysis'],
                    confidence: 0.9,
                },
            },
            {
                groupId: 'group-1',
                sessionDiscussionId: 'chat-2',
                senderName: 'Bob',
                senderType: 'student',
                content: 'Let us split the tasks and schedule the next session.',
                isDeleted: false,
                isIntervention: false,
                courseId: 'course-1',
                senderId: 'user-2',
                createdAt: new Date('2026-05-03T09:00:00.000Z'),
                engagement: {
                    engagementType: 'behavioral',
                    isHigherOrder: false,
                    lexicalVariety: 40,
                    hotIndicators: [],
                    confidence: 0.8,
                },
            },
            {
                groupId: 'group-1',
                sessionDiscussionId: 'chat-1',
                senderName: 'Cara',
                senderType: 'lecturer',
                content: 'Great effort team, keep supporting each other.',
                isDeleted: false,
                isIntervention: false,
                courseId: 'course-1',
                senderId: 'user-3',
                createdAt: new Date('2026-05-03T08:00:00.000Z'),
                engagement: {
                    engagementType: 'emotional',
                    isHigherOrder: false,
                    lexicalVariety: 50,
                    hotIndicators: [],
                    confidence: 0.7,
                },
            },
        ]);
        aggregateMock.mockResolvedValue([
            { _id: 'chat-1', messageCount: 2, lastActivity: new Date('2026-05-03T10:00:00.000Z') },
            { _id: 'chat-2', messageCount: 1, lastActivity: new Date('2026-05-03T09:00:00.000Z') },
        ]);

        const result = await service.getGroupAnalytics('group-1');

        expect(result.success).toBe(true);
        expect(result.messageCount).toBe(3);
        expect(result.participants).toEqual(['Alice', 'Bob', 'Cara']);
        expect(result.participantCount).toBe(3);
        expect(result.engagementDistribution).toEqual({ cognitive: 33, behavioral: 33, emotional: 33 });
        expect(result.qualityBreakdown).toEqual({
            hotPercentage: 33,
            lexicalVariety: 53,
            participation: 60,
            engagementBalance: 100,
        });
        expect(result.qualityScore).toBeGreaterThanOrEqual(55);
        expect(result.qualityScore).toBeLessThanOrEqual(60);
        expect(result.engagementExamples).toHaveLength(3);
        expect(result.engagementExamples[0]).toEqual(
            expect.objectContaining({ type: 'cognitive', indicators: ['analysis'], isHot: true })
        );
        expect(result.sessionDiscussionStats).toEqual([
            { sessionDiscussionId: 'chat-1', messageCount: 2, lastActivity: new Date('2026-05-03T10:00:00.000Z') },
            { sessionDiscussionId: 'chat-2', messageCount: 1, lastActivity: new Date('2026-05-03T09:00:00.000Z') },
        ]);
        expect(result.recommendation).toContain('Diskusi berjalan cukup baik');
    });

    it('returns a safe error payload when group analytics fails', async () => {
        leanMock.mockRejectedValue(new Error('mongo down'));

        const result = await service.getGroupAnalytics('group-1');

        expect(loggerErrorMock).toHaveBeenCalled();
        expect(result).toEqual(
            expect.objectContaining({
                success: false,
                groupId: 'group-1',
                error: 'mongo down',
            })
        );
    });

    it('returns a safe empty payload for session discussions without messages', async () => {
        leanMock.mockResolvedValue([]);

        const result = await service.getSessionDiscussionAnalytics('chat-1');

        expect(result).toEqual({
            success: true,
            sessionDiscussionId: 'chat-1',
            messageCount: 0,
            qualityScore: 0,
            qualityBreakdown: {
                hotPercentage: 0,
                lexicalVariety: 0,
                participation: 0,
                engagementBalance: 0,
            },
            participants: [],
            engagementDistribution: {
                cognitive: 0,
                behavioral: 0,
                emotional: 0,
            },
            engagementExamples: [],
            recommendation: 'Belum ada data diskusi untuk dianalisis.',
        });
    });

    it('returns a safe error payload when session discussion analytics fails', async () => {
        leanMock.mockRejectedValue(new Error('query failed'));

        const result = await service.getSessionDiscussionAnalytics('chat-1');

        expect(result).toEqual(
            expect.objectContaining({
                success: false,
                sessionDiscussionId: 'chat-1',
                error: 'query failed',
            })
        );
    });

    it('calculates participant activity distribution and averages', async () => {
        aggregateMock.mockResolvedValue([
            {
                _id: 'Alice',
                messageCount: 4,
                hotCount: 2,
                totalLexicalVariety: 180,
                messagesWithEngagement: 4,
                lastActivity: new Date('2026-05-03T10:00:00.000Z'),
                cognitiveCount: 2,
                behavioralCount: 1,
                emotionalCount: 1,
            },
        ]);

        const result = await service.getParticipantActivity('group-1');

        expect(result).toEqual({
            success: true,
            participants: [
                {
                    name: 'Alice',
                    messageCount: 4,
                    hotCount: 2,
                    avgLexicalVariety: 45,
                    lastActivity: new Date('2026-05-03T10:00:00.000Z'),
                    engagementTypes: {
                        cognitive: 50,
                        behavioral: 25,
                        emotional: 25,
                    },
                },
            ],
        });
    });

    it('returns a safe error payload when participant activity fails', async () => {
        aggregateMock.mockRejectedValue(new Error('aggregate failed'));

        const result = await service.getParticipantActivity('group-1');

        expect(loggerErrorMock).toHaveBeenCalledWith('Participant activity calculation failed:', expect.any(Error));
        expect(result).toEqual({ success: false, participants: [] });
    });
});
