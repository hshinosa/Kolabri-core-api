import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, cacheMock } = vi.hoisted(() => ({
    prismaMock: {
        user: { count: vi.fn(), findMany: vi.fn() },
        course: { count: vi.fn(), findMany: vi.fn() },
        group: { count: vi.fn() },
        sessionDiscussion: { count: vi.fn(), findMany: vi.fn() },
        chatMessage: { count: vi.fn(), groupBy: vi.fn(), findMany: vi.fn() },
    },
    cacheMock: {
        get: vi.fn().mockReturnValue(null),
        set: vi.fn(),
        invalidate: vi.fn(),
        invalidatePattern: vi.fn(),
        clear: vi.fn(),
    },
}));

vi.mock('../config/database.js', () => ({
    default: prismaMock,
}));

vi.mock('../utils/cache.js', () => ({
    cache: cacheMock,
}));

import { DashboardService, invalidateDashboardCache } from './dashboard.service.js';

/**
 * Set up all prisma mocks for a single computeStats call.
 * computeStats runs ~17 parallel queries + 2 follow-up queries (sessionDiscussion.findMany, user.findMany).
 */
function mockComputeStatsOnce(opts: { totalUsers?: number } = {}) {
    const totalUsers = opts.totalUsers ?? 10;

    // Promise.all block (17 queries in order)
    prismaMock.user.count
        .mockResolvedValueOnce(totalUsers)   // totalUsers
        .mockResolvedValueOnce(5)             // studentUsers
        .mockResolvedValueOnce(3)             // lecturerUsers
        .mockResolvedValueOnce(2)             // adminUsers
        .mockResolvedValueOnce(1);            // usersCreatedInRange
    prismaMock.course.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    prismaMock.group.count.mockResolvedValue(4);
    prismaMock.sessionDiscussion.count.mockResolvedValue(3);
    prismaMock.chatMessage.count
        .mockResolvedValueOnce(50)           // totalMessages
        .mockResolvedValueOnce(5)            // messagesToday
        .mockResolvedValueOnce(10);          // aiInteractionsInRange
    prismaMock.chatMessage.groupBy
        .mockResolvedValueOnce([{ senderId: 'user-1' }])                          // activeMessageSenders
        .mockResolvedValueOnce([{ sessionDiscussionId: 'cs-1', _count: { id: 5 } }])      // sessionDiscussionMessageCounts
        .mockResolvedValueOnce([{ senderId: 'user-1', _count: { id: 3 } }]);      // senderMessageCounts
    prismaMock.chatMessage.findMany
        .mockResolvedValueOnce([{ content: 'hello' }])   // recentMessagesForHotCheck
        .mockResolvedValueOnce([])                        // buildMessageActivityData
        .mockResolvedValueOnce([]);                       // buildMessageActivityData (2nd call)

    // Follow-up queries after Promise.all
    prismaMock.sessionDiscussion.findMany.mockResolvedValue([
        { id: 'cs-1', group: { course: { id: 'course-1', name: 'Test Course' } } },
    ]);
    prismaMock.user.findMany.mockResolvedValue([{ id: 'user-1', name: 'Test User' }]);
}

describe('Dashboard Cache Invalidation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        cacheMock.get.mockReturnValue(null);
    });

    it('should cache stats result on first call and return cached on second call', async () => {
        mockComputeStatsOnce();

        // First call: cache miss → compute → cache.set called
        cacheMock.get.mockReturnValueOnce(null);
        const result1 = await DashboardService.getStats({ startDate: '2026-05-01', endDate: '2026-05-02' });
        expect(cacheMock.set).toHaveBeenCalledTimes(1);

        // Second call: cache hit → return cached data without recomputing
        cacheMock.get.mockReturnValueOnce(result1);
        const result2 = await DashboardService.getStats({ startDate: '2026-05-01', endDate: '2026-05-02' });
        expect(result2).toEqual(result1);
        // cache.set should still only be called once (from first call)
        expect(cacheMock.set).toHaveBeenCalledTimes(1);
    });

    it('should invalidate dashboard cache via invalidateDashboardCache()', () => {
        invalidateDashboardCache();
        expect(cacheMock.invalidatePattern).toHaveBeenCalledWith('dashboard:stats:');
    });

    it('should recompute stats after invalidation', async () => {
        // First computation
        mockComputeStatsOnce({ totalUsers: 10 });
        cacheMock.get.mockReturnValueOnce(null);
        const result1 = await DashboardService.getStats({ startDate: '2026-05-01', endDate: '2026-05-02' });
        expect(result1.users.total).toBe(10);

        // Invalidate
        invalidateDashboardCache();

        // Second computation after invalidation (cache miss again)
        mockComputeStatsOnce({ totalUsers: 15 });
        cacheMock.get.mockReturnValueOnce(null);
        const result2 = await DashboardService.getStats({ startDate: '2026-05-01', endDate: '2026-05-02' });
        expect(result2.users.total).toBe(15);
    });

    it('should use correct cache key format with preset and date range', async () => {
        mockComputeStatsOnce();
        cacheMock.get.mockReturnValueOnce(null);
        await DashboardService.getStats({ startDate: '2026-05-01', endDate: '2026-05-02' });

        // Verify cache.get was called with the expected key pattern
        const cacheKey = cacheMock.get.mock.calls[0][0] as string;
        expect(cacheKey).toMatch(/^dashboard:stats:/);
        expect(cacheKey).toContain('7d'); // 2-day range resolves to 7d preset
    });

    it('should set cache with 30s TTL', async () => {
        mockComputeStatsOnce();
        cacheMock.get.mockReturnValueOnce(null);
        await DashboardService.getStats({ startDate: '2026-05-01', endDate: '2026-05-02' });

        // Verify cache.set was called with 30s TTL (30000ms)
        expect(cacheMock.set).toHaveBeenCalled();
        const setCall = cacheMock.set.mock.calls[0];
        expect(setCall[2]).toBe(30000); // DASHBOARD_CACHE_TTL = 30 * 1000
    });
});
