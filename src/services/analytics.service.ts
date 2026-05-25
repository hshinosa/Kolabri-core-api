import prisma from '../config/database.js';
import { ApiError } from '../middleware/errorHandler.js';
import { ChatLog } from '../models/ChatLog.js';
import { chatAnalyticsService } from './chatAnalytics.service.js';
import { aiEngineService } from './aiEngine.service.js';

export class AnalyticsService {
    static async getGroupAnalytics(groupId: string, userId: string | undefined, role: string | undefined) {
        const group = await prisma.group.findFirst({
            where: { id: groupId, deletedAt: null },
            include: {
                course: { select: { ownerId: true, name: true, code: true } },
                members: { include: { user: { select: { id: true, name: true, email: true } } } },
                chatSpaces: {
                    select: { id: true, name: true, closedAt: true, createdAt: true },
                    orderBy: { createdAt: 'desc' },
                },
            },
        });

        if (!group) throw ApiError.notFound('Group not found');
        if (role === 'lecturer' && group.course.ownerId !== userId) {
            throw ApiError.forbidden('You do not own this course');
        }

        const chatAnalytics = await chatAnalyticsService.getGroupAnalytics(groupId);
        const recentMessages = await ChatLog.find({ groupId, isDeleted: { $ne: true } })
            .sort({ createdAt: -1 }).limit(20).lean();

        return {
            success: true,
            group: {
                id: group.id,
                name: group.name,
                course: group.course,
                memberCount: group.members.length,
                chatSpaceCount: group.chatSpaces.length,
            },
            members: group.members.map((m) => ({ id: m.user.id, name: m.user.name, email: m.user.email })),
            chatSpaces: group.chatSpaces.map((cs) => ({
                id: cs.id, name: cs.name, isClosed: !!cs.closedAt, closedAt: cs.closedAt, createdAt: cs.createdAt,
            })),
            analytics: {
                qualityScore: chatAnalytics.qualityScore,
                recommendation: chatAnalytics.recommendation,
                engagementDistribution: chatAnalytics.engagementDistribution,
                engagementExamples: chatAnalytics.engagementExamples,
                hotPercentage: chatAnalytics.qualityBreakdown.hotPercentage,
                qualityBreakdown: {
                    lexical_variety: chatAnalytics.qualityBreakdown.lexicalVariety,
                    hot_percentage: chatAnalytics.qualityBreakdown.hotPercentage,
                    participation: chatAnalytics.participantCount,
                    lexical_score: chatAnalytics.qualityBreakdown.lexicalVariety,
                    hot_score: chatAnalytics.qualityBreakdown.hotPercentage,
                    cognitive_ratio: chatAnalytics.engagementDistribution.cognitive,
                },
                local_message_count: chatAnalytics.messageCount,
                participants: chatAnalytics.participants,
                participantCount: chatAnalytics.participantCount,
            },
            recentActivity: recentMessages.map((msg) => ({
                id: msg._id?.toString(),
                senderName: msg.senderName,
                senderType: msg.senderType,
                content: msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : ''),
                createdAt: msg.createdAt,
                isIntervention: msg.isIntervention,
            })),
        };
    }

    static async getCourseAnalytics(courseId: string, userId: string | undefined) {
        const course = await prisma.course.findFirst({
            where: { id: courseId, deletedAt: null },
            include: {
                groups: {
                    include: {
                        members: { select: { userId: true } },
                        chatSpaces: { select: { id: true, name: true, closedAt: true } },
                    },
                },
            },
        });

        if (!course) throw ApiError.notFound('Course not found');
        if (course.ownerId !== userId) throw ApiError.forbidden('You do not own this course');

        const groupAnalytics = await Promise.all(
            course.groups.map(async (group) => {
                const analytics = await chatAnalyticsService.getGroupAnalytics(group.id);
                return {
                    groupId: group.id,
                    groupName: group.name,
                    memberCount: group.members.length,
                    chatSpaceCount: group.chatSpaces.length,
                    messageCount: analytics.messageCount,
                    qualityScore: analytics.qualityScore,
                    recommendation: analytics.recommendation,
                    engagementDistribution: analytics.engagementDistribution,
                    needsAttention: analytics.qualityScore < 50,
                };
            })
        );

        const totalMessages = groupAnalytics.reduce((sum, g) => sum + g.messageCount, 0);
        const groupsWithData = groupAnalytics.filter((g) => g.messageCount > 0);
        const avgQuality = groupsWithData.length > 0
            ? groupsWithData.reduce((sum, g) => sum + g.qualityScore, 0) / groupsWithData.length
            : null;
        const groupsNeedingAttention = groupAnalytics.filter((g) => g.needsAttention && g.messageCount > 0).length;

        return {
            success: true,
            course: { id: course.id, name: course.name, code: course.code },
            summary: {
                totalGroups: course.groups.length,
                totalMessages,
                averageQualityScore: avgQuality ? Math.round(avgQuality * 10) / 10 : null,
                groupsNeedingAttention,
            },
            groups: groupAnalytics,
        };
    }

    static async analyzeText(text: string) {
        if (!text || typeof text !== 'string') throw ApiError.badRequest('Text is required');
        const analysis = await aiEngineService.analyzeEngagement(text);
        return { success: true, analysis };
    }

    static async exportProcessMining(courseId: string, userId: string | undefined) {
        const course = await prisma.course.findFirst({ where: { id: courseId, deletedAt: null } });
        if (!course) throw ApiError.notFound('Course not found');
        if (course.ownerId !== userId) throw ApiError.forbidden('You do not own this course');

        const exportResult = await aiEngineService.exportProcessMiningData();
        return { success: true, export: exportResult, course: { id: course.id, name: course.name } };
    }

    static async getChatSpaceAnalytics(chatSpaceId: string, userId: string | undefined, role: string | undefined) {
        const chatSpace = await prisma.chatSpace.findUnique({
            where: { id: chatSpaceId },
            include: {
                group: {
                    include: {
                        course: { select: { ownerId: true } },
                        members: { select: { userId: true } },
                    },
                },
                goals: { select: { id: true, content: true, userId: true } },
                reflections: { select: { id: true, content: true, userId: true, createdAt: true } },
            },
        });

        if (!chatSpace) throw ApiError.notFound('Chat space not found');
        if (role === 'lecturer' && chatSpace.group.course.ownerId !== userId) {
            throw ApiError.forbidden('You do not own this course');
        }

        const analytics = await chatAnalyticsService.getChatSpaceAnalytics(chatSpaceId);
        const messages = await ChatLog.find({ chatSpaceId, isDeleted: { $ne: true } })
            .sort({ createdAt: 1 }).lean();

        const studentMessages = messages.filter((m) => m.senderType === 'student');
        const aiMentions = messages.filter((m) => m.content.toLowerCase().includes('@ai'));
        const interventions = messages.filter((m) => m.isIntervention);

        const participantStats: Record<string, { messageCount: number; avgLength: number }> = {};
        for (const msg of studentMessages) {
            if (!participantStats[msg.senderName]) {
                participantStats[msg.senderName] = { messageCount: 0, avgLength: 0 };
            }
            participantStats[msg.senderName].messageCount++;
            participantStats[msg.senderName].avgLength += msg.content.length;
        }
        for (const name in participantStats) {
            participantStats[name].avgLength = Math.round(
                participantStats[name].avgLength / participantStats[name].messageCount
            );
        }

        return {
            success: true,
            chatSpace: {
                id: chatSpace.id,
                name: chatSpace.name,
                groupId: chatSpace.group.id,
                groupName: chatSpace.group.name,
                isClosed: !!chatSpace.closedAt,
                closedAt: chatSpace.closedAt,
            },
            metrics: {
                totalMessages: messages.length,
                studentMessages: studentMessages.length,
                aiMentions: aiMentions.length,
                interventions: interventions.length,
                goalsCount: chatSpace.goals.length,
                reflectionsCount: chatSpace.reflections.length,
            },
            participantStats,
            groupAnalytics: {
                qualityScore: analytics.qualityScore,
                recommendation: analytics.recommendation,
                engagementDistribution: analytics.engagementDistribution,
                engagementExamples: analytics.engagementExamples,
            },
            timeline: messages.map((msg) => ({
                id: msg._id?.toString(),
                senderName: msg.senderName,
                senderType: msg.senderType,
                content: msg.content.substring(0, 150) + (msg.content.length > 150 ? '...' : ''),
                createdAt: msg.createdAt,
                isIntervention: msg.isIntervention,
            })),
        };
    }

    static async getGroupQualityStatus(groupId: string, userId: string | undefined) {
        const group = await prisma.group.findFirst({
            where: { id: groupId, deletedAt: null },
            select: { id: true, name: true, course: { select: { ownerId: true } } },
        });

        if (!group) throw ApiError.notFound('Group not found');
        if (group.course.ownerId !== userId) throw ApiError.forbidden('You do not own this course');

        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const recentCount = await ChatLog.countDocuments({
            groupId,
            createdAt: { $gte: oneHourAgo },
            senderType: { $in: ['student', 'lecturer'] },
        });

        const analytics = await chatAnalyticsService.getGroupAnalytics(groupId);

        return {
            success: true,
            groupId,
            groupName: group.name,
            recentMessageCount: recentCount,
            qualityScore: analytics.qualityScore,
            status: analytics.messageCount === 0
                ? 'no_data'
                : analytics.qualityScore >= 70
                ? 'good'
                : analytics.qualityScore >= 50
                ? 'moderate'
                : 'needs_attention',
            recommendation: analytics.recommendation,
        };
    }

    static async getParticipantActivity(groupId: string, userId: string | undefined) {
        const group = await prisma.group.findFirst({
            where: { id: groupId, deletedAt: null },
            select: { id: true, name: true, course: { select: { ownerId: true } } },
        });

        if (!group) throw ApiError.notFound('Group not found');
        if (group.course.ownerId !== userId) throw ApiError.forbidden('You do not own this course');

        const activity = await chatAnalyticsService.getParticipantActivity(groupId);

        return {
            success: activity.success,
            groupId,
            groupName: group.name,
            participants: activity.participants,
        };
    }

    static async getRecentActivity(userId: string, limit: number = 5) {
        const courses = await prisma.course.findMany({
            where: { ownerId: userId, deletedAt: null },
            select: { id: true, name: true },
        });

        const courseIds = courses.map(c => c.id);
        const courseMap = new Map(courses.map(c => [c.id, c.name]));

        if (courseIds.length === 0) return [];

        const groups = await prisma.group.findMany({
            where: { courseId: { in: courseIds }, deletedAt: null },
            select: { id: true, name: true, courseId: true },
        });

        const groupIds = groups.map(g => g.id);
        const groupMap = new Map(groups.map(g => [g.id, { name: g.name, courseId: g.courseId }]));

        if (groupIds.length === 0) return [];

        const recentLogs = await ChatLog.find({
            groupId: { $in: groupIds },
            isDeleted: { $ne: true },
            senderType: { $in: ['student', 'lecturer'] },
        })
            .sort({ createdAt: -1 })
            .limit(limit)
            .select({
                _id: 1,
                senderName: 1,
                senderType: 1,
                content: 1,
                createdAt: 1,
                groupId: 1,
            });

        return recentLogs.map(log => {
            const group = groupMap.get(log.groupId);
            return {
                id: log._id.toString(),
                senderName: log.senderName,
                senderType: log.senderType,
                content: log.content.substring(0, 150),
                createdAt: log.createdAt,
                groupName: group?.name || 'Unknown',
                courseName: group ? courseMap.get(group.courseId) || 'Unknown' : 'Unknown',
            };
        });
    }

    static async getDashboardCharts(userId: string) {
        const courses = await prisma.course.findMany({
            where: { ownerId: userId, deletedAt: null },
            include: {
                _count: { select: { groups: true, students: true } },
            },
        });

        const courseIds = courses.map(c => c.id);

        const classDistribution = courses.map(c => ({
            name: c.name,
            code: c.code,
            groupCount: c._count.groups,
            studentCount: c._count.students,
        }));

        const qualityTrends = await Promise.all(
            courses.map(async (course) => {
                const groups = await prisma.group.findMany({
                    where: { courseId: course.id, deletedAt: null },
                    select: { id: true },
                });
                const groupIds = groups.map(g => g.id);

                if (groupIds.length === 0) {
                    return { courseName: course.name, courseCode: course.code, data: [] };
                }

                const weeklyData = await ChatLog.aggregate([
                    {
                        $match: {
                            groupId: { $in: groupIds },
                            isDeleted: { $ne: true },
                            createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
                        },
                    },
                    {
                        $group: {
                            _id: {
                                week: { $week: '$createdAt' },
                                year: { $year: '$createdAt' },
                            },
                            avgLexical: { $avg: { $ifNull: ['$engagement.lexicalVariety', 0] } },
                            messageCount: { $sum: 1 },
                            hotCount: {
                                $sum: { $cond: [{ $ifNull: ['$engagement.isHigherOrder', false] }, 1, 0] },
                            },
                        },
                    },
                    { $sort: { '_id.year': 1, '_id.week': 1 } },
                ]);

                const data = weeklyData.map((w) => ({
                    week: `Minggu ${w._id.week}`,
                    messageCount: w.messageCount,
                    lexicalVariety: Math.round(w.avgLexical),
                    hotPercentage: w.messageCount > 0 ? Math.round((w.hotCount / w.messageCount) * 100) : 0,
                }));

                return { courseName: course.name, courseCode: course.code, data };
            })
        );

        return { classDistribution, qualityTrends };
    }

    static async getAnalyticsOverview(userId: string) {
        const courses = await prisma.course.findMany({
            where: { ownerId: userId, deletedAt: null },
            include: {
                _count: { select: { students: true, groups: true } },
                groups: {
                    where: { deletedAt: null },
                    select: { id: true },
                },
            },
        });

        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const result = await Promise.all(
            courses.map(async (course) => {
                const groupIds = course.groups.map((g) => g.id);

                const groupAnalytics = await Promise.all(
                    groupIds.map(async (groupId) => {
                        const analytics = await chatAnalyticsService.getGroupAnalytics(groupId);
                        return {
                            qualityScore: analytics.qualityScore,
                            messageCount: analytics.messageCount,
                        };
                    })
                );

                const groupsWithData = groupAnalytics.filter((g) => g.messageCount > 0);
                const avgQualityScore = groupsWithData.length > 0
                    ? Math.round(groupsWithData.reduce((sum, g) => sum + g.qualityScore, 0) / groupsWithData.length)
                    : null;

                const hasLowQuality = groupAnalytics.some((g) => g.messageCount > 0 && g.qualityScore < 50);

                const lastLog = await ChatLog.findOne({
                    groupId: { $in: groupIds },
                    isDeleted: { $ne: true },
                    senderType: { $in: ['student', 'lecturer'] },
                })
                    .sort({ createdAt: -1 })
                    .select({ createdAt: 1 });

                const lastActivity = lastLog?.createdAt ?? null;
                const isInactive = !lastActivity || new Date(lastActivity) < sevenDaysAgo;

                return {
                    courseId: course.id,
                    courseName: course.name,
                    courseCode: course.code,
                    studentsCount: course._count.students,
                    groupsCount: course._count.groups,
                    avgQualityScore,
                    needsAttention: hasLowQuality || isInactive,
                    lastActivity,
                };
            })
        );

        return { success: true, courses: result };
    }
}
