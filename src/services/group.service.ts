import prisma from '../config/database.js';
import { ApiError } from '../middleware/errorHandler.js';
import { CreateGroupInput } from '../validators/group.validator.js';
import { randomBytes } from 'crypto';

// Generate a unique join code
const generateJoinCode = (): string => {
    return randomBytes(4).toString('hex').toUpperCase();
};

export class GroupService {
    /**
     * Delete a group (lecturer only, cascade deletes members/chat spaces)
     */
    static async deleteGroup(groupId: string, userId: string, userRole: string) {
        if (userRole !== 'lecturer') {
            throw ApiError.forbidden('Only lecturers can delete groups');
        }

        const group = await prisma.group.findUnique({
            where: { id: groupId },
            include: {
                course: {
                    select: { ownerId: true },
                },
            },
        });

        if (!group) {
            throw ApiError.notFound('Group not found');
        }

        if (group.course.ownerId !== userId) {
            throw ApiError.forbidden('You do not own this course');
        }

        await prisma.group.delete({
            where: { id: groupId },
        });

        return { success: true };
    }

    /**
     * Create a new group in a course (lecturer or student can create)
     */
    static async createGroup(courseId: string, data: CreateGroupInput, userId: string, userRole: string) {
        // Verify access to course
        const course = await prisma.course.findUnique({
            where: { id: courseId },
        });

        if (!course) {
            throw ApiError.notFound('Course not found');
        }

        // Lecturers must own the course, students must be enrolled
        if (userRole === 'lecturer') {
            if (course.ownerId !== userId) {
                throw ApiError.forbidden('You do not own this course');
            }
        } else {
            const enrollment = await prisma.courseStudent.findUnique({
                where: {
                    courseId_userId: { courseId, userId },
                },
            });
            if (!enrollment) {
                throw ApiError.forbidden('You are not enrolled in this course');
            }
        }

        // Generate unique join code
        let joinCode = generateJoinCode();
        let attempts = 0;
        while (attempts < 5) {
            const existing = await prisma.group.findUnique({ where: { joinCode } });
            if (!existing) break;
            joinCode = generateJoinCode();
            attempts++;
        }

        // Extract memberIds from snake_case input (optional)
        const memberIds = data.member_ids || [];

        // Create group with transaction
        const group = await prisma.$transaction(async (tx) => {
            // Create the group
            const newGroup = await tx.group.create({
                data: {
                    name: data.name,
                    courseId,
                    joinCode,
                    createdBy: userId,
                },
            });

            // Add creator as first member if student
            if (userRole === 'student') {
                await tx.groupMember.create({
                    data: {
                        groupId: newGroup.id,
                        userId,
                    },
                });
            }

            // Add members if provided (lecturer flow)
            if (memberIds.length > 0) {
                // Verify all members are enrolled in the course
                const enrollments = await tx.courseStudent.findMany({
                    where: {
                        courseId,
                        userId: { in: memberIds },
                    },
                });

                if (enrollments.length !== memberIds.length) {
                    throw ApiError.badRequest('Some members are not enrolled in this course');
                }

                await tx.groupMember.createMany({
                    data: memberIds.map((uid: string) => ({
                        groupId: newGroup.id,
                        userId: uid,
                    })),
                    skipDuplicates: true,
                });
            }

            return newGroup;
        });

        // Fetch complete group data
        return this.getGroupById(group.id);
    }

    /**
     * Join a group by join code
     */
    static async joinGroupByCode(joinCode: string, userId: string) {
        const group = await prisma.group.findUnique({
            where: { joinCode },
            include: {
                course: true,
            },
        });

        if (!group) {
            throw ApiError.notFound('Invalid join code');
        }

        // Verify user is enrolled in the course
        const enrollment = await prisma.courseStudent.findUnique({
            where: {
                courseId_userId: {
                    courseId: group.courseId,
                    userId,
                },
            },
        });

        if (!enrollment) {
            throw ApiError.forbidden('You must be enrolled in this course to join the group');
        }

        // Check if already a member
        const existingMember = await prisma.groupMember.findUnique({
            where: {
                groupId_userId: { groupId: group.id, userId },
            },
        });

        if (existingMember) {
            throw ApiError.badRequest('You are already a member of this group');
        }

        // Add member
        await prisma.groupMember.create({
            data: {
                groupId: group.id,
                userId,
            },
        });

        return this.getGroupById(group.id);
    }

    /**
     * Invite members to a group (by group member or lecturer)
     */
    static async inviteMembers(groupId: string, memberIds: string[], userId: string, userRole: string) {
        const group = await prisma.group.findUnique({
            where: { id: groupId },
            include: {
                course: true,
                members: true,
            },
        });

        if (!group) {
            throw ApiError.notFound('Group not found');
        }

        // Check permission
        if (userRole === 'lecturer') {
            if (group.course.ownerId !== userId) {
                throw ApiError.forbidden('You do not own this course');
            }
        } else {
            const isMember = group.members.some((m) => m.userId === userId);
            if (!isMember) {
                throw ApiError.forbidden('You are not a member of this group');
            }
        }

        // Verify all invitees are enrolled in the course
        const enrollments = await prisma.courseStudent.findMany({
            where: {
                courseId: group.courseId,
                userId: { in: memberIds },
            },
        });

        if (enrollments.length !== memberIds.length) {
            throw ApiError.badRequest('Some users are not enrolled in this course');
        }

        // Add members (ignore duplicates)
        await prisma.groupMember.createMany({
            data: memberIds.map((uid) => ({
                groupId,
                userId: uid,
            })),
            skipDuplicates: true,
        });

        return this.getGroupById(groupId);
    }

    /**
     * Get group by ID with full details
     */
    static async getGroupById(groupId: string) {
        const group = await prisma.group.findUnique({
            where: { id: groupId },
            include: {
                course: {
                    select: { id: true, code: true, name: true, ownerId: true },
                },
                members: {
                    include: {
                        user: {
                            select: { id: true, name: true, email: true },
                        },
                    },
                },
                chatSpaces: {
                    include: {
                        _count: {
                            select: {
                                goals: true,
                            },
                        },
                    },
                    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
                },
                _count: {
                    select: {
                        members: true,
                        chatSpaces: true,
                    },
                },
            },
        });

        if (!group) {
            throw ApiError.notFound('Group not found');
        }

        return {
            id: group.id,
            name: group.name,
            joinCode: group.joinCode,
            courseId: group.course.id,
            course: group.course,
            members: group.members.map((m) => m.user),
            chatSpaces: group.chatSpaces.map((cs) => ({
                id: cs.id,
                name: cs.name,
                description: cs.description,
                isDefault: cs.isDefault,
            })),
            goalsCount: group.chatSpaces.reduce((sum, cs) => sum + (cs._count?.goals ?? 0), 0),
            createdAt: group.createdAt,
        };
    }

    /**
     * Add members to an existing group
     */
    static async addMembersToGroup(courseId: string, groupId: string, memberIds: string[], lecturerId: string) {
        // Verify course ownership
        const course = await prisma.course.findUnique({
            where: { id: courseId },
        });

        if (!course) {
            throw ApiError.notFound('Course not found');
        }

        if (course.ownerId !== lecturerId) {
            throw ApiError.forbidden('You do not own this course');
        }

        // Verify group belongs to course
        const group = await prisma.group.findUnique({
            where: { id: groupId },
        });

        if (!group || group.courseId !== courseId) {
            throw ApiError.notFound('Group not found in this course');
        }

        // Verify all members are enrolled in the course
        const enrollments = await prisma.courseStudent.findMany({
            where: {
                courseId,
                userId: { in: memberIds },
            },
        });

        if (enrollments.length !== memberIds.length) {
            throw ApiError.badRequest('Some members are not enrolled in this course');
        }

        // Add members (ignore duplicates)
        await prisma.groupMember.createMany({
            data: memberIds.map((userId) => ({
                groupId,
                userId,
            })),
            skipDuplicates: true,
        });

        return this.getGroupById(groupId);
    }

    /**
     * Get all groups in a course
     */
    static async getCourseGroups(courseId: string, userId: string, role: string) {
        // Verify access
        const course = await prisma.course.findUnique({
            where: { id: courseId },
        });

        if (!course) {
            throw ApiError.notFound('Course not found');
        }

        if (role === 'lecturer') {
            if (course.ownerId !== userId) {
                throw ApiError.forbidden('You do not own this course');
            }
        } else {
            const enrollment = await prisma.courseStudent.findUnique({
                where: {
                    courseId_userId: {
                        courseId,
                        userId,
                    },
                },
            });

            if (!enrollment) {
                throw ApiError.forbidden('You are not enrolled in this course');
            }
        }

        const groups = await prisma.group.findMany({
            where: { courseId },
            include: {
                members: {
                    include: {
                        user: {
                            select: { id: true, name: true, email: true },
                        },
                    },
                },
                chatSpaces: {
                    include: {
                        _count: {
                            select: {
                                goals: true,
                            },
                        },
                    },
                    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
                },
                _count: {
                    select: {
                        members: true,
                        chatSpaces: true,
                    },
                },
            },
            orderBy: { createdAt: 'asc' },
        });

        return groups.map((group) => ({
            id: group.id,
            name: group.name,
            joinCode: group.joinCode,
            members: group.members.map((m) => m.user),
            chatSpaces: group.chatSpaces.map((cs) => ({
                id: cs.id,
                name: cs.name,
                isDefault: cs.isDefault,
            })),
            goalsCount: group.chatSpaces.reduce((sum, cs) => sum + (cs._count?.goals ?? 0), 0),
            createdAt: group.createdAt,
        }));
    }

    /**
     * Get group details
     */
    static async getGroupDetails(groupId: string, userId: string, role: string) {
        const group = await prisma.group.findUnique({
            where: { id: groupId },
            include: {
                course: {
                    select: { id: true, code: true, name: true, ownerId: true },
                },
                members: {
                    include: {
                        user: {
                            select: { id: true, name: true, email: true },
                        },
                    },
                },
                chatSpaces: {
                    include: {
                        goals: {
                            include: {
                                user: {
                                    select: { id: true, name: true },
                                },
                            },
                            orderBy: { createdAt: 'desc' },
                        },
                    },
                    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
                },
            },
        });

        if (!group) {
            throw ApiError.notFound('Group not found');
        }

        // Check access
        if (role === 'lecturer') {
            if (group.course.ownerId !== userId) {
                throw ApiError.forbidden('You do not own this course');
            }
        } else {
            const isMember = group.members.some((m) => m.userId === userId);
            if (!isMember) {
                throw ApiError.forbidden('You are not a member of this group');
            }
        }

        // Flatten all goals from all chat spaces
        const allGoals = group.chatSpaces.flatMap((cs) => 
            cs.goals.map((g) => ({
                id: g.id,
                content: g.content,
                isValidated: g.isValidated,
                createdBy: g.user,
                createdAt: g.createdAt,
                chatSpaceId: cs.id,
                chatSpaceName: cs.name,
            }))
        );

        return {
            id: group.id,
            name: group.name,
            joinCode: group.joinCode,
            course: group.course,
            members: group.members.map((m) => m.user),
            chatSpaces: group.chatSpaces.map((cs) => ({
                id: cs.id,
                name: cs.name,
                description: cs.description,
                isDefault: cs.isDefault,
            })),
            goals: allGoals,
            createdAt: group.createdAt,
        };
    }

    /**
     * Check if user is member of a group
     */
    static async isGroupMember(groupId: string, userId: string): Promise<boolean> {
        const membership = await prisma.groupMember.findUnique({
            where: {
                groupId_userId: {
                    groupId,
                    userId,
                },
            },
        });

        return !!membership;
    }

    /**
     * Get user's group in a course
     */
    static async getMyGroup(courseId: string, userId: string) {
        const groupMembership = await prisma.groupMember.findFirst({
            where: {
                userId,
                group: {
                    courseId,
                },
            },
            include: {
                group: {
                    include: {
                        members: {
                            include: {
                                user: {
                                    select: { id: true, name: true, email: true },
                                },
                            },
                        },
                        chatSpaces: {
                            include: {
                                // Get first goal for this chat space (any member's goal)
                                // This enables shared goals - if any member set a goal, all can use it
                                goals: {
                                    include: {
                                        user: {
                                            select: { id: true, name: true },
                                        },
                                    },
                                    orderBy: { createdAt: 'asc' },
                                    take: 1,
                                },
                            },
                            orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
                        },
                    },
                },
            },
        });

        if (!groupMembership) {
            return null;
        }

        const group = groupMembership.group;
        return {
            id: group.id,
            name: group.name,
            joinCode: group.joinCode,
            members: group.members.map((m) => m.user),
            chatSpaces: group.chatSpaces.map((cs) => ({
                id: cs.id,
                name: cs.name,
                description: cs.description,
                isDefault: cs.isDefault,
                isClosed: !!(cs as { closedAt?: Date | null }).closedAt,
                closedAt: (cs as { closedAt?: Date | null }).closedAt ?? null,
                myGoal: cs.goals.length > 0 ? {
                    id: cs.goals[0].id,
                    content: cs.goals[0].content,
                    isValidated: cs.goals[0].isValidated,
                    createdBy: cs.goals[0].user,
                    createdAt: cs.goals[0].createdAt,
                } : null,
            })),
        };
    }

    /**
     * Create a new chat space in a group
     */
    static async createChatSpace(groupId: string, data: { name: string; description?: string }, userId: string, userRole: string) {
        const group = await prisma.group.findUnique({
            where: { id: groupId },
            include: {
                course: true,
                members: true,
            },
        });

        if (!group) {
            throw ApiError.notFound('Group not found');
        }

        // Check permission
        if (userRole === 'lecturer') {
            if (group.course.ownerId !== userId) {
                throw ApiError.forbidden('You do not own this course');
            }
        } else {
            const isMember = group.members.some((m) => m.userId === userId);
            if (!isMember) {
                throw ApiError.forbidden('You are not a member of this group');
            }
        }

        const chatSpace = await prisma.chatSpace.create({
            data: {
                name: data.name,
                description: data.description,
                groupId,
                createdBy: userId,
            },
        });

        return {
            id: chatSpace.id,
            name: chatSpace.name,
            description: chatSpace.description,
            isDefault: chatSpace.isDefault,
        };
    }

    /**
     * Get chat spaces for a group
     */
    static async getChatSpaces(groupId: string, userId: string, userRole: string) {
        const group = await prisma.group.findUnique({
            where: { id: groupId },
            include: {
                course: true,
                members: true,
                chatSpaces: {
                    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
                },
            },
        });

        if (!group) {
            throw ApiError.notFound('Group not found');
        }

        // Check permission
        if (userRole === 'lecturer') {
            if (group.course.ownerId !== userId) {
                throw ApiError.forbidden('You do not own this course');
            }
        } else {
            const isMember = group.members.some((m) => m.userId === userId);
            if (!isMember) {
                throw ApiError.forbidden('You are not a member of this group');
            }
        }

        return group.chatSpaces.map((cs) => ({
            id: cs.id,
            name: cs.name,
            description: cs.description,
            isDefault: cs.isDefault,
        }));
    }

    /**
     * Get a specific chat space by ID
     */
    static async getChatSpaceById(chatSpaceId: string, userId: string, userRole: string) {
        const chatSpace = await prisma.chatSpace.findUnique({
            where: { id: chatSpaceId },
            include: {
                group: {
                    include: {
                        course: true,
                        members: true,
                    },
                },
                // Get first goal for this chat space (any member's goal)
                // This enables shared goals - if any member set a goal, all can use it
                goals: {
                    include: {
                        user: {
                            select: { id: true, name: true },
                        },
                    },
                    orderBy: { createdAt: 'asc' },
                    take: 1,
                },
                reflections: {
                    where: { userId },
                    take: 1,
                },
            },
        });

        if (!chatSpace) {
            throw ApiError.notFound('Chat space not found');
        }

        // Check permission
        if (userRole === 'lecturer') {
            if (chatSpace.group.course.ownerId !== userId) {
                throw ApiError.forbidden('You do not own this course');
            }
        } else {
            const isMember = chatSpace.group.members.some((m) => m.userId === userId);
            if (!isMember) {
                throw ApiError.forbidden('You are not a member of this group');
            }
        }

        const isClosed = !!chatSpace.closedAt;
        const hasReflection = chatSpace.reflections.length > 0;

        return {
            id: chatSpace.id,
            name: chatSpace.name,
            description: chatSpace.description,
            isDefault: chatSpace.isDefault,
            groupId: chatSpace.groupId,
            isClosed,
            closedAt: chatSpace.closedAt,
            hasReflection,
            needsReflection: isClosed && !hasReflection && userRole === 'student',
            myGoal: chatSpace.goals.length > 0 ? {
                id: chatSpace.goals[0].id,
                content: chatSpace.goals[0].content,
                isValidated: chatSpace.goals[0].isValidated,
                createdBy: chatSpace.goals[0].user,
                createdAt: chatSpace.goals[0].createdAt,
            } : null,
        };
    }
}
