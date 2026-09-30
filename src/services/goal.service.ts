import prisma from '../config/database.js';
import { ApiError } from '../middleware/errorHandler.js';
import { CreateGoalInput } from '../validators/goal.validator.js';
import { validateGoalContent } from '../utils/helpers.js';
import { GroupService } from './group.service.js';
import { aiEngineService } from './aiEngine.service.js';
import { WeekContextService } from './weekContext.service.js';

export class GoalService {
    /**
     * Submit a learning goal (student only) - ONE goal per SessionDiscussion shared by all members
     * When any member creates a goal, it becomes the goal for the entire group
     */
    static async createGoal(data: CreateGoalInput, userId: string) {
        // Extract sessionDiscussionId from snake_case input
        const sessionDiscussionId = data.session_discussion_id;
        
        // Get session discussion with group info
        const sessionDiscussion = await prisma.sessionDiscussion.findFirst({
            where: { id: sessionDiscussionId, deletedAt: null },
            include: {
                group: {
                    select: { id: true, name: true, deletedAt: true },
                },
            },
        });

        if (!sessionDiscussion || sessionDiscussion.group?.deletedAt) {
            throw ApiError.notFound('Session discussion not found');
        }

        // Verify user is member of the group
        const isMember = await GroupService.isGroupMember(sessionDiscussion.groupId, userId);

        if (!isMember) {
            throw ApiError.forbidden('You are not a member of this group');
        }

        // Check if a goal already exists for this session discussion
        const existingGoal = await prisma.learningGoal.findFirst({
            where: { sessionDiscussionId },
            include: {
                user: {
                    select: { id: true, name: true },
                },
                sessionDiscussion: {
                    select: { 
                        id: true, 
                        name: true,
                        group: {
                            select: { id: true, name: true },
                        },
                    },
                },
            },
        });

        // If goal already exists, return the existing goal
        if (existingGoal) {
            return {
                id: existingGoal.id,
                content: existingGoal.content,
                isValidated: existingGoal.isValidated,
                sessionDiscussion: existingGoal.sessionDiscussion,
                createdBy: existingGoal.user,
                createdAt: existingGoal.createdAt,
            };
        }

        // Validate goal content with Bloom's Taxonomy verbs
        const validation = validateGoalContent(data.content);
        if (!validation.isValid) {
            throw ApiError.badRequest(validation.message);
        }

        let isValidated = true;
        let goalFeedback: string | undefined;
        let socraticHint: string | undefined;

        const aiValidation = await aiEngineService.validateGoal(
            data.content,
            userId,
            sessionDiscussionId,
            data.week_context ?? undefined,
            undefined,
            sessionDiscussion.groupId,
        );
        if (aiValidation.success) {
            if (!aiValidation.is_valid || aiValidation.status === 'revise') {
                const hint =
                    aiValidation.socratic_hint ||
                    aiValidation.feedback ||
                    'Perbaiki goal agar selaras dengan minggu dan materi.';
                throw ApiError.badRequest(hint, { status: 'revise', socratic_hint: hint });
            }
            isValidated = aiValidation.is_valid;
            goalFeedback = aiValidation.feedback;
            socraticHint = aiValidation.socratic_hint;
        } else {
            throw ApiError.badRequest(
                'Sistem validasi sedang sibuk. Silakan coba lagi dalam beberapa saat.',
                { status: 'retry' }
            );
        }

        const goal = await prisma.learningGoal.create({
            data: {
                content: data.content,
                sessionDiscussionId,
                userId,
                isValidated,
            },
            include: {
                user: {
                    select: { id: true, name: true },
                },
                sessionDiscussion: {
                    select: { 
                        id: true, 
                        name: true,
                        group: {
                            select: { id: true, name: true },
                        },
                    },
                },
            },
        });

        return {
            id: goal.id,
            content: goal.content,
            isValidated: goal.isValidated,
            sessionDiscussion: goal.sessionDiscussion,
            createdBy: goal.user,
            createdAt: goal.createdAt,
            feedback: goalFeedback,
            socratic_hint: socraticHint,
        };
    }

    /**
     * Get the goal for a session discussion (single shared goal)
     */
    static async getSessionDiscussionGoals(sessionDiscussionId: string, userId: string, role: string) {
        const sessionDiscussion = await prisma.sessionDiscussion.findFirst({
            where: { id: sessionDiscussionId, deletedAt: null },
            include: {
                group: {
                    include: {
                        course: {
                            select: { ownerId: true, deletedAt: true },
                        },
                    },
                },
            },
        });

        if (!sessionDiscussion || sessionDiscussion.group?.deletedAt || sessionDiscussion.group?.course?.deletedAt) {
            throw ApiError.notFound('Session discussion not found');
        }

        // Check access
        if (role === 'lecturer') {
            if (sessionDiscussion.group.course.ownerId !== userId) {
                throw ApiError.forbidden('You do not own this course');
            }
        } else {
            const isMember = await GroupService.isGroupMember(sessionDiscussion.groupId, userId);
            if (!isMember) {
                throw ApiError.forbidden('You are not a member of this group');
            }
        }

        // Get the single shared goal for this session discussion
        const goal = await prisma.learningGoal.findFirst({
            where: { sessionDiscussionId },
            include: {
                user: {
                    select: { id: true, name: true },
                },
                _count: {
                    select: { reflections: true },
                },
            },
            orderBy: { createdAt: 'asc' },
        });

        if (!goal) {
            return [];
        }

        return [{
            id: goal.id,
            content: goal.content,
            isValidated: goal.isValidated,
            createdBy: goal.user,
            reflectionsCount: goal._count.reflections,
            createdAt: goal.createdAt,
        }];
    }

    /**
     * Get user's goals across all session discussions
     */
    static async getMyGoals(userId: string) {
        const goals = await prisma.learningGoal.findMany({
            where: { userId },
            include: {
                sessionDiscussion: {
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
                _count: {
                    select: { reflections: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        return goals.map((goal: typeof goals[number]) => ({
            id: goal.id,
            content: goal.content,
            isValidated: goal.isValidated,
            sessionDiscussion: goal.sessionDiscussion,
            reflectionsCount: goal._count.reflections,
            createdAt: goal.createdAt,
        }));
    }

    /**
     * Get goal details
     */
    static async getGoalDetails(goalId: string, userId: string, role: string) {
        const goal = await prisma.learningGoal.findUnique({
            where: { id: goalId },
            include: {
                user: {
                    select: { id: true, name: true },
                },
                sessionDiscussion: {
                    include: {
                        group: {
                            include: {
                                course: {
                                    select: { id: true, code: true, name: true, ownerId: true },
                                },
                            },
                        },
                    },
                },
                reflections: {
                    include: {
                        user: {
                            select: { id: true, name: true },
                        },
                    },
                    orderBy: { createdAt: 'desc' },
                },
            },
        });

        if (!goal) {
            throw ApiError.notFound('Goal not found');
        }

        // Check access
        if (role === 'lecturer') {
            if (goal.sessionDiscussion.group.course.ownerId !== userId) {
                throw ApiError.forbidden('You do not own this course');
            }
        } else {
            const isMember = await GroupService.isGroupMember(goal.sessionDiscussion.groupId, userId);
            if (!isMember && goal.userId !== userId) {
                throw ApiError.forbidden('You do not have access to this goal');
            }
        }

        return {
            id: goal.id,
            content: goal.content,
            isValidated: goal.isValidated,
            createdBy: goal.user,
            sessionDiscussion: {
                id: goal.sessionDiscussion.id,
                name: goal.sessionDiscussion.name,
                group: {
                    id: goal.sessionDiscussion.group.id,
                    name: goal.sessionDiscussion.group.name,
                    course: goal.sessionDiscussion.group.course,
                },
            },
            reflections: goal.reflections.map((r: typeof goal.reflections[number]) => ({
                id: r.id,
                content: r.content,
                createdBy: r.user,
                createdAt: r.createdAt,
            })),
            createdAt: goal.createdAt,
        };
    }

    /**
     * Get the shared goal for a specific session discussion
     */
    static async getUserGoalInSessionDiscussion(sessionDiscussionId: string, _userId: string) {
        // Get the single shared goal for this session discussion (not user-specific)
        const goal = await prisma.learningGoal.findFirst({
            where: { sessionDiscussionId },
            include: {
                user: {
                    select: { id: true, name: true },
                },
            },
            orderBy: { createdAt: 'asc' },
        });

        if (!goal) {
            return null;
        }

        return {
            id: goal.id,
            content: goal.content,
            isValidated: goal.isValidated,
            createdBy: goal.user,
            createdAt: goal.createdAt,
        };
    }

    /**
     * Get shared goal for a session discussion (any member's goal)
     * Used to check if goals have been set by any group member
     */
    static async getSessionDiscussionSharedGoal(sessionDiscussionId: string, userId: string) {
        const sessionDiscussion = await prisma.sessionDiscussion.findFirst({
            where: { id: sessionDiscussionId, deletedAt: null },
            include: {
                group: {
                    select: { id: true, deletedAt: true },
                },
            },
        });

        if (!sessionDiscussion || sessionDiscussion.group?.deletedAt) {
            throw ApiError.notFound('Session discussion not found');
        }

        // Verify user is member of the group
        const isMember = await GroupService.isGroupMember(sessionDiscussion.groupId, userId);
        if (!isMember) {
            throw ApiError.forbidden('You are not a member of this group');
        }

        // Get the single shared goal for this session discussion
        const goal = await prisma.learningGoal.findFirst({
            where: { sessionDiscussionId },
            include: {
                user: {
                    select: { id: true, name: true },
                },
            },
            orderBy: { createdAt: 'asc' },
        });

        if (!goal) {
            return null;
        }

        return {
            id: goal.id,
            content: goal.content,
            isValidated: goal.isValidated,
            createdBy: goal.user,
            createdAt: goal.createdAt,
        };
    }
}
