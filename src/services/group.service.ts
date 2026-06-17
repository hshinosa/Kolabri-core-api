 import prisma from '../config/database.js';
 import { ApiError } from '../middleware/errorHandler.js';
 import { CreateGroupInput } from '../validators/group.validator.js';
 import { logger } from '../utils/logger.js';
 import { randomBytes } from 'crypto';

const getMinMembersPerGroup = (course: Record<string, unknown>) => {
    const value = course.minMembersPerGroup;
    return typeof value === 'number' ? value : 1;
};

const getMaxMembersPerGroup = (course: Record<string, unknown>) => {
    const value = course.maxMembersPerGroup;
    return typeof value === 'number' ? value : 1000;
};

// Generate a unique join code
const generateJoinCode = (): string => {
    return randomBytes(4).toString('hex').toUpperCase();
};

type CourseWeekRow = { id: string; course_id: string; week_index: number; title: string };

async function assertCourseWeekBelongsToCourse(weekId: string, courseId: string): Promise<CourseWeekRow> {
    try {
        const rows = await prisma.$queryRaw<CourseWeekRow[]>`
            SELECT id, course_id, week_index, title
            FROM course_weeks
            WHERE id = ${weekId}::uuid
            LIMIT 1
        `;
        const week = rows[0];
        if (!week) {
            throw ApiError.badRequest('Invalid week_id: course week not found');
        }
        if (week.course_id !== courseId) {
            throw ApiError.badRequest('week_id does not belong to this course');
        }
        return week;
     } catch (e) {
         if (e instanceof ApiError) throw e;
         logger.warn('assertCourseWeekBelongsToCourse query failed', {
             weekId,
             courseId,
             error: e instanceof Error ? e.message : String(e),
             stack: e instanceof Error ? e.stack : undefined,
         });
         return { id: weekId, course_id: courseId, week_index: 0, title: '' };
     }
}

 async function resolveWeekLabelsByIds(weekIds: (string | null | undefined)[]): Promise<{
     map: Map<string, { title: string; week_index: number }>;
     warnings: string[];
 }> {
     const unique = [...new Set(weekIds.filter((id): id is string => !!id))];
     const map = new Map<string, { title: string; week_index: number }>();
     const warnings: string[] = [];
     if (unique.length === 0) {
         return { map, warnings };
     }
     try {
         const rows = await prisma.$queryRaw<{ id: string; title: string; week_index: number }[]>`
             SELECT id, title, week_index
             FROM course_weeks
             WHERE id = ANY(${unique}::uuid[])
         `;
         for (const row of rows) {
             map.set(row.id, { title: row.title, week_index: row.week_index });
         }
     } catch (error) {
         logger.warn('Failed to resolve week labels', {
             weekIds: unique,
             error: error instanceof Error ? error.message : String(error),
             stack: error instanceof Error ? error.stack : undefined,
         });
         warnings.push('Week data unavailable');
     }
     return { map, warnings };
 }


async function hasPreReadCompleted(userId: string, chatSpaceId: string): Promise<boolean> {
    const row = await prisma.chatSpacePreReadCompletion.findUnique({
        where: {
            userId_chatSpaceId: { userId, chatSpaceId },
        },
    });
    return !!row;
}

async function preReadFlagsForUser(
    userId: string,
    chatSpaceIds: string[]
): Promise<Map<string, boolean>> {
    const map = new Map<string, boolean>();
    if (chatSpaceIds.length === 0) {
        return map;
    }
    const rows = await prisma.chatSpacePreReadCompletion.findMany({
        where: {
            userId,
            chatSpaceId: { in: chatSpaceIds },
        },
        select: { chatSpaceId: true },
    });
    for (const id of chatSpaceIds) {
        map.set(id, false);
    }
    for (const row of rows) {
        map.set(row.chatSpaceId, true);
    }
    return map;
}

function weekFieldsFromMap(weekId: string | null | undefined, labels: Map<string, { title: string; week_index: number }>) {
    if (!weekId) {
        return { weekId: null as string | null, weekTitle: null as string | null, weekIndex: null as number | null };
    }
    const meta = labels.get(weekId);
    return {
        weekId,
        weekTitle: meta?.title ?? null,
        weekIndex: meta?.week_index ?? null,
    };
}

export class GroupService {
    private static ensureMinimumMemberCountAfterRemoval(currentMemberCount: number, minMembersPerGroup: number) {
        if (currentMemberCount - 1 < minMembersPerGroup) {
            throw ApiError.badRequest(`Group must keep at least ${minMembersPerGroup} members for this course`);
        }
    }

    /**
     * Delete a group (lecturer only, cascade deletes members/chat spaces)
     */
    static async deleteGroup(groupId: string, userId: string, userRole: string) {
        if (userRole !== 'lecturer') {
            throw ApiError.forbidden('Only lecturers can delete groups');
        }

        const group = await prisma.group.findFirst({
            where: { id: groupId, deletedAt: null },
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

        await prisma.group.update({
            where: { id: groupId },
            data: { deletedAt: new Date() },
        });

        return { success: true };
    }

    /**
     * Create a new group in a course (lecturer or student can create)
     */
    static async createGroup(courseId: string, data: CreateGroupInput, userId: string, userRole: string) {
        const course = await prisma.course.findFirst({
            where: { id: courseId, deletedAt: null },
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

        const memberIds = data.member_ids || [];
        const initialMemberCount = userRole === 'student' ? 1 : memberIds.length;
        const maxMembersPerGroup = getMaxMembersPerGroup(course);

        if (initialMemberCount > maxMembersPerGroup) {
            throw ApiError.badRequest(`Group cannot exceed ${maxMembersPerGroup} members for this course`);
        }

        const group = await prisma.$transaction(async (tx) => {
            const newGroup = await tx.group.create({
                data: {
                    name: data.name,
                    courseId,
                    joinCode,
                    createdBy: userId,
                },
            });

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
                members: true,
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

        const currentMemberCount = group.members?.length ?? 0;
        if (currentMemberCount >= getMaxMembersPerGroup(group.course)) {
            throw ApiError.badRequest('Group has reached the maximum member limit for this course');
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

        const nextMemberCount = group.members.length + memberIds.length;
        if (nextMemberCount > getMaxMembersPerGroup(group.course)) {
            throw ApiError.badRequest('Adding members would exceed the maximum group size for this course');
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

    static async leaveGroup(groupId: string, userId: string) {
        const membership = await prisma.groupMember.findUnique({
            where: {
                groupId_userId: { groupId, userId },
            },
        });

        if (!membership) {
            throw ApiError.forbidden('You are not a member of this group');
        }

        const group = await prisma.group.findFirst({
            where: { id: groupId, deletedAt: null },
            include: {
                course: true,
                members: true,
            },
        });

        if (!group) {
            throw ApiError.notFound('Group not found');
        }

        if (group.createdBy === userId) {
            throw ApiError.badRequest('Group owner cannot leave the group');
        }

        this.ensureMinimumMemberCountAfterRemoval(group.members.length, getMinMembersPerGroup(group.course));

        await prisma.groupMember.delete({
            where: {
                groupId_userId: { groupId, userId },
            },
        });

        return { success: true };
    }

    static async removeMember(groupId: string, memberId: string, userId: string, userRole: string) {
        const group = await prisma.group.findFirst({
            where: { id: groupId, deletedAt: null },
            include: {
                course: {
                    select: {
                        ownerId: true,
                        minMembersPerGroup: true,
                        maxMembersPerGroup: true,
                    },
                },
                members: true,
            },
        });

        if (!group) {
            throw ApiError.notFound('Group not found');
        }

        if (userRole === 'lecturer') {
            if (group.course.ownerId !== userId) {
                throw ApiError.forbidden('You do not own this course');
            }
        } else {
            if (group.createdBy !== userId) {
                throw ApiError.forbidden('Hanya ketua kelompok yang dapat mengeluarkan anggota');
            }
        }

        if (memberId === userId) {
            throw ApiError.badRequest('Tidak dapat mengeluarkan diri sendiri');
        }

        if (memberId === group.createdBy) {
            throw ApiError.badRequest('Tidak dapat mengeluarkan ketua kelompok');
        }

        const isMember = group.members.some((member) => member.userId === memberId);
        if (!isMember) {
            throw ApiError.notFound('Group member not found');
        }

        this.ensureMinimumMemberCountAfterRemoval(group.members.length, getMinMembersPerGroup(group.course));

        await prisma.groupMember.delete({
            where: {
                groupId_userId: { groupId, userId: memberId },
            },
        });

        return { success: true };
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

        const existingMembers = await prisma.groupMember.findMany({
            where: { groupId },
            select: { userId: true },
        });

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

        const existingMemberIds = new Set(existingMembers.map((member) => member.userId));
        const newUniqueMemberIds = memberIds.filter((memberId) => !existingMemberIds.has(memberId));
        const nextMemberCount = existingMembers.length + newUniqueMemberIds.length;

        if (nextMemberCount > getMaxMembersPerGroup(course)) {
            throw ApiError.badRequest('Adding members would exceed the maximum group size for this course');
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

        const creatorIds = [...new Set(groups.map((g) => g.createdBy))];
        const creators = await prisma.user.findMany({
            where: { id: { in: creatorIds } },
            select: { id: true, name: true, email: true },
        });
        const creatorMap = new Map(creators.map((c) => [c.id, c]));

        return groups.map((group) => ({
            id: group.id,
            name: group.name,
            joinCode: group.joinCode,
            members: group.members.map((m) => m.user),
            members_count: group.members.length,
            creator: creatorMap.get(group.createdBy) ?? null,
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

        const creator = await prisma.user.findUnique({
            where: { id: group.createdBy },
            select: { id: true, name: true, email: true },
        });

        return {
            id: group.id,
            name: group.name,
            joinCode: group.joinCode,
            course: group.course,
            members: group.members.map((m) => m.user),
            members_count: group.members.length,
            creator: creator,
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
        const { map: weekLabels, warnings } = await resolveWeekLabelsByIds(group.chatSpaces.map((cs) => cs.weekId));
        const preReadMap = await preReadFlagsForUser(
            userId,
            group.chatSpaces.map((cs) => cs.id)
        );

        const creator = await prisma.user.findUnique({
            where: { id: group.createdBy },
            select: { id: true, name: true, email: true },
        });

        return {
            id: group.id,
            name: group.name,
            joinCode: group.joinCode,
            members: group.members.map((m) => m.user),
            members_count: group.members.length,
            creator: creator,
            chatSpaces: group.chatSpaces.map((cs) => ({
                id: cs.id,
                name: cs.name,
                description: cs.description,
                isDefault: cs.isDefault,
                ...weekFieldsFromMap(cs.weekId, weekLabels),
                hasPreReadCompleted: preReadMap.get(cs.id) ?? false,
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
            ...(warnings.length > 0 ? { warnings } : {}),
        };
    }

    /**
     * Create a new chat space in a group
     */
    static async createChatSpace(
        groupId: string,
        data: { name: string; description?: string; week_id?: string },
        userId: string,
        userRole: string
    ) {
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

        const weekId = data.week_id?.trim();
        if (!weekId) {
            throw ApiError.badRequest('week_id is required when creating a discussion session');
        }
        const week = await assertCourseWeekBelongsToCourse(weekId, group.courseId);

        const chatSpace = await prisma.chatSpace.create({
            data: {
                name: data.name,
                description: data.description,
                groupId,
                createdBy: userId,
                weekId,
            },
        });

        return {
            id: chatSpace.id,
            name: chatSpace.name,
            description: chatSpace.description,
            isDefault: chatSpace.isDefault,
            weekId: chatSpace.weekId,
            weekTitle: week.title,
            weekIndex: week.week_index,
        };
    }

    static async getChatSpaces(
        groupId: string,
        userId: string,
        userRole: string,
        query?: {
            q?: string;
            type?: string | string[];
            status?: string | string[];
            sort?: string;
            page?: number | string;
            per_page?: number | string;
        }
    ) {
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

        const where: any = {
            groupId,
            deletedAt: null,
        };

        if (query?.q) {
            where.OR = [
                { name: { contains: query.q, mode: 'insensitive' } },
                { description: { contains: query.q, mode: 'insensitive' } },
            ];
        }

        if (query?.type) {
            const types = Array.isArray(query.type) ? query.type : [query.type];
            if (types.length > 0) {
                where.type = { in: types };
            }
        }

        if (query?.status) {
            const statuses = Array.isArray(query.status) ? query.status : [query.status];
            const hasAktif = statuses.includes('Aktif');
            const hasTidakAktif = statuses.includes('Tidak aktif');

            if (hasAktif && !hasTidakAktif) {
                where.closedAt = null;
            } else if (!hasAktif && hasTidakAktif) {
                where.closedAt = { not: null };
            }
        }

        const sort = query?.sort || 'terbaru';
        let orderBy: any;

        switch (sort) {
            case 'alfabet':
                orderBy = [{ isDefault: 'desc' }, { name: 'asc' }];
                break;
            case 'paling-aktif':
                orderBy = [{ isDefault: 'desc' }, { createdAt: 'desc' }];
                break;
            case 'terbaru':
            default:
                orderBy = [{ isDefault: 'desc' }, { createdAt: 'desc' }];
                break;
        }

        const page = Math.max(1, parseInt(String(query?.page || '1'), 10) || 1);
        const perPage = Math.min(50, Math.max(1, parseInt(String(query?.per_page || '12'), 10) || 12));
        const skip = (page - 1) * perPage;

        const total = await prisma.chatSpace.count({ where });

        const chatSpaces = await prisma.chatSpace.findMany({
            where,
            orderBy,
            skip,
            take: perPage,
            include: {
                messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    include: {
                        sender: {
                            select: { name: true },
                        },
                    },
                },
            },
        });

        let sortedSpaces = chatSpaces;
        if (sort === 'paling-aktif') {
            sortedSpaces = [...chatSpaces].sort((a, b) => {
                const dateA = a.messages[0]?.createdAt?.getTime() || 0;
                const dateB = b.messages[0]?.createdAt?.getTime() || 0;
                if (dateA !== dateB) return dateB - dateA;
                if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
                return (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0);
            });
        }

        const { map: weekLabels, warnings } = await resolveWeekLabelsByIds(sortedSpaces.map((cs) => cs.weekId));
        const preReadMap =
            userRole === 'student'
                ? await preReadFlagsForUser(
                      userId,
                      sortedSpaces.map((cs) => cs.id)
                  )
                : new Map<string, boolean>();

        const data = sortedSpaces.map((cs) => ({
            id: cs.id,
            name: cs.name,
            description: cs.description,
            isDefault: cs.isDefault,
            ...weekFieldsFromMap(cs.weekId, weekLabels),
            hasPreReadCompleted: userRole === 'student' ? (preReadMap.get(cs.id) ?? false) : true,
            isClosed: !!cs.closedAt,
            closedAt: cs.closedAt,
            createdAt: cs.createdAt,
            type: cs.type,
            status: cs.closedAt ? 'Tidak aktif' : 'Aktif',
            lastMessage: cs.messages[0]?.content?.substring(0, 100) || null,
            lastMessageAt: cs.messages[0]?.createdAt || null,
            lastMessageSender: cs.messages[0]?.sender?.name || null,
        }));

        return {
            data,
            pagination: {
                total,
                per_page: perPage,
                current_page: page,
                last_page: Math.ceil(total / perPage),
            },
            ...(warnings.length > 0 ? { warnings } : {}),
        };
    }


    /**
     * Mark pre-read complete for the current user on a chat space (student members only).
     */
    static async completePreRead(chatSpaceId: string, userId: string, userRole: string) {
        const chatSpace = await prisma.chatSpace.findFirst({
            where: { id: chatSpaceId, deletedAt: null },
            include: {
                group: {
                    include: {
                        course: true,
                        members: true,
                    },
                },
            },
        });

        if (!chatSpace) {
            throw ApiError.notFound('Chat space not found');
        }

        if (userRole !== 'student') {
            throw ApiError.forbidden('Only students complete pre-read');
        }

        const isMember = chatSpace.group.members.some((m) => m.userId === userId);
        if (!isMember) {
            throw ApiError.forbidden('You are not a member of this group');
        }

        if (!chatSpace.weekId) {
            throw ApiError.badRequest('Chat space has no week binding; pre-read not applicable');
        }

        const existing = await prisma.chatSpacePreReadCompletion.findUnique({
            where: {
                userId_chatSpaceId: { userId, chatSpaceId },
            },
        });

        if (existing) {
            return {
                chatSpaceId,
                completedAt: existing.completedAt,
                alreadyCompleted: true,
            };
        }

        const created = await prisma.chatSpacePreReadCompletion.create({
            data: {
                userId,
                chatSpaceId,
            },
        });

        return {
            chatSpaceId,
            completedAt: created.completedAt,
            alreadyCompleted: false,
        };
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
        const { map: weekLabels, warnings } = await resolveWeekLabelsByIds([chatSpace.weekId]);
        const weekMeta = weekFieldsFromMap(chatSpace.weekId, weekLabels);
        const preReadDone =
            userRole === 'student'
                ? await hasPreReadCompleted(userId, chatSpaceId)
                : true;

        return {
            id: chatSpace.id,
            name: chatSpace.name,
            description: chatSpace.description,
            isDefault: chatSpace.isDefault,
            groupId: chatSpace.groupId,
            weekId: weekMeta.weekId,
            weekTitle: weekMeta.weekTitle,
            weekIndex: weekMeta.weekIndex,
            isClosed,
            closedAt: chatSpace.closedAt,
            hasReflection,
            needsReflection: isClosed && !hasReflection && userRole === 'student',
            hasPreReadCompleted: preReadDone,
            myGoal: chatSpace.goals.length > 0 ? {
                id: chatSpace.goals[0].id,
                content: chatSpace.goals[0].content,
                isValidated: chatSpace.goals[0].isValidated,
                createdBy: chatSpace.goals[0].user,
                createdAt: chatSpace.goals[0].createdAt,
            } : null,
            ...(warnings.length > 0 ? { warnings } : {}),
        };
    }

    /**
     * Assign week_id to chat spaces missing binding (per course, lowest week_index default).
     */
    static async backfillChatSpaceWeekIds(courseId?: string) {
        const groups = await prisma.group.findMany({
            where: {
                deletedAt: null,
                ...(courseId ? { courseId } : {}),
            },
            select: { id: true, courseId: true },
        });

        let updated = 0;
        let skipped = 0;
        const details: Array<{ chatSpaceId: string; weekId: string }> = [];

        for (const group of groups) {
            let defaultWeekId: string | undefined;
            try {
                const defaultWeek = await prisma.$queryRaw<{ id: string }[]>`
                    SELECT id FROM course_weeks
                    WHERE course_id = ${group.courseId}::uuid
                    ORDER BY week_index ASC
                    LIMIT 1
                `;
                defaultWeekId = defaultWeek[0]?.id;
            } catch {
                // course_weeks lives in client-app MySQL
            }
            if (!defaultWeekId) {
                skipped += 1;
                continue;
            }

            const spaces = await prisma.chatSpace.findMany({
                where: {
                    groupId: group.id,
                    deletedAt: null,
                    weekId: null,
                },
                select: { id: true },
            });

            for (const space of spaces) {
                await prisma.chatSpace.update({
                    where: { id: space.id },
                    data: { weekId: defaultWeekId },
                });
                updated += 1;
                details.push({ chatSpaceId: space.id, weekId: defaultWeekId });
            }
        }

        return { updated, skippedCoursesWithoutWeeks: skipped, assignments: details };
    }

    static async updateChatSpaceWeek(
        chatSpaceId: string,
        weekId: string,
        userId: string,
        userRole: string
    ) {
        const chatSpace = await prisma.chatSpace.findFirst({
            where: { id: chatSpaceId, deletedAt: null },
            include: {
                group: {
                    include: {
                        course: true,
                    },
                },
            },
        });

        if (!chatSpace) {
            throw ApiError.notFound('Chat space not found');
        }

        if (userRole !== 'lecturer' && userRole !== 'admin') {
            throw ApiError.forbidden('Only lecturers can reassign session week');
        }

        if (chatSpace.group.course.ownerId !== userId && userRole !== 'admin') {
            throw ApiError.forbidden('You do not own this course');
        }

        await assertCourseWeekBelongsToCourse(weekId, chatSpace.group.courseId);

        const updated = await prisma.chatSpace.update({
            where: { id: chatSpaceId },
            data: { weekId },
        });

        const { map: weekLabels } = await resolveWeekLabelsByIds([updated.weekId]);
        const weekMeta = weekFieldsFromMap(updated.weekId, weekLabels);

        return {
            id: updated.id,
            weekId: weekMeta.weekId,
            weekTitle: weekMeta.weekTitle,
            weekIndex: weekMeta.weekIndex,
        };
    }
}
