import prisma from '../config/database.js';
import { ApiError } from '../middleware/errorHandler.js';
import { CreateReflectionInput } from '../validators/reflection.validator.js';

export class ReflectionService {
    /**
     * Submit a reflection for a goal
     */
    static async createReflection(data: CreateReflectionInput, userId: string) {
        // Verify goal exists and user has access
        const goal = await prisma.learningGoal.findUnique({
            where: { id: data.goalId },
            include: {
                chatSpace: {
                    include: {
                        group: {
                            include: {
                                members: {
                                    select: { userId: true },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!goal) {
            throw ApiError.notFound('Goal not found');
        }

        // Check if user is member of the goal's group (via goal.chatSpace.group)
        const isMember = !!(goal.chatSpace && goal.chatSpace.group && goal.chatSpace.group.members.some((m) => m.userId === userId));
        if (!isMember) {
            throw ApiError.forbidden('You are not a member of this group');
        }

        const reflection = await prisma.reflection.create({
            data: {
                content: data.content,
                goalId: data.goalId,
                userId,
            },
            include: {
                user: {
                    select: { id: true, name: true },
                },
                goal: {
                    select: { id: true, content: true },
                },
            },
        });

        return {
            id: reflection.id,
            content: reflection.content,
            goal: reflection.goal,
            createdBy: reflection.user,
            createdAt: reflection.createdAt,
        };
    }

    /**
     * Get user's reflections
     */
    static async getMyReflections(userId: string) {
        const reflections = await prisma.reflection.findMany({
            where: { userId },
            include: {
                goal: {
                    select: {
                        id: true,
                        content: true,
                        chatSpace: {
                            select: {
                                id: true,
                                name: true,
                                group: {
                                    select: {
                                        id: true,
                                        name: true,
                                        course: {
                                            select: { id: true, code: true, name: true },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                chatSpace: {
                    select: {
                        id: true,
                        name: true,
                        group: {
                            select: {
                                id: true,
                                name: true,
                                course: {
                                    select: { id: true, code: true, name: true },
                                },
                            },
                        },
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        return reflections.map((r) => {
            const sourceChatSpace = r.chatSpace ?? r.goal?.chatSpace ?? null;
            const sourceGroup = sourceChatSpace?.group ?? null;
            const sourceCourse = sourceGroup?.course ?? null;

            return {
                id: r.id,
                content: r.content,
                type: r.type,
                goal: r.goal
                    ? {
                        id: r.goal.id,
                        content: r.goal.content,
                    }
                    : null,
                chatSpace: sourceChatSpace
                    ? {
                        id: sourceChatSpace.id,
                        name: sourceChatSpace.name,
                    }
                    : null,
                course: sourceCourse
                    ? {
                        id: sourceCourse.id,
                        code: sourceCourse.code,
                        name: sourceCourse.name,
                    }
                    : null,
                group: sourceGroup
                    ? {
                        id: sourceGroup.id,
                        name: sourceGroup.name,
                    }
                    : null,
                createdAt: r.createdAt,
                created_at: r.createdAt,
            };
        });
    }

    /**
     * Get reflections for a goal
     */
    static async getGoalReflections(goalId: string, userId: string, role: string) {
        const goal = await prisma.learningGoal.findUnique({
            where: { id: goalId },
            include: {
                chatSpace: {
                    include: {
                        group: {
                            include: {
                                course: { select: { ownerId: true } },
                                members: { select: { userId: true } },
                            },
                        },
                    },
                },
            },
        });

        if (!goal) {
            throw ApiError.notFound('Goal not found');
        }

        // Check access
        if (role === 'lecturer') {
            if (!goal.chatSpace || !goal.chatSpace.group || goal.chatSpace.group.course.ownerId !== userId) {
                throw ApiError.forbidden('You do not own this course');
            }
        } else {
            const isMember = !!(goal.chatSpace && goal.chatSpace.group && goal.chatSpace.group.members.some((m) => m.userId === userId));
            if (!isMember) {
                throw ApiError.forbidden('You are not a member of this group');
            }
        }

        const reflections = await prisma.reflection.findMany({
            where: { goalId },
            include: {
                user: {
                    select: { id: true, name: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        return reflections.map((r: typeof reflections[number]) => ({
            id: r.id,
            content: r.content,
            createdBy: r.user,
            createdAt: r.createdAt,
        }));
    }
}
