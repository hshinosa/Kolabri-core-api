import prisma from '../config/database.js';
import { ApiError } from '../middleware/errorHandler.js';
import { getSocketEmitter } from '../utils/socketEmitter.js';
import { logger } from '../utils/logger.js';
import { ChatLog } from '../models/ChatLog.js';
import { aiEngineService } from './aiEngine.service.js';

// Type for ChatSpace with session fields
interface ChatSpaceWithSession {
    id: string;
    name: string;
    closedAt: Date | null;
    closedBy: string | null;
    group: {
        course: { ownerId: string };
        members: { userId: string }[];
    };
}

export class ChatSpaceService {
    /**
     * Close a chat space session (lecturer/admin owner or group member)
     */
    static async closeSession(chatSpaceId: string, userId: string, userRole: 'student' | 'lecturer' | 'admin') {
        const chatSpace = await prisma.chatSpace.findFirst({
            where: { id: chatSpaceId, deletedAt: null },
            include: {
                group: {
                    include: {
                        course: true,
                        members: {
                            select: { userId: true },
                        },
                    },
                },
            },
        }) as ChatSpaceWithSession | null;

        if (!chatSpace) {
            throw ApiError.notFound('Chat space not found');
        }

        if (chatSpace.closedAt) {
            throw ApiError.badRequest('This session is already closed');
        }

        if (userRole === 'lecturer') {
            if (chatSpace.group.course.ownerId !== userId) {
                throw ApiError.forbidden('You do not own this course');
            }
        } else if (userRole === 'student') {
            const isMember = (chatSpace.group.members ?? []).some((member) => member.userId === userId);
            if (!isMember) {
                throw ApiError.forbidden('You are not a member of this group');
            }
        }

        const updatedChatSpace = await prisma.chatSpace.update({
            where: { id: chatSpaceId },
            data: {
                closedAt: new Date(),
                closedBy: userId,
            } as Record<string, unknown>,
        }) as unknown as { id: string; name: string; closedAt: Date | null; closedBy: string | null };

        const roleLabels: Record<'student' | 'lecturer' | 'admin', string> = {
            student: 'mahasiswa',
            lecturer: 'dosen',
            admin: 'admin',
        };
        const actorLabel = roleLabels[userRole] ?? 'pengguna';
        const closeMessage = `Sesi diskusi ini telah ditutup oleh ${actorLabel}.`;

        try {
            getSocketEmitter()?.emit(chatSpaceId, 'session_closed', {
                chatSpaceId,
                closedAt: updatedChatSpace.closedAt?.toISOString(),
                message: closeMessage,
            });
        } catch (error) {
            logger.warn('Failed to broadcast session closure', { error });
        }

        let summary: string | null = null;
        let summaryGeneratedAt: Date | null = null;
        try {
            const recentMessages = await ChatLog.find({
                chatSpaceId,
                isDeleted: { $ne: true },
                senderType: { $in: ['student', 'lecturer'] },
            }).sort({ createdAt: -1 }).limit(30).lean();

            if (recentMessages.length > 0) {
                const summaryResult = await aiEngineService.generateSummary(
                    recentMessages.reverse().map((m) => ({
                        sender: m.senderName,
                        content: m.content,
                        timestamp: new Date(m.createdAt).toISOString(),
                    })),
                    chatSpaceId
                );
                if (summaryResult.success && summaryResult.summary) {
                    summary = summaryResult.summary;
                    summaryGeneratedAt = new Date();
                    await prisma.chatSpace.update({
                        where: { id: chatSpaceId },
                        data: { summary, summaryGeneratedAt },
                    });
                }
            }
        } catch {
            logger.debug('summary_generation_failed');
        }

        return {
            id: updatedChatSpace.id,
            name: updatedChatSpace.name,
            closedAt: updatedChatSpace.closedAt,
            closedBy: updatedChatSpace.closedBy,
            summary,
            summaryGeneratedAt,
        };
    }

    /**
     * Reopen a chat space session (lecturer only)
     */
    static async reopenSession(chatSpaceId: string, userId: string, userRole: string) {
        if (userRole !== 'lecturer') {
            throw ApiError.forbidden('Only lecturers can reopen chat sessions');
        }

        const chatSpace = await prisma.chatSpace.findFirst({
            where: { id: chatSpaceId, deletedAt: null },
            include: {
                group: {
                    include: {
                        course: true,
                    },
                },
            },
        }) as ChatSpaceWithSession | null;

        if (!chatSpace) {
            throw ApiError.notFound('Chat space not found');
        }

        if (chatSpace.group.course.ownerId !== userId) {
            throw ApiError.forbidden('You do not own this course');
        }

        if (!chatSpace.closedAt) {
            throw ApiError.badRequest('This session is not closed');
        }

        const updatedChatSpace = await prisma.chatSpace.update({
            where: { id: chatSpaceId },
            data: {
                closedAt: null,
                closedBy: null,
            } as Record<string, unknown>,
        }) as unknown as { id: string; name: string; closedAt: Date | null; closedBy: string | null };

        try {
            getSocketEmitter()?.emit(chatSpaceId, 'session_reopened', {
                chatSpaceId,
            });
        } catch (error) {
            logger.warn('Failed to broadcast session reopen', { error });
        }

        return {
            id: updatedChatSpace.id,
            name: updatedChatSpace.name,
            closedAt: updatedChatSpace.closedAt,
            closedBy: updatedChatSpace.closedBy,
        };
    }

    /**
     * Check if user has submitted reflection for a closed session
     */
    static async hasSubmittedReflection(chatSpaceId: string, userId: string): Promise<boolean> {
        const reflection = await prisma.reflection.findFirst({
            where: {
                chatSpaceId,
                userId,
            } as Record<string, unknown>,
        });

        return !!reflection;
    }

    /**
     * Get chat space status including reflection requirement
     */
    static async getChatSpaceStatus(chatSpaceId: string, userId: string, userRole: string) {
        const chatSpace = await prisma.chatSpace.findFirst({
            where: { id: chatSpaceId, deletedAt: null },
            include: {
                group: {
                    include: {
                        course: true,
                        members: true,
                    },
                },
                goals: {
                    where: { userId },
                    take: 1,
                },
                reflections: {
                    where: { userId },
                    take: 1,
                },
            } as Record<string, unknown>,
        }) as unknown as (ChatSpaceWithSession & { goals: unknown[]; reflections: unknown[] }) | null;

        if (!chatSpace) {
            throw ApiError.notFound('Chat space not found');
        }

        // Check permission
        if (userRole === 'lecturer') {
            if (chatSpace.group.course.ownerId !== userId) {
                throw ApiError.forbidden('You do not own this course');
            }
        } else {
            const isMember = chatSpace.group.members.some((m: { userId: string }) => m.userId === userId);
            if (!isMember) {
                throw ApiError.forbidden('You are not a member of this group');
            }
        }

        const isClosed = !!chatSpace.closedAt;
        const hasReflection = chatSpace.reflections.length > 0;
        const needsReflection = isClosed && !hasReflection && userRole === 'student';

        return {
            id: chatSpace.id,
            name: chatSpace.name,
            isClosed,
            closedAt: chatSpace.closedAt,
            hasReflection,
            needsReflection,
            hasGoal: chatSpace.goals.length > 0,
        };
    }

    /**
     * Submit session reflection
     */
    static async submitSessionReflection(
        chatSpaceId: string, 
        content: string, 
        userId: string
    ) {
        const chatSpace = await prisma.chatSpace.findFirst({
            where: { id: chatSpaceId, deletedAt: null },
            include: {
                group: {
                    include: {
                        course: true,
                        members: true,
                    },
                },
                goals: {
                    where: { userId: userId },
                    take: 1,
                },
            },
        }) as (ChatSpaceWithSession & { goals: { id: string }[] }) | null;

        if (!chatSpace) {
            throw ApiError.notFound('Chat space not found');
        }

        // Verify user is member
        const isMember = chatSpace.group.members.some((m: { userId: string }) => m.userId === userId);
        if (!isMember) {
            throw ApiError.forbidden('You are not a member of this group');
        }

        // Check if session is closed
        if (!chatSpace.closedAt) {
            throw ApiError.badRequest('Session must be closed before submitting reflection');
        }

        // Check if already submitted
        const existingReflection = await prisma.reflection.findFirst({
            where: {
                chatSpaceId,
                userId,
            } as Record<string, unknown>,
        });

        if (existingReflection) {
            throw ApiError.badRequest('You have already submitted a reflection for this session');
        }

        // Get user's goal for this chat space if exists
        const goalId = chatSpace.goals.length > 0 ? chatSpace.goals[0].id : undefined;

        const reflection = await prisma.reflection.create({
            data: {
                content,
                type: 'session',
                userId,
                chatSpaceId,
                goalId,
            },
            include: {
                user: {
                    select: { id: true, name: true },
                },
                chatSpace: {
                    select: { 
                        id: true, 
                        name: true,
                    },
                },
                goal: {
                    select: { id: true, content: true },
                },
            },
        }) as {
            id: string;
            content: string;
            type: string;
            chatSpace: { id: string; name: string } | null;
            goal: { id: string; content: string } | null;
            user: { id: string; name: string };
            createdAt: Date;
        };

        return {
            id: reflection.id,
            content: reflection.content,
            type: reflection.type,
            chatSpace: reflection.chatSpace,
            goal: reflection.goal,
            createdBy: reflection.user,
            createdAt: reflection.createdAt,
        };
    }

    static async getSummary(chatSpaceId: string, userId: string, userRole: string) {
        const chatSpace = await prisma.chatSpace.findFirst({
            where: { id: chatSpaceId, deletedAt: null },
            select: {
                id: true,
                summary: true,
                summaryGeneratedAt: true,
                group: {
                    select: {
                        course: { select: { ownerId: true } },
                        members: { select: { userId: true } },
                    },
                },
            },
        });

        if (!chatSpace) {
            throw ApiError.notFound('Chat space not found');
        }

        if (userRole === 'student') {
            const isMember = chatSpace.group.members.some((m) => m.userId === userId);
            if (!isMember) {
                throw ApiError.forbidden('You are not a member of this group');
            }
        } else if (userRole === 'lecturer') {
            if (chatSpace.group.course.ownerId !== userId) {
                throw ApiError.forbidden('You do not own this course');
            }
        }

        return {
            summary: chatSpace.summary,
            generatedAt: chatSpace.summaryGeneratedAt,
        };
    }
}
