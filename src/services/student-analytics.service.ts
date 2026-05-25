import prisma from '../config/database.js';
import { ApiError } from '../middleware/errorHandler.js';

interface RadarMetrics {
    consistency: number;
    participation: number;
    reflection: number;
    engagement: number;
}

interface RecentActivity {
    id: string;
    type: 'message' | 'reflection' | 'goal';
    description: string;
    timestamp: Date;
    chatSpaceName?: string;
    groupName?: string;
}

interface ParticipationTrend {
    direction: 'up' | 'down' | 'stable';
    percentage: number;
}

interface StudentAnalyticsData {
    weeksActive: number;
    sessionsJoined: number;
    participationTrend: ParticipationTrend;
    radarMetrics: RadarMetrics;
    recentActivities: RecentActivity[];
}

export class StudentAnalyticsService {
    /**
     * Get analytics data for a student
     */
    static async getStudentAnalytics(userId: string): Promise<StudentAnalyticsData> {
        const user = await prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw ApiError.notFound('User not found');
        }

        // Calculate metrics in parallel
        const [weeksActive, sessionsJoined, participationTrend, radarMetrics, recentActivities] = await Promise.all([
            this.calculateWeeksActive(userId),
            this.calculateSessionsJoined(userId),
            this.calculateParticipationTrend(userId),
            this.calculateRadarMetrics(userId),
            this.getRecentActivities(userId),
        ]);

        return {
            weeksActive,
            sessionsJoined,
            participationTrend,
            radarMetrics,
            recentActivities,
        };
    }

    /**
     * Calculate weeks active: count of unique groups the student has activity in
     */
    private static async calculateWeeksActive(userId: string): Promise<number> {
        const uniqueGroups = await prisma.chatMessage.findMany({
            where: {
                senderId: userId,
            },
            select: {
                chatSpace: {
                    select: {
                        groupId: true,
                    },
                },
            },
            distinct: ['chatSpaceId'],
        });

        const groupIds = new Set(uniqueGroups.map((msg) => msg.chatSpace.groupId));
        return groupIds.size;
    }

    /**
     * Calculate sessions joined: count of distinct chat spaces the student has messages in
     */
    private static async calculateSessionsJoined(userId: string): Promise<number> {
        const count = await prisma.chatMessage.groupBy({
            by: ['chatSpaceId'],
            where: {
                senderId: userId,
            },
        });

        return count.length;
    }

    /**
     * Calculate participation trend: compare this week vs last week
     */
    private static async calculateParticipationTrend(userId: string): Promise<ParticipationTrend> {
        const now = new Date();
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

        const [thisWeekCount, lastWeekCount] = await Promise.all([
            prisma.chatMessage.count({
                where: {
                    senderId: userId,
                    createdAt: {
                        gte: oneWeekAgo,
                    },
                },
            }),
            prisma.chatMessage.count({
                where: {
                    senderId: userId,
                    createdAt: {
                        gte: twoWeeksAgo,
                        lt: oneWeekAgo,
                    },
                },
            }),
        ]);

        if (lastWeekCount === 0) {
            return {
                direction: thisWeekCount > 0 ? 'up' : 'stable',
                percentage: thisWeekCount > 0 ? 100 : 0,
            };
        }

        const change = ((thisWeekCount - lastWeekCount) / lastWeekCount) * 100;

        if (Math.abs(change) < 10) {
            return { direction: 'stable', percentage: 0 };
        }

        return {
            direction: change > 0 ? 'up' : 'down',
            percentage: Math.abs(Math.round(change)),
        };
    }

    /**
     * Calculate radar metrics: consistency, participation, reflection, engagement
     */
    private static async calculateRadarMetrics(userId: string): Promise<RadarMetrics> {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        // Get data for last 30 days
        const [messageCount, reflectionCount, totalMessages, activeDays] = await Promise.all([
            // User's message count
            prisma.chatMessage.count({
                where: {
                    senderId: userId,
                    createdAt: { gte: thirtyDaysAgo },
                },
            }),
            // User's reflection count
            prisma.reflection.count({
                where: {
                    userId,
                    createdAt: { gte: thirtyDaysAgo },
                },
            }),
            // Total messages in user's groups (for comparison)
            this.getTotalMessagesInUserGroups(userId, thirtyDaysAgo),
            // Count active days
            this.getActiveDaysCount(userId, thirtyDaysAgo),
        ]);

        // Consistency: based on active days (0-100)
        const consistency = Math.min(100, Math.round((activeDays / 30) * 100));

        // Participation: based on message count vs average (0-100)
        const avgMessagesPerUser = totalMessages > 0 ? totalMessages / 10 : 1; // assume 10 users avg
        const participation = Math.min(100, Math.round((messageCount / Math.max(1, avgMessagesPerUser)) * 50));

        // Reflection: based on reflection count (0-100)
        const reflection = Math.min(100, reflectionCount * 10);

        // Engagement: mix of metrics (0-100)
        const engagement = Math.round((consistency + participation + reflection) / 3);

        return {
            consistency,
            participation,
            reflection,
            engagement,
        };
    }

    /**
     * Get total messages in groups where user is a member
     */
    private static async getTotalMessagesInUserGroups(userId: string, since: Date): Promise<number> {
        const userGroups = await prisma.groupMember.findMany({
            where: { userId },
            select: { groupId: true },
        });

        if (userGroups.length === 0) return 0;

        const groupIds = userGroups.map((gm) => gm.groupId);

        const count = await prisma.chatMessage.count({
            where: {
                chatSpace: {
                    groupId: { in: groupIds },
                },
                createdAt: { gte: since },
            },
        });

        return count;
    }

    /**
     * Get count of unique days user was active
     */
    private static async getActiveDaysCount(userId: string, since: Date): Promise<number> {
        const messages = await prisma.chatMessage.findMany({
            where: {
                senderId: userId,
                createdAt: { gte: since },
            },
            select: {
                createdAt: true,
            },
        });

        const uniqueDays = new Set(
            messages.map((msg) => msg.createdAt.toISOString().split('T')[0])
        );

        return uniqueDays.size;
    }

    /**
     * Get recent activities (messages, reflections, goals)
     */
    private static async getRecentActivities(userId: string): Promise<RecentActivity[]> {
        const [recentMessages, recentReflections] = await Promise.all([
            prisma.chatMessage.findMany({
                where: { senderId: userId },
                orderBy: { createdAt: 'desc' },
                take: 5,
                include: {
                    chatSpace: {
                        include: {
                            group: true,
                        },
                    },
                },
            }),
            prisma.reflection.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                take: 5,
                include: {
                    chatSpace: {
                        include: {
                            group: true,
                        },
                    },
                },
            }),
        ]);

        const activities: RecentActivity[] = [];

        // Add messages
        recentMessages.forEach((msg) => {
            activities.push({
                id: msg.id,
                type: 'message',
                description: `Mengirim pesan di ${msg.chatSpace.name}`,
                timestamp: msg.createdAt,
                chatSpaceName: msg.chatSpace.name,
                groupName: msg.chatSpace.group.name,
            });
        });

        // Add reflections
        recentReflections.forEach((ref) => {
            activities.push({
                id: ref.id,
                type: 'reflection',
                description: ref.chatSpace
                    ? `Menulis refleksi untuk ${ref.chatSpace.name}`
                    : 'Menulis refleksi',
                timestamp: ref.createdAt,
                chatSpaceName: ref.chatSpace?.name,
                groupName: ref.chatSpace?.group?.name,
            });
        });

        // Sort by timestamp and take top 10
        activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

        return activities.slice(0, 10);
    }
}
