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
                    lexical_variety: chatAnalytics.qualityBreakdown.lexicalVariety / 100,
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
}
