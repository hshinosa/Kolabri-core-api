import prisma from '../config/database.js';
import { ApiError } from '../middleware/errorHandler.js';
import { ChatLog } from '../models/ChatLog.js';
import { chatAnalyticsService } from './chatAnalytics.service.js';
import { aiEngineService } from './aiEngine.service.js';
import { providerResolutionService } from './providerResolution.service.js';
import { Parser } from 'json2csv';

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
        const recentMessages = await ChatLog.find({ groupId, deletedAt: null })
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
                    id: group.id,
                    name: group.name,
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
        const trends = await this.getCourseTrends(courseId);

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
            trends,
        };
    }

    static async getStudentBreakdown(
        courseId: string,
        options: {
            page: number;
            perPage: number;
            sortBy: string;
            sortDir: string;
            search?: string;
            minScore?: number;
            maxScore?: number;
            startDate?: string;
            endDate?: string;
        }
    ) {
        const { page, perPage, sortBy, sortDir, search, minScore, maxScore, startDate, endDate } = options;

        const enrollments = await prisma.courseStudent.findMany({
            where: { courseId },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });

        const studentsWithMetrics = await Promise.all(
            enrollments.map(async (enrollment) => {
                const chatLogs = await ChatLog.find({
                    courseId,
                    senderId: enrollment.user.id,
                    deletedAt: null,
                    ...(startDate && { createdAt: { $gte: new Date(startDate) } }),
                    ...(endDate && { createdAt: { $lte: new Date(endDate) } }),
                }).lean();

                const messageCount = chatLogs.length;
                const hotCount = chatLogs.filter((log) => log.engagement?.isHigherOrder).length;
                const hotPercentage = messageCount > 0 ? (hotCount / messageCount) * 100 : 0;

                const avgLexical = chatLogs.reduce((sum, log) => sum + (log.engagement?.lexicalVariety || 0), 0) / (messageCount || 1);
                
                let cognitiveCount = 0;
                let behavioralCount = 0;
                let emotionalCount = 0;
                chatLogs.forEach((log) => {
                    if (log.engagement) {
                        switch (log.engagement.engagementType) {
                            case 'cognitive': cognitiveCount++; break;
                            case 'behavioral': behavioralCount++; break;
                            case 'emotional': emotionalCount++; break;
                        }
                    }
                });
                
                const totalWithEngagement = chatLogs.filter((log) => log.engagement).length || 1;
                const engagementValues = [cognitiveCount, behavioralCount, emotionalCount];
                const maxVal = Math.max(...engagementValues);
                const minVal = Math.min(...engagementValues);
                const engagementBalance = maxVal > 0 ? Math.round(((maxVal - minVal) / maxVal) * 100) : 0;
                const balanceScore = 100 - engagementBalance;
                
                const participation = Math.min(100, messageCount * 5);
                
                const qualityScore = Math.round(
                    hotPercentage * 0.35 +
                    avgLexical * 0.25 +
                    participation * 0.2 +
                    balanceScore * 0.2
                );

                const engagementScore = Math.min(100, Math.round((messageCount / 10) * 0.5 + qualityScore * 0.5));

                const lastActive = chatLogs.length > 0
                    ? chatLogs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0].createdAt
                    : null;

                return {
                    id: enrollment.user.id,
                    name: enrollment.user.name,
                    email: enrollment.user.email,
                    qualityScore: messageCount > 0 ? qualityScore : null,
                    hotPercentage: Math.round(hotPercentage * 10) / 10,
                    messageCount,
                    engagementScore: messageCount > 0 ? engagementScore : null,
                    lastActive: lastActive?.toISOString() || null,
                };
            })
        );

        let filtered = studentsWithMetrics;
        if (search) {
            const searchLower = search.toLowerCase();
            filtered = filtered.filter(
                (s) => s.name.toLowerCase().includes(searchLower) || s.email.toLowerCase().includes(searchLower)
            );
        }

        if (minScore !== undefined) {
            filtered = filtered.filter((s) => s.qualityScore !== null && s.qualityScore >= minScore);
        }
        if (maxScore !== undefined) {
            filtered = filtered.filter((s) => s.qualityScore !== null && s.qualityScore <= maxScore);
        }

        filtered.sort((a, b) => {
            let aVal = a[sortBy as keyof typeof a];
            let bVal = b[sortBy as keyof typeof b];
            
            if (aVal === null) aVal = -Infinity;
            if (bVal === null) bVal = -Infinity;
            
            if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });

        const total = filtered.length;
        const offset = (page - 1) * perPage;
        const paginated = filtered.slice(offset, offset + perPage);

        return {
            data: paginated,
            meta: {
                total,
                per_page: perPage,
                current_page: page,
                last_page: Math.ceil(total / perPage),
            },
        };
    }

    private static async getCourseTrends(courseId: string) {
        const rows = await ChatLog.aggregate([
            {
                $match: {
                    courseId,
                    deletedAt: null,
                    createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
                },
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' },
                        day: { $dayOfMonth: '$createdAt' },
                    },
                    avgLexical: { $avg: { $ifNull: ['$engagement.lexicalVariety', 0] } },
                    messageCount: { $sum: 1 },
                    hotCount: { $sum: { $cond: [{ $ifNull: ['$engagement.isHigherOrder', false] }, 1, 0] } },
                    activeSenders: { $addToSet: '$senderId' },
                    cognitiveCount: {
                        $sum: {
                            $cond: [{ $eq: ['$engagement.engagementType', 'cognitive'] }, 1, 0],
                        },
                    },
                    behavioralCount: {
                        $sum: {
                            $cond: [{ $eq: ['$engagement.engagementType', 'behavioral'] }, 1, 0],
                        },
                    },
                    emotionalCount: {
                        $sum: {
                            $cond: [{ $eq: ['$engagement.engagementType', 'emotional'] }, 1, 0],
                        },
                    },
                },
            },
            { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
        ]);

        const points = rows.map((row) => {
            const date = `${row._id.year}-${String(row._id.month).padStart(2, '0')}-${String(row._id.day).padStart(2, '0')}`;
            const hotPercentage = row.messageCount > 0 ? (row.hotCount / row.messageCount) * 100 : 0;

            const avgLex = row.avgLexical ?? 0;
            
            const engagementValues = [row.cognitiveCount ?? 0, row.behavioralCount ?? 0, row.emotionalCount ?? 0];
            const maxVal = Math.max(...engagementValues);
            const minVal = Math.min(...engagementValues);
            const engagementBalance = maxVal > 0 ? Math.round(((maxVal - minVal) / maxVal) * 100) : 0;
            const balanceScore = 100 - engagementBalance;
            
            const participation = Math.min(100, (row.activeSenders?.length ?? 0) * 20);
            
            const qualityScore = Math.round(
                hotPercentage * 0.35 +
                avgLex * 0.25 +
                participation * 0.2 +
                balanceScore * 0.2
            );

            return {
                date,
                quality_score: Math.min(100, qualityScore),
                hot_percentage: Math.round(hotPercentage * 10) / 10,
                engagement: Math.min(100, Math.round(row.messageCount * 5)),
                lexical_variety: Math.min(100, Math.round(avgLex)),
            };
        });

        return points;
    }

    static async analyzeText(text: string) {
        if (!text || typeof text !== 'string') throw ApiError.badRequest('Text is required');
        const analysis = await providerResolutionService.executeWithFallback(
            { featureFamily: 'analytics' },
            (providerContext) => aiEngineService.analyzeEngagement(text, providerContext),
            {
                isSuccess: (response) => response.success,
                perProviderTimeoutMs: 15000,
            },
        );
        return { success: true, analysis };
    }

    static async exportProcessMining(courseId: string, userId: string | undefined, format: string = 'json') {
        const course = await prisma.course.findFirst({ where: { id: courseId, deletedAt: null } });
        if (!course) throw ApiError.notFound('Course not found');
        if (course.ownerId !== userId) throw ApiError.forbidden('You do not own this course');

        const exportResult = await providerResolutionService.executeWithFallback(
            { featureFamily: 'analytics' },
            (providerContext) => aiEngineService.exportProcessMiningData(providerContext),
            {
                isSuccess: (response) => response.success,
                perProviderTimeoutMs: 15000,
            },
        );
        
        if (format === 'csv') {
            const csvData = this.formatAnalyticsAsCSV(exportResult);
            return { success: true, format: 'csv', data: csvData, course: { id: course.id, name: course.name } };
        }
        
        return { success: true, export: exportResult, course: { id: course.id, name: course.name } };
    }

    static formatAnalyticsAsCSV(data: any): string {
        // If data is an array, convert directly
        if (Array.isArray(data)) {
            if (data.length === 0) return '';
            const parser = new Parser();
            return parser.parse(data);
        }

        // If data is an object with nested arrays, flatten it
        const flatData: any[] = [];
        
        if (data && typeof data === 'object') {
            // Try to extract meaningful tabular data
            for (const key in data) {
                if (Array.isArray(data[key]) && data[key].length > 0) {
                    // Add the key as a section identifier
                    data[key].forEach((item: any) => {
                        flatData.push({
                            section: key,
                            ...item
                        });
                    });
                } else if (typeof data[key] === 'object' && data[key] !== null) {
                    // Flatten nested objects
                    flatData.push({
                        section: key,
                        ...data[key]
                    });
                } else {
                    // Single values
                    flatData.push({
                        key: key,
                        value: data[key]
                    });
                }
            }
        }

        if (flatData.length === 0) {
            // Fallback: convert the object to key-value pairs
            return 'key,value\n' + Object.entries(data || {})
                .map(([k, v]) => `${k},"${JSON.stringify(v).replace(/"/g, '""')}"`)
                .join('\n');
        }

        const parser = new Parser();
        return parser.parse(flatData);
    }

    static async getAnalyticsSummary(courseId: string, userId: string | undefined) {
        const course = await prisma.course.findFirst({ where: { id: courseId, deletedAt: null } });
        if (!course) throw ApiError.notFound('Course not found');
        if (course.ownerId !== userId) throw ApiError.forbidden('You do not own this course');

        const courseAnalytics = await this.getCourseAnalytics(courseId, userId);
        
        const totalMessages = courseAnalytics.summary.totalMessages;
        const totalGroups = courseAnalytics.summary.totalGroups;
        const avgQualityScore = courseAnalytics.summary.averageQualityScore;
        const groupsNeedingAttention = courseAnalytics.summary.groupsNeedingAttention;

        const studentCount = await prisma.courseStudent.count({
            where: { courseId }
        });

        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const groups = await prisma.group.findMany({
            where: { courseId, deletedAt: null },
            select: { id: true }
        });
        const groupIds = groups.map(g => g.id);

        const recentMessageCount = await ChatLog.countDocuments({
            groupId: { $in: groupIds },
            deletedAt: null,
            createdAt: { $gte: thirtyDaysAgo }
        });

        return {
            success: true,
            summary: {
                courseId: course.id,
                courseName: course.name,
                courseCode: course.code,
                totalStudents: studentCount,
                totalGroups,
                totalMessages,
                messagesLast30Days: recentMessageCount,
                averageQualityScore: avgQualityScore,
                groupsNeedingAttention,
                generatedAt: new Date().toISOString()
            }
        };
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
        const messages = await ChatLog.find({ chatSpaceId, deletedAt: null })
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
            deletedAt: null,
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

    static async getStudentRecentActivity(userId: string, limit: number = 5) {
        const memberships = await prisma.groupMember.findMany({
            where: { userId },
            select: {
                group: {
                    select: {
                        id: true,
                        name: true,
                        course: { select: { name: true } },
                    },
                },
            },
        });

        const groupMap = new Map(
            memberships
                .filter((m) => m.group)
                .map((m) => [m.group.id, { name: m.group.name, courseName: m.group.course?.name || 'Unknown' }]),
        );
        const groupIds = [...groupMap.keys()];

        if (groupIds.length === 0) return [];

        const recentLogs = await ChatLog.find({
            groupId: { $in: groupIds },
            deletedAt: null,
            senderType: { $in: ['student', 'lecturer'] },
        })
            .sort({ createdAt: -1 })
            .limit(limit)
            .select({ _id: 1, senderName: 1, senderType: 1, content: 1, createdAt: 1, groupId: 1 });

        return recentLogs.map((log) => {
            const group = groupMap.get(log.groupId);
            return {
                id: log._id.toString(),
                type: 'message',
                senderName: log.senderName,
                senderType: log.senderType,
                content: log.content.substring(0, 150),
                createdAt: log.createdAt,
                groupName: group?.name || 'Unknown',
                courseName: group?.courseName || 'Unknown',
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

        // PERF-DB-01: Batch all groups across all courses in a single query
        const allGroupCourseMap = new Map<string, string>(); // groupId -> courseId
        for (const course of courses) {
            // Fetch groups for this course
        }

        // Fetch all groups for all courses at once
        const allGroups = await prisma.group.findMany({
            where: { courseId: { in: courses.map(c => c.id) }, deletedAt: null },
            select: { id: true, courseId: true },
        });
        const groupsByCourse = new Map<string, string[]>();
        for (const g of allGroups) {
            const arr = groupsByCourse.get(g.courseId) || [];
            arr.push(g.id);
            groupsByCourse.set(g.courseId, arr);
        }

        const qualityTrends = await Promise.all(
            courses.map(async (course) => {
                const groupIds = groupsByCourse.get(course.id) || [];

                if (groupIds.length === 0) {
                    return { courseName: course.name, courseCode: course.code, data: [] };
                }

                const weeklyData = await ChatLog.aggregate([
                    {
                        $match: {
                            groupId: { $in: groupIds },
                            deletedAt: null,
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
                    { $limit: 52 }, // PERF-DB-05: Safety limit (max 52 weeks)
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

        // PERF-DB-01: Batch all group analytics instead of N+1 per course
        const allGroupIds = courses.flatMap(c => c.groups.map(g => g.id));
        const allGroupAnalytics = await Promise.all(
            allGroupIds.map(async (groupId) => {
                const analytics = await chatAnalyticsService.getGroupAnalytics(groupId);
                return { groupId, qualityScore: analytics.qualityScore, messageCount: analytics.messageCount };
            })
        );
        const analyticsMap = new Map(allGroupAnalytics.map(a => [a.groupId, a]));

        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const result = courses.map((course) => {
            const groupIds = course.groups.map((g) => g.id);

            const groupAnalytics = groupIds
                .map(id => analyticsMap.get(id))
                .filter((g): g is { groupId: string; qualityScore: number; messageCount: number } => g !== undefined);

            const groupsWithData = groupAnalytics.filter((g) => g.messageCount > 0);
            const avgQualityScore = groupsWithData.length > 0
                ? Math.round(groupsWithData.reduce((sum, g) => sum + g.qualityScore, 0) / groupsWithData.length)
                : null;

            const hasLowQuality = groupAnalytics.some((g) => g.messageCount > 0 && g.qualityScore < 50);

            return {
                courseId: course.id,
                courseName: course.name,
                courseCode: course.code,
                studentsCount: course._count.students,
                groupsCount: course._count.groups,
                avgQualityScore,
                needsAttention: hasLowQuality, // lastActivity filled below
                lastActivity: null as Date | null,
            };
        });

        // Batch last activity query for all groups at once
        const lastLogs = await ChatLog.find({
            groupId: { $in: allGroupIds },
            deletedAt: null,
            senderType: { $in: ['student', 'lecturer'] },
        })
            .sort({ createdAt: -1 })
            .select({ groupId: 1, createdAt: 1 });

        // Map last activity per course
        const lastActivityByGroup = new Map<string, Date>();
        for (const log of lastLogs) {
            if (!lastActivityByGroup.has(log.groupId)) {
                lastActivityByGroup.set(log.groupId, log.createdAt);
            }
        }

        for (const course of result) {
            const groupIds = courses.find(c => c.id === course.courseId)?.groups.map(g => g.id) || [];
            const lastActivity = groupIds
                .map(id => lastActivityByGroup.get(id))
                .filter((d): d is Date => d !== undefined)
                .sort((a, b) => b.getTime() - a.getTime())[0] || null;

            course.lastActivity = lastActivity;
            const isInactive = !lastActivity || new Date(lastActivity) < sevenDaysAgo;
            course.needsAttention = course.needsAttention || isInactive;
        }

        return { success: true, courses: result };
    }
}
