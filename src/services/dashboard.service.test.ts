import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
    prismaMock: {
        user: { count: vi.fn(), findMany: vi.fn() },
        course: { count: vi.fn(), findMany: vi.fn() },
        group: { count: vi.fn() },
        chatSpace: { count: vi.fn(), findMany: vi.fn() },
        chatMessage: { count: vi.fn(), groupBy: vi.fn(), findMany: vi.fn() },
    },
}));

vi.mock('../config/database.js', () => ({
    default: prismaMock,
}));

import { DashboardService } from './dashboard.service.js';

describe('DashboardService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('builds dashboard stats including hot-thinking and activity summaries', async () => {
        prismaMock.user.count
            .mockResolvedValueOnce(20)
            .mockResolvedValueOnce(12)
            .mockResolvedValueOnce(6)
            .mockResolvedValueOnce(2)
            .mockResolvedValueOnce(3);
        prismaMock.course.count.mockResolvedValueOnce(5).mockResolvedValueOnce(4);
        prismaMock.group.count.mockResolvedValue(8);
        prismaMock.chatSpace.count.mockResolvedValue(6);
        prismaMock.chatMessage.count.mockResolvedValueOnce(100).mockResolvedValueOnce(7).mockResolvedValueOnce(18);
        prismaMock.chatMessage.groupBy.mockResolvedValue([{ senderId: 'user-1' }, { senderId: 'user-2' }]);
        prismaMock.chatMessage.findMany
            .mockResolvedValueOnce([
                {
                    id: 'msg-1',
                    content: 'Explain why this argument works',
                    senderId: 'user-1',
                    sender: { id: 'user-1', name: 'Alya' },
                    chatSpace: { id: 'chat-1', group: { course: { id: 'course-1', name: 'AI Basics' } } },
                },
                {
                    id: 'msg-2',
                    content: 'Plain status update',
                    senderId: 'user-2',
                    sender: { id: 'user-2', name: 'Bima' },
                    chatSpace: { id: 'chat-1', group: { course: { id: 'course-1', name: 'AI Basics' } } },
                },
            ])
            .mockResolvedValueOnce([{ createdAt: new Date('2026-05-01T00:00:00.000Z') }])
            .mockResolvedValueOnce([{ createdAt: new Date('2026-05-01T00:00:00.000Z') }]);
        prismaMock.user.findMany.mockResolvedValue([{ createdAt: new Date('2026-05-01T00:00:00.000Z') }]);

        const result = await DashboardService.getStats({ startDate: '2026-05-01', endDate: '2026-05-02' });

        expect(result.users.total).toBe(20);
        expect(result.users.activeLast24h).toBe(2);
        expect(result.discussions.aiInteractions).toBe(18);
        expect(result.engagement.hotThinkingPercentage).toBe(50);
        expect(result.engagement.mostActiveCourse).toEqual({ id: 'course-1', name: 'AI Basics', messageCount: 2 });
        expect(result.engagement.mostActiveUser).toEqual({ id: 'user-1', name: 'Alya', messageCount: 1 });
    });

    it('builds a mixed activity feed sorted by latest first', async () => {
        prismaMock.user.findMany.mockResolvedValue([
            { id: 'user-1', name: 'Alya', email: 'alya@example.com', role: 'student', createdAt: new Date('2026-05-03T10:00:00.000Z') },
        ]);
        prismaMock.course.findMany.mockResolvedValue([
            { id: 'course-1', code: 'IF101', name: 'Intro AI', createdAt: new Date('2026-05-03T09:00:00.000Z'), owner: { name: 'Dr. AI' } },
        ]);
        prismaMock.chatSpace.findMany.mockResolvedValue([
            { id: 'chat-1', name: 'General', createdAt: new Date('2026-05-03T11:00:00.000Z'), group: { name: 'Group 1' }, _count: { messages: 8 } },
        ]);
        prismaMock.user.count.mockResolvedValue(1);
        prismaMock.course.count.mockResolvedValue(1);
        prismaMock.chatSpace.count.mockResolvedValue(1);

        const result = await DashboardService.getActivityFeed({ limit: 3, offset: 0 });

        expect(result.data.map((item) => item.type)).toEqual(['chat_space', 'user', 'course']);
        expect(result.meta).toEqual({ limit: 3, offset: 0, total: 3, hasMore: false });
    });

    it('defaults unsupported chart periods to 30d', async () => {
        prismaMock.user.findMany.mockResolvedValue([{ createdAt: new Date('2026-05-01T00:00:00.000Z') }]);

        const result = await DashboardService.getUserGrowthChart('weird-period');

        expect(result.period).toBe('30d');
        expect(result.data.some((item) => item.value === 1)).toBe(true);
    });
});
