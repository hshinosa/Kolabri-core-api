/**
 * Analytics Controller
 * 
 * Provides endpoints for lecturer analytics dashboard.
 * Uses ChatAnalyticsService to calculate analytics from MongoDB ChatLogs.
 * Falls back to AI-Engine for additional analysis when available.
 */

import { Request, Response, NextFunction } from 'express';
import { aiEngineService } from '../services/aiEngine.service.js';
import { chatAnalyticsService } from '../services/chatAnalytics.service.js';
import prisma from '../config/database.js';
import { ApiError } from '../middleware/errorHandler.js';
import { ChatLog } from '../models/ChatLog.js';

export class AnalyticsController {
    /**
     * Get analytics for a specific group
     * Uses ChatAnalyticsService to calculate from persisted MongoDB data
     */
    static async getGroupAnalytics(req: Request, res: Response, next: NextFunction) {
        try {
            const { groupId } = req.params;
            const userId = req.user?.userId;
            const role = req.user?.role;

            // Verify the user is a lecturer who owns the course
            const group = await prisma.group.findUnique({
                where: { id: groupId },
                include: {
                    course: { select: { ownerId: true, name: true, code: true } },
                    members: {
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true,
                                },
                            },
                        },
                    },
                    chatSpaces: {
                        select: {
                            id: true,
                            name: true,
                            closedAt: true,
                            createdAt: true,
                        },
                        orderBy: { createdAt: 'desc' },
                    },
                },
            });

            if (!group) {
                throw ApiError.notFound('Group not found');
            }

            if (role === 'lecturer' && group.course.ownerId !== userId) {
                throw ApiError.forbidden('You do not own this course');
            }

            // Get analytics from ChatAnalyticsService (calculated from MongoDB)
            const chatAnalytics = await chatAnalyticsService.getGroupAnalytics(groupId);

            // Get recent messages for activity timeline
            const recentMessages = await ChatLog.find({
                groupId,
                isDeleted: { $ne: true },
            })
                .sort({ createdAt: -1 })
                .limit(20)
                .lean();

            // Format members for frontend
            const members = group.members.map((m) => ({
                id: m.user.id,
                name: m.user.name,
                email: m.user.email,
            }));

            // Format chat spaces for frontend
            const chatSpaces = group.chatSpaces.map((cs) => ({
                id: cs.id,
                name: cs.name,
                isClosed: !!cs.closedAt,
                closedAt: cs.closedAt,
                createdAt: cs.createdAt,
            }));

            res.json({
                success: true,
                group: {
                    id: group.id,
                    name: group.name,
                    course: group.course,
                    memberCount: group.members.length,
                    chatSpaceCount: group.chatSpaces.length,
                },
                members,
                chatSpaces,
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
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get analytics for all groups in a course
     * Overview for lecturer dashboard
     */
    static async getCourseAnalytics(req: Request, res: Response, next: NextFunction) {
        try {
            const { courseId } = req.params;
            const userId = req.user?.userId;

            // Verify ownership
            const course = await prisma.course.findUnique({
                where: { id: courseId },
                include: {
                    groups: {
                        include: {
                            members: { select: { userId: true } },
                            chatSpaces: {
                                select: {
                                    id: true,
                                    name: true,
                                    closedAt: true,
                                },
                            },
                        },
                    },
                },
            });

            if (!course) {
                throw ApiError.notFound('Course not found');
            }

            if (course.ownerId !== userId) {
                throw ApiError.forbidden('You do not own this course');
            }

            // Get analytics for each group from ChatAnalyticsService
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

            // Calculate course-level aggregates
            const totalMessages = groupAnalytics.reduce((sum, g) => sum + g.messageCount, 0);
            const groupsWithData = groupAnalytics.filter((g) => g.messageCount > 0);
            const avgQuality = groupsWithData.length > 0
                ? groupsWithData.reduce((sum, g) => sum + g.qualityScore, 0) / groupsWithData.length
                : null;
            const groupsNeedingAttention = groupAnalytics.filter((g) => g.needsAttention && g.messageCount > 0).length;

            res.json({
                success: true,
                course: {
                    id: course.id,
                    name: course.name,
                    code: course.code,
                },
                summary: {
                    totalGroups: course.groups.length,
                    totalMessages,
                    averageQualityScore: avgQuality ? Math.round(avgQuality * 10) / 10 : null,
                    groupsNeedingAttention,
                },
                groups: groupAnalytics,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Analyze a specific text for engagement metrics
     */
    static async analyzeText(req: Request, res: Response, next: NextFunction) {
        try {
            const { text } = req.body;

            if (!text || typeof text !== 'string') {
                throw ApiError.badRequest('Text is required');
            }

            const analysis = await aiEngineService.analyzeEngagement(text);

            res.json({
                success: true,
                analysis,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Export process mining data for a course
     */
    static async exportProcessMining(req: Request, res: Response, next: NextFunction) {
        try {
            const { courseId } = req.params;
            const userId = req.user?.userId;

            // Verify ownership
            const course = await prisma.course.findUnique({
                where: { id: courseId },
            });

            if (!course) {
                throw ApiError.notFound('Course not found');
            }

            if (course.ownerId !== userId) {
                throw ApiError.forbidden('You do not own this course');
            }

            const exportResult = await aiEngineService.exportProcessMiningData();

            res.json({
                success: true,
                export: exportResult,
                course: {
                    id: course.id,
                    name: course.name,
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get chat space analytics
     */
    static async getChatSpaceAnalytics(req: Request, res: Response, next: NextFunction) {
        try {
            const { chatSpaceId } = req.params;
            const userId = req.user?.userId;
            const role = req.user?.role;

            // Verify access
            const chatSpace = await prisma.chatSpace.findUnique({
                where: { id: chatSpaceId },
                include: {
                    group: {
                        include: {
                            course: { select: { ownerId: true } },
                            members: { select: { userId: true } },
                        },
                    },
                    goals: {
                        select: {
                            id: true,
                            content: true,
                            userId: true,
                        },
                    },
                    reflections: {
                        select: {
                            id: true,
                            content: true,
                            userId: true,
                            createdAt: true,
                        },
                    },
                },
            });

            if (!chatSpace) {
                throw ApiError.notFound('Chat space not found');
            }

            if (role === 'lecturer' && chatSpace.group.course.ownerId !== userId) {
                throw ApiError.forbidden('You do not own this course');
            }

            // Get analytics from ChatAnalyticsService
            const analytics = await chatAnalyticsService.getChatSpaceAnalytics(chatSpaceId);

            // Get messages from MongoDB
            const messages = await ChatLog.find({
                chatSpaceId,
                isDeleted: { $ne: true },
            })
                .sort({ createdAt: 1 })
                .lean();

            // Calculate session-specific metrics
            const studentMessages = messages.filter((m) => m.senderType === 'student');
            const aiMentions = messages.filter((m) => m.content.toLowerCase().includes('@ai'));
            const interventions = messages.filter((m) => m.isIntervention);

            // Analyze engagement for each participant
            const participantStats: Record<string, { messageCount: number; avgLength: number }> = {};
            for (const msg of studentMessages) {
                if (!participantStats[msg.senderName]) {
                    participantStats[msg.senderName] = { messageCount: 0, avgLength: 0 };
                }
                participantStats[msg.senderName].messageCount++;
                participantStats[msg.senderName].avgLength += msg.content.length;
            }

            // Calculate averages
            for (const name in participantStats) {
                participantStats[name].avgLength = Math.round(
                    participantStats[name].avgLength / participantStats[name].messageCount
                );
            }

            res.json({
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
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get real-time quality status for a group
     * Used for live monitoring in lecturer dashboard
     */
    static async getGroupQualityStatus(req: Request, res: Response, next: NextFunction) {
        try {
            const { groupId } = req.params;
            const userId = req.user?.userId;

            // Quick ownership check
            const group = await prisma.group.findUnique({
                where: { id: groupId },
                select: {
                    id: true,
                    name: true,
                    course: { select: { ownerId: true } },
                },
            });

            if (!group) {
                throw ApiError.notFound('Group not found');
            }

            if (group.course.ownerId !== userId) {
                throw ApiError.forbidden('You do not own this course');
            }

            // Get recent message count (last hour)
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            const recentCount = await ChatLog.countDocuments({
                groupId,
                createdAt: { $gte: oneHourAgo },
                senderType: { $in: ['student', 'lecturer'] },
            });

            // Get analytics from ChatAnalyticsService
            const analytics = await chatAnalyticsService.getGroupAnalytics(groupId);

            res.json({
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
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get participant activity details for a group
     */
    static async getParticipantActivity(req: Request, res: Response, next: NextFunction) {
        try {
            const { groupId } = req.params;
            const userId = req.user?.userId;

            // Quick ownership check
            const group = await prisma.group.findUnique({
                where: { id: groupId },
                select: {
                    id: true,
                    name: true,
                    course: { select: { ownerId: true } },
                },
            });

            if (!group) {
                throw ApiError.notFound('Group not found');
            }

            if (group.course.ownerId !== userId) {
                throw ApiError.forbidden('You do not own this course');
            }

            const activity = await chatAnalyticsService.getParticipantActivity(groupId);

            res.json({
                success: activity.success,
                groupId,
                groupName: group.name,
                participants: activity.participants,
            });
        } catch (error) {
            next(error);
        }
    }
}
