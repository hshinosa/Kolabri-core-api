/**
 * Chat Analytics Service
 *
 * Calculates analytics from persisted ChatLog data in MongoDB.
 * Provides quality scores, engagement distribution, and recommendations
 * based on actual stored chat messages with engagement analysis.
 */

import { ChatLog, IEngagementAnalysis } from '../models/ChatLog.js';
import { logger } from '../utils/logger.js';

// Plain message type for lean queries
interface LeanChatLog {
    _id?: unknown;
    courseId: string;
    groupId: string;
    sessionDiscussionId: string;
    senderId: string;
    senderName: string;
    senderType: 'student' | 'lecturer' | 'ai' | 'bot' | 'system';
    content: string;
    isIntervention: boolean;
    deletedAt?: Date;
    engagement?: IEngagementAnalysis;
    createdAt: Date;
}

// Analytics result types
export interface QualityBreakdown {
    hotPercentage: number;
    lexicalVariety: number;
    participation: number;
    engagementBalance: number;
}

export interface EngagementDistribution {
    cognitive: number;
    behavioral: number;
    emotional: number;
}

export interface EngagementExample {
    type: 'cognitive' | 'behavioral' | 'emotional';
    text: string;
    indicators: string[];
    isHot: boolean;
}

export interface GroupAnalyticsResult {
    success: boolean;
    groupId: string;
    messageCount: number;
    qualityScore: number;
    qualityBreakdown: QualityBreakdown;
    participants: string[];
    participantCount: number;
    engagementDistribution: EngagementDistribution;
    engagementExamples: EngagementExample[];
    recommendation: string;
    sessionDiscussionStats: {
        sessionDiscussionId: string;
        messageCount: number;
        lastActivity: Date | null;
    }[];
    error?: string;
}

export interface SessionDiscussionAnalyticsResult {
    success: boolean;
    sessionDiscussionId: string;
    messageCount: number;
    qualityScore: number;
    qualityBreakdown: QualityBreakdown;
    participants: string[];
    engagementDistribution: EngagementDistribution;
    engagementExamples: EngagementExample[];
    recommendation: string;
    error?: string;
}

/**
 * Chat Analytics Service Class
 */
export class ChatAnalyticsService {
    /**
     * Get analytics for a group's discussions across all session discussions
     */
    async getGroupAnalytics(groupId: string): Promise<GroupAnalyticsResult> {
        try {
            // Get all messages for this group with engagement data
        const messages = await ChatLog.find({
            groupId,
            deletedAt: null,
            senderType: { $in: ['student', 'lecturer'] }, // Only human messages
        })
                .sort({ createdAt: -1 })
                .lean();

            if (messages.length === 0) {
                return {
                    success: true,
                    groupId,
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
                };
            }

            // Calculate analytics from messages
            const analytics = this.calculateAnalytics(messages);

            // Get session discussion stats
            const sessionDiscussionStats = await this.getSessionDiscussionStats(groupId);

            return {
                success: true,
                groupId,
                messageCount: messages.length,
                ...analytics,
                sessionDiscussionStats,
            };
        } catch (error) {
            logger.error('Chat analytics calculation failed:', error);
            return {
                success: false,
                groupId,
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
                recommendation: 'Terjadi kesalahan saat menghitung analytics.',
                sessionDiscussionStats: [],
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    /**
     * Get analytics for a specific session discussion
     */
    async getSessionDiscussionAnalytics(
        sessionDiscussionId: string
    ): Promise<SessionDiscussionAnalyticsResult> {
        try {
            const messages = await ChatLog.find({
                sessionDiscussionId,
                deletedAt: null,
                senderType: { $in: ['student', 'lecturer'] },
            })
                .sort({ createdAt: -1 })
                .lean();

            if (messages.length === 0) {
                return {
                    success: true,
                    sessionDiscussionId,
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
                };
            }

            const analytics = this.calculateAnalytics(messages);

            return {
                success: true,
                sessionDiscussionId,
                messageCount: messages.length,
                ...analytics,
            };
        } catch (error) {
            logger.error('Session discussion analytics calculation failed:', error);
            return {
                success: false,
                sessionDiscussionId,
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
                recommendation: 'Terjadi kesalahan saat menghitung analytics.',
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    /**
     * Calculate analytics from a list of messages
     */
    private calculateAnalytics(messages: LeanChatLog[]): {
        qualityScore: number;
        qualityBreakdown: QualityBreakdown;
        participants: string[];
        participantCount: number;
        engagementDistribution: EngagementDistribution;
        engagementExamples: EngagementExample[];
        recommendation: string;
    } {
        // Messages with engagement data
        const messagesWithEngagement = messages.filter((m) => m.engagement);

        // Get unique participants
        const participantSet = new Set<string>();
        messages.forEach((m) => {
            if (m.senderName) {
                participantSet.add(m.senderName);
            }
        });
        const participants = Array.from(participantSet);

        // Calculate engagement distribution
        let cognitiveCount = 0;
        let behavioralCount = 0;
        let emotionalCount = 0;
        let hotCount = 0;
        let totalLexicalVariety = 0;

        messagesWithEngagement.forEach((m) => {
            if (m.engagement) {
                switch (m.engagement.engagementType) {
                    case 'cognitive':
                        cognitiveCount++;
                        break;
                    case 'behavioral':
                        behavioralCount++;
                        break;
                    case 'emotional':
                        emotionalCount++;
                        break;
                }
                if (m.engagement.isHigherOrder) {
                    hotCount++;
                }
                totalLexicalVariety += m.engagement.lexicalVariety || 0;
            }
        });

        const totalWithEngagement = messagesWithEngagement.length || 1;
        const engagementDistribution: EngagementDistribution = {
            cognitive: Math.round((cognitiveCount / totalWithEngagement) * 100),
            behavioral: Math.round((behavioralCount / totalWithEngagement) * 100),
            emotional: Math.round((emotionalCount / totalWithEngagement) * 100),
        };

        // Calculate quality breakdown
        const hotPercentage = Math.round((hotCount / totalWithEngagement) * 100);
        const lexicalVariety = Math.round(
            totalLexicalVariety / totalWithEngagement
        );
        const participation = Math.min(100, participants.length * 20); // Max 5 participants = 100%

        // Engagement balance: how evenly distributed are the engagement types
        const values = [cognitiveCount, behavioralCount, emotionalCount];
        const maxVal = Math.max(...values);
        const minVal = Math.min(...values);
        const engagementBalance =
            maxVal > 0 ? Math.round(((maxVal - minVal) / maxVal) * 100) : 0;
        const balanceScore = 100 - engagementBalance; // Higher is more balanced

        const qualityBreakdown: QualityBreakdown = {
            hotPercentage,
            lexicalVariety,
            participation,
            engagementBalance: balanceScore,
        };

        // Calculate overall quality score (weighted average)
        const qualityScore = Math.round(
            hotPercentage * 0.35 +
                lexicalVariety * 0.25 +
                participation * 0.2 +
                balanceScore * 0.2
        );

        // Collect engagement examples
        const engagementExamples: EngagementExample[] = [];
        const examplesByType: Record<string, LeanChatLog[]> = {
            cognitive: [],
            behavioral: [],
            emotional: [],
        };

        messagesWithEngagement.forEach((m) => {
            if (m.engagement) {
                examplesByType[m.engagement.engagementType]?.push(m);
            }
        });

        // Get up to 2 examples per type
        for (const type of ['cognitive', 'behavioral', 'emotional'] as const) {
            const typeMessages = examplesByType[type];
            // Prioritize HOT messages
            const sorted = typeMessages.sort((a, b) => {
                if (a.engagement?.isHigherOrder && !b.engagement?.isHigherOrder)
                    return -1;
                if (!a.engagement?.isHigherOrder && b.engagement?.isHigherOrder)
                    return 1;
                return (b.engagement?.lexicalVariety || 0) - (a.engagement?.lexicalVariety || 0);
            });

            sorted.slice(0, 2).forEach((m) => {
                if (m.engagement) {
                    engagementExamples.push({
                        type,
                        text:
                            m.content.length > 100
                                ? m.content.substring(0, 100) + '...'
                                : m.content,
                        indicators: m.engagement.hotIndicators || [],
                        isHot: m.engagement.isHigherOrder,
                    });
                }
            });
        }

        // Generate recommendation
        const recommendation = this.generateRecommendation(
            qualityScore,
            qualityBreakdown,
            engagementDistribution,
            messages.length
        );

        return {
            qualityScore,
            qualityBreakdown,
            participants,
            participantCount: participants.length,
            engagementDistribution,
            engagementExamples,
            recommendation,
        };
    }

    /**
     * Get statistics per session discussion for a group
     */
    private async getSessionDiscussionStats(
        groupId: string
    ): Promise<{ sessionDiscussionId: string; messageCount: number; lastActivity: Date | null }[]> {
        const stats = await ChatLog.aggregate([
            { $match: { groupId, deletedAt: null } },
            {
                $group: {
                    _id: '$sessionDiscussionId',
                    messageCount: { $sum: 1 },
                    lastActivity: { $max: '$createdAt' },
                },
            },
            { $sort: { lastActivity: -1 } },
        ]);

        return stats.map((s) => ({
            sessionDiscussionId: s._id,
            messageCount: s.messageCount,
            lastActivity: s.lastActivity,
        }));
    }

    /**
     * Generate recommendation based on analytics
     */
    private generateRecommendation(
        qualityScore: number,
        breakdown: QualityBreakdown,
        distribution: EngagementDistribution,
        messageCount: number
    ): string {
        if (messageCount === 0) {
            return 'Belum ada data diskusi untuk dianalisis.';
        }

        const recommendations: string[] = [];

        // Quality score based recommendations
        if (qualityScore < 30) {
            recommendations.push(
                'Kualitas diskusi masih rendah. Perlu pendampingan intensif dari dosen.'
            );
        } else if (qualityScore < 60) {
            recommendations.push(
                'Diskusi berjalan cukup baik, namun masih perlu ditingkatkan.'
            );
        } else {
            recommendations.push('Diskusi berjalan dengan baik dan berkualitas tinggi.');
        }

        // HOT thinking recommendations
        if (breakdown.hotPercentage < 20) {
            recommendations.push(
                'Tingkat berpikir tinggi (HOT) masih rendah. Dorong mahasiswa untuk menganalisis dan mengevaluasi lebih dalam.'
            );
        } else if (breakdown.hotPercentage >= 50) {
            recommendations.push(
                'Mahasiswa menunjukkan kemampuan berpikir tinggi yang baik.'
            );
        }

        // Lexical variety recommendations
        if (breakdown.lexicalVariety < 30) {
            recommendations.push(
                'Variasi kosakata rendah. Dorong penggunaan istilah yang lebih beragam.'
            );
        }

        // Participation recommendations
        if (breakdown.participation < 40) {
            recommendations.push(
                'Partisipasi anggota belum merata. Dorong anggota yang pasif untuk lebih aktif.'
            );
        }

        // Engagement balance recommendations
        if (distribution.cognitive < 20) {
            recommendations.push(
                'Diskusi kognitif masih kurang. Ajukan pertanyaan yang memerlukan analisis.'
            );
        }
        if (distribution.behavioral > 60) {
            recommendations.push(
                'Terlalu banyak koordinasi, kurang substansi. Fokuskan pada isi diskusi.'
            );
        }
        if (distribution.emotional > 40) {
            recommendations.push(
                'Aspek emosional tinggi. Pastikan diskusi tetap konstruktif.'
            );
        }

        return recommendations.join(' ');
    }

    /**
     * Get participant activity details for a group
     */
    async getParticipantActivity(
        groupId: string
    ): Promise<{
        success: boolean;
        participants: {
            name: string;
            messageCount: number;
            hotCount: number;
            avgLexicalVariety: number;
            lastActivity: Date | null;
            engagementTypes: EngagementDistribution;
        }[];
    }> {
        try {
            const stats = await ChatLog.aggregate([
                {
                    $match: {
                        groupId,
                        deletedAt: null,
                        senderType: { $in: ['student', 'lecturer'] },
                    },
                },
                {
                    $group: {
                        _id: '$senderName',
                        messageCount: { $sum: 1 },
                        hotCount: {
                            $sum: { $cond: ['$engagement.isHigherOrder', 1, 0] },
                        },
                        totalLexicalVariety: {
                            $sum: { $ifNull: ['$engagement.lexicalVariety', 0] },
                        },
                        messagesWithEngagement: {
                            $sum: { $cond: [{ $ifNull: ['$engagement', false] }, 1, 0] },
                        },
                        lastActivity: { $max: '$createdAt' },
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
                { $sort: { messageCount: -1 } },
            ]);

            return {
                success: true,
                participants: stats.map((s) => {
                    const total = s.messagesWithEngagement || 1;
                    return {
                        name: s._id,
                        messageCount: s.messageCount,
                        hotCount: s.hotCount,
                        avgLexicalVariety: Math.round(s.totalLexicalVariety / total),
                        lastActivity: s.lastActivity,
                        engagementTypes: {
                            cognitive: Math.round((s.cognitiveCount / total) * 100),
                            behavioral: Math.round((s.behavioralCount / total) * 100),
                            emotional: Math.round((s.emotionalCount / total) * 100),
                        },
                    };
                }),
            };
        } catch (error) {
            logger.error('Participant activity calculation failed:', error);
            return {
                success: false,
                participants: [],
            };
        }
    }
}

// Singleton instance
export const chatAnalyticsService = new ChatAnalyticsService();
