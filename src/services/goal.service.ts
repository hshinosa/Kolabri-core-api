import prisma from '../config/database.js';
import { ApiError } from '../middleware/errorHandler.js';
import { CreateGoalInput } from '../validators/goal.validator.js';
import { validateGoalContent } from '../utils/helpers.js';
import { GroupService } from './group.service.js';
import { aiEngineService } from './aiEngine.service.js';

export class GoalService {
    /**
     * Submit a learning goal (student only) - ONE goal per ChatSpace shared by all members
     * When any member creates a goal, it becomes the goal for the entire group
     */
    static async createGoal(data: CreateGoalInput, userId: string) {
        // Extract chatSpaceId from snake_case input
        const chatSpaceId = data.chat_space_id;
        
        // Get chat space with group info
        const chatSpace = await prisma.chatSpace.findUnique({
            where: { id: chatSpaceId },
            include: {
                group: {
                    select: { id: true, name: true },
                },
            },
        });

        if (!chatSpace) {
            throw ApiError.notFound('Chat space not found');
        }

        // Verify user is member of the group
        const isMember = await GroupService.isGroupMember(chatSpace.groupId, userId);

        if (!isMember) {
            throw ApiError.forbidden('You are not a member of this group');
        }

        // Check if a goal already exists for this chat space
        const existingGoal = await prisma.learningGoal.findFirst({
            where: { chatSpaceId },
            include: {
                user: {
                    select: { id: true, name: true },
                },
                chatSpace: {
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
                chatSpace: existingGoal.chatSpace,
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

        const aiValidation = await aiEngineService.validateGoal(data.content, userId, chatSpaceId);
        if (aiValidation.success) {
            if (!aiValidation.is_valid) {
                throw ApiError.badRequest(aiValidation.feedback || 'Goal tidak memenuhi kriteria Bloom\'s taxonomy');
            }
            isValidated = aiValidation.is_valid;
            goalFeedback = aiValidation.feedback;
            socraticHint = aiValidation.socratic_hint;
        }

        const goal = await prisma.learningGoal.create({
            data: {
                content: data.content,
                chatSpaceId,
                userId,
                isValidated,
            },
            include: {
                user: {
                    select: { id: true, name: true },
                },
                chatSpace: {
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
            chatSpace: goal.chatSpace,
            createdBy: goal.user,
            createdAt: goal.createdAt,
            feedback: goalFeedback,
            socratic_hint: socraticHint,
        };
    }

    /**
     * Get the goal for a chat space (single shared goal)
     */
    static async getChatSpaceGoals(chatSpaceId: string, userId: string, role: string) {
        // Get chat space with group and course info
        const chatSpace = await prisma.chatSpace.findUnique({
            where: { id: chatSpaceId },
            include: {
                group: {
                    include: {
                        course: {
                            select: { ownerId: true },
                        },
                    },
                },
            },
        });

        if (!chatSpace) {
            throw ApiError.notFound('Chat space not found');
        }

        // Check access
        if (role === 'lecturer') {
            if (chatSpace.group.course.ownerId !== userId) {
                throw ApiError.forbidden('You do not own this course');
            }
        } else {
            const isMember = await GroupService.isGroupMember(chatSpace.groupId, userId);
            if (!isMember) {
                throw ApiError.forbidden('You are not a member of this group');
            }
        }

        // Get the single shared goal for this chat space
        const goal = await prisma.learningGoal.findFirst({
            where: { chatSpaceId },
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
     * Get user's goals across all chat spaces
     */
    static async getMyGoals(userId: string) {
        const goals = await prisma.learningGoal.findMany({
            where: { userId },
            include: {
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
            chatSpace: goal.chatSpace,
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
                chatSpace: {
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
            if (goal.chatSpace.group.course.ownerId !== userId) {
                throw ApiError.forbidden('You do not own this course');
            }
        } else {
            const isMember = await GroupService.isGroupMember(goal.chatSpace.groupId, userId);
            if (!isMember && goal.userId !== userId) {
                throw ApiError.forbidden('You do not have access to this goal');
            }
        }

        return {
            id: goal.id,
            content: goal.content,
            isValidated: goal.isValidated,
            createdBy: goal.user,
            chatSpace: {
                id: goal.chatSpace.id,
                name: goal.chatSpace.name,
                group: {
                    id: goal.chatSpace.group.id,
                    name: goal.chatSpace.group.name,
                    course: goal.chatSpace.group.course,
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
     * Get the shared goal for a specific chat space
     */
    static async getUserGoalInChatSpace(chatSpaceId: string, _userId: string) {
        // Get the single shared goal for this chat space (not user-specific)
        const goal = await prisma.learningGoal.findFirst({
            where: { chatSpaceId },
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
     * Get shared goal for a chat space (any member's goal)
     * Used to check if goals have been set by any group member
     */
    static async getChatSpaceSharedGoal(chatSpaceId: string, userId: string) {
        // Get chat space with group info
        const chatSpace = await prisma.chatSpace.findUnique({
            where: { id: chatSpaceId },
            include: {
                group: {
                    select: { id: true },
                },
            },
        });

        if (!chatSpace) {
            throw ApiError.notFound('Chat space not found');
        }

        // Verify user is member of the group
        const isMember = await GroupService.isGroupMember(chatSpace.groupId, userId);
        if (!isMember) {
            throw ApiError.forbidden('You are not a member of this group');
        }

        // Get the single shared goal for this chat space
        const goal = await prisma.learningGoal.findFirst({
            where: { chatSpaceId },
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
