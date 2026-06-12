import prisma from '../config/database.js';
import { ActivityQuery, ChartPeriod, StatsDateRangeQuery } from '../validators/dashboard.validator.js';
import { cache } from '../utils/cache.js';

const DASHBOARD_CACHE_TTL = 30 * 1000; // 30 seconds

export function invalidateDashboardCache() {
    cache.invalidatePattern('dashboard:stats:');
}

type ActivityItem = {
    id: string;
    type: 'user' | 'course' | 'chat_space';
    title: string;
    description: string;
    createdAt: Date;
};

type ChartBucket = {
    label: string;
    value: number;
    start: Date;
    end: Date;
};

type NormalizedDateRange = {
    startDate: Date;
    endDate: Date;
    preset: '7d' | '30d' | '90d' | 'custom';
};

const PERIOD_TO_DAYS: Record<ChartPeriod['period'], number> = {
    '7d': 7,
    '30d': 30,
    '90d': 90,
    '1y': 365,
};

const HOT_KEYWORDS = [
    'mengapa',
    'kenapa',
    'bagaimana',
    'analisis',
    'evaluasi',
    'bandingkan',
    'jelaskan',
    'argumentasi',
    'kritik',
    'sintesis',
    'hubungkan',
    'simpulkan',
    'why',
    'how',
    'analyze',
    'evaluate',
    'compare',
    'explain',
];

export class DashboardService {
    static async getStats(rangeQuery: StatsDateRangeQuery = {}) {
        const range = this.resolveDateRange(rangeQuery);
        const cacheKey = `dashboard:stats:${range.preset}:${range.startDate.toISOString()}:${range.endDate.toISOString()}`;
        const cached = cache.get<ReturnType<typeof this.computeStats>>(cacheKey);
        if (cached) return cached;

        const result = await this.computeStats(range);
        cache.set(cacheKey, result, DASHBOARD_CACHE_TTL);
        return result;
    }

    private static async computeStats(range: NormalizedDateRange) {

        const messagesWhere = {
            createdAt: {
                gte: range.startDate,
                lte: range.endDate,
            },
        };

        const usersWhere = {
            createdAt: {
                gte: range.startDate,
                lte: range.endDate,
            },
        };

        const todayStart = this.startOfDay(new Date());

        const [
            totalUsers,
            studentUsers,
            lecturerUsers,
            adminUsers,
            totalCourses,
            activeCourses,
            totalGroups,
            totalChatSpaces,
            totalMessages,
            messagesToday,
            usersCreatedInRange,
            activeMessageSenders,
            aiInteractionsInRange,
            totalMessagesInRange,
            chatSpaceMessageCounts,
            senderMessageCounts,
            recentMessagesForHotCheck,
        ] = await Promise.all([
            prisma.user.count(),
            prisma.user.count({ where: { role: 'student' } }),
            prisma.user.count({ where: { role: 'lecturer' } }),
            prisma.user.count({ where: { role: 'admin' } }),
            prisma.course.count({ where: { isArchived: false } }),
            prisma.course.count({ where: { isArchived: false, isActive: true } }),
            prisma.group.count(),
            prisma.chatSpace.count(),
            prisma.chatMessage.count(),
            prisma.chatMessage.count({
                where: {
                    createdAt: {
                        gte: todayStart,
                    },
                },
            }),
            prisma.user.count({ where: usersWhere }),
            prisma.chatMessage.groupBy({
                by: ['senderId'],
                where: messagesWhere,
            }),
            prisma.chatMessage.count({
                where: {
                    ...messagesWhere,
                    senderType: 'ai',
                },
            }),
            prisma.chatMessage.count({ where: messagesWhere }),
            prisma.chatMessage.groupBy({
                by: ['chatSpaceId'],
                where: messagesWhere,
                _count: { id: true },
            }),
            prisma.chatMessage.groupBy({
                by: ['senderId'],
                where: messagesWhere,
                _count: { id: true },
            }),
            prisma.chatMessage.findMany({
                where: messagesWhere,
                select: { content: true },
                orderBy: { createdAt: 'desc' },
                take: 100,
            }),
        ]);

        const hotThinkingMatches = recentMessagesForHotCheck.filter((message) => this.isHotThinkingMessage(message.content)).length;
        const hotThinkingRatio = recentMessagesForHotCheck.length > 0
            ? hotThinkingMatches / recentMessagesForHotCheck.length
            : 0;
        const hotThinkingPercentage = Number((hotThinkingRatio * 100).toFixed(1));
        const qualityScore = Number(Math.min(100, hotThinkingPercentage * 0.7 + Math.min(totalMessagesInRange, 200) * 0.15).toFixed(1));

        const chatSpaceIds = chatSpaceMessageCounts.map((cs) => cs.chatSpaceId).filter(Boolean) as string[];
        const chatSpaces = await prisma.chatSpace.findMany({
            where: { id: { in: chatSpaceIds } },
            select: {
                id: true,
                group: {
                    select: {
                        course: { select: { id: true, name: true } },
                    },
                },
            },
        });
        const chatSpaceToCourse = new Map<string, { id: string; name: string }>();
        const activeDiscussionIds = new Set<string>();
        chatSpaces.forEach((cs) => {
            chatSpaceToCourse.set(cs.id, cs.group?.course ?? { id: '', name: 'Unknown' });
            activeDiscussionIds.add(cs.id);
        });

        const courseMessageCounts = new Map<string, { id: string; name: string; messageCount: number }>();
        chatSpaceMessageCounts.forEach((cs) => {
            const course = chatSpaceToCourse.get(cs.chatSpaceId);
            if (course?.id) {
                const current = courseMessageCounts.get(course.id) ?? { id: course.id, name: course.name, messageCount: 0 };
                current.messageCount += cs._count.id;
                courseMessageCounts.set(course.id, current);
            }
        });

        const senderIds = senderMessageCounts.map((s) => s.senderId).filter(Boolean) as string[];
        const senders = await prisma.user.findMany({
            where: { id: { in: senderIds } },
            select: { id: true, name: true },
        });
        const senderMap = new Map(senders.map((s) => [s.id, s.name]));
        const userMessageCounts = new Map<string, { id: string; name: string; messageCount: number }>();
        senderMessageCounts.forEach((s) => {
            if (s.senderId) {
                const name = senderMap.get(s.senderId) ?? 'Unknown';
                userMessageCounts.set(s.senderId, { id: s.senderId, name, messageCount: s._count.id });
            }
        });

        const userGrowthData = await this.buildUserGrowthData(range);
        const messageActivityData = await this.buildMessageActivityData(range);

        return {
            range: {
                preset: range.preset,
                startDate: range.startDate.toISOString(),
                endDate: range.endDate.toISOString(),
            },
            users: {
                total: totalUsers,
                byRole: {
                    student: studentUsers,
                    lecturer: lecturerUsers,
                    admin: adminUsers,
                },
                newLast7Days: usersCreatedInRange,
                activeLast24h: activeMessageSenders.length,
            },
            courses: {
                total: totalCourses,
                active: activeCourses,
                totalGroups,
                totalChatSpaces,
            },
            discussions: {
                totalMessages,
                messagesToday,
                aiInteractions: aiInteractionsInRange,
                avgMessagesPerDiscussion: activeDiscussionIds.size > 0
                    ? Number((totalMessagesInRange / activeDiscussionIds.size).toFixed(1))
                    : 0,
            },
            engagement: {
                hotThinkingPercentage,
                qualityScore,
                mostActiveCourse: this.pickMostActive(Array.from(courseMessageCounts.values())),
                mostActiveUser: this.pickMostActive(Array.from(userMessageCounts.values())),
            },
            userGrowthData,
            messageActivityData,
        };
    }

    static async getActivityFeed(query: ActivityQuery) {
        const { limit, offset } = query;
        const take = offset + limit;

        const [recentUsers, recentCourses, recentChatSpaces, totalUsers, totalCourses, totalChatSpaces] =
            await Promise.all([
                prisma.user.findMany({
                    orderBy: { createdAt: 'desc' },
                    take,
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        role: true,
                        createdAt: true,
                    },
                }),
                prisma.course.findMany({
                    where: {
                        isArchived: false,
                    },
                    orderBy: { createdAt: 'desc' },
                    take,
                    select: {
                        id: true,
                        code: true,
                        name: true,
                        createdAt: true,
                        owner: {
                            select: {
                                name: true,
                            },
                        },
                    },
                }),
                prisma.chatSpace.findMany({
                    orderBy: { createdAt: 'desc' },
                    take,
                    select: {
                        id: true,
                        name: true,
                        createdAt: true,
                        group: {
                            select: {
                                name: true,
                            },
                        },
                        _count: {
                            select: {
                                messages: true,
                            },
                        },
                    },
                }),
                prisma.user.count(),
                prisma.course.count({ where: { isArchived: false } }),
                prisma.chatSpace.count(),
            ]);

        const activities: ActivityItem[] = [
            ...recentUsers.map((user) => ({
                id: user.id,
                type: 'user' as const,
                title: 'New user registered',
                description: `${user.name} (${user.email}) joined as ${user.role}`,
                createdAt: user.createdAt,
            })),
            ...recentCourses.map((course) => ({
                id: course.id,
                type: 'course' as const,
                title: 'New course created',
                description: `${course.code} - ${course.name} created by ${course.owner.name}`,
                createdAt: course.createdAt,
            })),
            ...recentChatSpaces.map((chatSpace) => ({
                id: chatSpace.id,
                type: 'chat_space' as const,
                title: 'New discussion space opened',
                description: `${chatSpace.name} created in group ${chatSpace.group.name} with ${chatSpace._count.messages} messages`,
                createdAt: chatSpace.createdAt,
            })),
        ]
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .slice(offset, offset + limit);

        return {
            data: activities,
            meta: {
                limit,
                offset,
                total: totalUsers + totalCourses + totalChatSpaces,
                hasMore: offset + limit < totalUsers + totalCourses + totalChatSpaces,
            },
        };
    }

    static async getUserGrowthChart(period: string) {
        const normalizedPeriod = this.normalizePeriod(period);
        const range = this.resolvePeriodRange(normalizedPeriod);
        const data = await this.buildUserGrowthData(range);

        return {
            period: normalizedPeriod,
            data: data.map((item) => ({
                label: this.formatBucketLabel(new Date(item.date), normalizedPeriod),
                value: item.count,
            })),
        };
    }

    static async getMessageActivityChart(period: string) {
        const normalizedPeriod = this.normalizePeriod(period);
        const range = this.resolvePeriodRange(normalizedPeriod);
        const data = await this.buildMessageActivityData(range);

        return {
            period: normalizedPeriod,
            data: data.map((item) => ({
                label: this.formatBucketLabel(new Date(item.date), normalizedPeriod),
                value: item.count,
            })),
        };
    }

    private static resolveDateRange(rangeQuery: StatsDateRangeQuery): NormalizedDateRange {
        if (rangeQuery.period) {
            return this.resolvePeriodRange(rangeQuery.period);
        }

        const endDate = rangeQuery.endDate ? new Date(rangeQuery.endDate) : new Date();
        const startDate = rangeQuery.startDate ? new Date(rangeQuery.startDate) : this.getDateDaysAgo(6);

        if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
            return this.resolvePeriodRange('7d');
        }

        const normalizedStartDate = this.startOfDay(startDate);
        const normalizedEndDate = this.endOfDay(endDate);
        const diffInDays = Math.max(1, Math.round((normalizedEndDate.getTime() - normalizedStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
        const preset = diffInDays <= 7 ? '7d' : diffInDays <= 30 ? '30d' : diffInDays <= 90 ? '90d' : 'custom';

        return {
            startDate: normalizedStartDate,
            endDate: normalizedEndDate,
            preset,
        };
    }

    private static resolvePeriodRange(period: ChartPeriod['period']): NormalizedDateRange {
        const totalDays = PERIOD_TO_DAYS[period];
        return {
            startDate: this.startOfDay(this.getDateDaysAgo(totalDays - 1)),
            endDate: this.endOfDay(new Date()),
            preset: period === '1y' ? 'custom' : period,
        };
    }

    private static async buildUserGrowthData(range: NormalizedDateRange) {
        const buckets = this.createBucketsForRange(range.startDate, range.endDate);
        const users = await prisma.user.findMany({
            where: {
                createdAt: {
                    gte: range.startDate,
                    lte: range.endDate,
                },
            },
            select: {
                createdAt: true,
            },
            orderBy: {
                createdAt: 'asc',
            },
        });

        users.forEach((item) => {
            const bucket = buckets.find((candidate) => item.createdAt >= candidate.start && item.createdAt < candidate.end);
            if (bucket) {
                bucket.value += 1;
            }
        });

        return buckets.map(({ start, value }) => ({
            date: start.toISOString(),
            count: value,
        }));
    }

    private static async buildMessageActivityData(range: NormalizedDateRange) {
        const buckets = this.createBucketsForRange(range.startDate, range.endDate);
        const messages = await prisma.chatMessage.findMany({
            where: {
                createdAt: {
                    gte: range.startDate,
                    lte: range.endDate,
                },
            },
            select: {
                createdAt: true,
            },
            orderBy: {
                createdAt: 'asc',
            },
        });

        messages.forEach((item) => {
            const bucket = buckets.find((candidate) => item.createdAt >= candidate.start && item.createdAt < candidate.end);
            if (bucket) {
                bucket.value += 1;
            }
        });

        return buckets.map(({ start, value }) => ({
            date: start.toISOString(),
            count: value,
        }));
    }

    private static normalizePeriod(period: string): ChartPeriod['period'] {
        if (period === '7d' || period === '30d' || period === '90d' || period === '1y') {
            return period;
        }

        return '30d';
    }

    private static createBucketsForRange(startDate: Date, endDate: Date) {
        const safeStart = this.startOfDay(startDate);
        const safeEnd = this.endOfDay(endDate);
        const totalDays = Math.max(1, Math.round((safeEnd.getTime() - safeStart.getTime()) / (1000 * 60 * 60 * 24)) + 1);
        const buckets: ChartBucket[] = [];

        for (let index = 0; index < totalDays; index++) {
            const bucketStart = new Date(safeStart);
            bucketStart.setDate(safeStart.getDate() + index);

            const bucketEnd = new Date(bucketStart);
            bucketEnd.setDate(bucketStart.getDate() + 1);

            buckets.push({
                label: this.formatBucketLabel(bucketStart, totalDays > 90 ? '1y' : '30d'),
                value: 0,
                start: bucketStart,
                end: bucketEnd,
            });
        }

        return buckets;
    }

    private static formatBucketLabel(date: Date, period: ChartPeriod['period']) {
        if (period === '1y') {
            return date.toLocaleDateString('en-US', {
                month: 'short',
                year: 'numeric',
            });
        }

        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
        });
    }

    private static pickMostActive<T extends { messageCount: number }>(items: T[]) {
        if (items.length === 0) {
            return null;
        }

        return items.reduce((best, current) => (current.messageCount > best.messageCount ? current : best));
    }

    private static isHotThinkingMessage(content: string) {
        const normalizedContent = content.toLowerCase();
        return HOT_KEYWORDS.some((keyword) => normalizedContent.includes(keyword));
    }

    private static getDateDaysAgo(days: number) {
        const date = new Date();
        date.setDate(date.getDate() - days);
        return this.startOfDay(date);
    }

    private static startOfDay(date: Date) {
        const next = new Date(date);
        next.setHours(0, 0, 0, 0);
        return next;
    }

    private static endOfDay(date: Date) {
        const next = new Date(date);
        next.setHours(23, 59, 59, 999);
        return next;
    }
}
