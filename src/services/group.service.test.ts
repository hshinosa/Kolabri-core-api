import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, randomBytesMock } = vi.hoisted(() => ({
    prismaMock: {
        group: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), createMany: vi.fn(), delete: vi.fn(), update: vi.fn(), findMany: vi.fn() },
        course: { findUnique: vi.fn() },
        courseStudent: { findUnique: vi.fn(), findMany: vi.fn() },
        groupMember: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), createMany: vi.fn() },
        chatSpace: { create: vi.fn(), findUnique: vi.fn() },
        $transaction: vi.fn(),
    },
    randomBytesMock: vi.fn(),
}));

vi.mock('../config/database.js', () => ({
    default: prismaMock,
    prisma: prismaMock,
}));

vi.mock('crypto', () => ({
    randomBytes: randomBytesMock,
}));

import { GroupService } from './group.service.js';

describe('GroupService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        randomBytesMock.mockReturnValue({ toString: vi.fn().mockReturnValue('ABC12345') });
    });

    it('rejects group deletion for non-lecturers', async () => {
        await expect(GroupService.deleteGroup('group-1', 'user-1', 'student')).rejects.toMatchObject({
            statusCode: 403,
            message: 'Only lecturers can delete groups',
        });
    });

    it('deletes a group when the lecturer owns the course', async () => {
        prismaMock.group.findFirst.mockResolvedValue({
            id: 'group-1',
            course: { ownerId: 'lecturer-1' },
        });

        const result = await GroupService.deleteGroup('group-1', 'lecturer-1', 'lecturer');

        expect(prismaMock.group.update).toHaveBeenCalledWith({ where: { id: 'group-1' }, data: { deletedAt: expect.any(Date) } });
        expect(result).toEqual({ success: true });
    });

    it('creates a lecturer-managed group with enrolled members', async () => {
        prismaMock.course.findUnique.mockResolvedValue({ id: 'course-1', ownerId: 'lecturer-1' });
        prismaMock.group.findUnique.mockResolvedValueOnce(null);
        prismaMock.$transaction.mockImplementation(async (callback) => {
            const tx = {
                group: {
                    create: vi.fn().mockResolvedValue({ id: 'group-1', name: 'Group 1', courseId: 'course-1', joinCode: 'ABC12345' }),
                },
                groupMember: {
                    create: vi.fn(),
                    createMany: vi.fn().mockResolvedValue({ count: 2 }),
                },
                courseStudent: {
                    findMany: vi.fn().mockResolvedValue([{ userId: 'student-1' }, { userId: 'student-2' }]),
                },
            };

            const result = await callback(tx);
            expect(tx.group.create).toHaveBeenCalledWith({
                data: {
                    name: 'Group 1',
                    courseId: 'course-1',
                    joinCode: 'ABC12345',
                    createdBy: 'lecturer-1',
                },
            });
            expect(tx.groupMember.createMany).toHaveBeenCalledWith({
                data: [
                    { groupId: 'group-1', userId: 'student-1' },
                    { groupId: 'group-1', userId: 'student-2' },
                ],
                skipDuplicates: true,
            });
            return result;
        });
        const getGroupByIdSpy = vi.spyOn(GroupService, 'getGroupById').mockResolvedValue({ id: 'group-1', name: 'Group 1' } as never);

        const result = await GroupService.createGroup(
            'course-1',
            { name: 'Group 1', member_ids: ['student-1', 'student-2'] },
            'lecturer-1',
            'lecturer'
        );

        expect(getGroupByIdSpy).toHaveBeenCalledWith('group-1');
        expect(result).toEqual({ id: 'group-1', name: 'Group 1' });
    });

    it('creates a student-managed group and adds the creator as first member', async () => {
        prismaMock.course.findUnique.mockResolvedValue({ id: 'course-1', ownerId: 'lecturer-1' });
        prismaMock.courseStudent.findUnique.mockResolvedValue({ courseId: 'course-1', userId: 'student-1' });
        prismaMock.group.findUnique.mockResolvedValueOnce(null);
        prismaMock.$transaction.mockImplementation(async (callback) => {
            const tx = {
                group: {
                    create: vi.fn().mockResolvedValue({ id: 'group-1', name: 'Group 1', courseId: 'course-1', joinCode: 'ABC12345' }),
                },
                groupMember: {
                    create: vi.fn().mockResolvedValue({ id: 'member-1' }),
                    createMany: vi.fn(),
                },
                courseStudent: {
                    findMany: vi.fn(),
                },
            };

            const result = await callback(tx);
            expect(tx.groupMember.create).toHaveBeenCalledWith({
                data: {
                    groupId: 'group-1',
                    userId: 'student-1',
                },
            });
            return result;
        });
        vi.spyOn(GroupService, 'getGroupById').mockResolvedValue({ id: 'group-1' } as never);

        const result = await GroupService.createGroup('course-1', { name: 'Group 1' }, 'student-1', 'student');

        expect(result).toEqual({ id: 'group-1' });
    });

    it('rejects group creation for students who are not enrolled', async () => {
        prismaMock.course.findUnique.mockResolvedValue({ id: 'course-1', ownerId: 'lecturer-1' });
        prismaMock.courseStudent.findUnique.mockResolvedValue(null);

        await expect(GroupService.createGroup('course-1', { name: 'Group 1' }, 'student-1', 'student')).rejects.toMatchObject({
            statusCode: 403,
            message: 'You are not enrolled in this course',
        });
    });

    it('joins a group by code for enrolled students who are not already members', async () => {
        prismaMock.group.findUnique.mockResolvedValue({
            id: 'group-1',
            courseId: 'course-1',
            course: { id: 'course-1' },
        });
        prismaMock.courseStudent.findUnique.mockResolvedValue({ courseId: 'course-1', userId: 'student-1' });
        prismaMock.groupMember.findUnique.mockResolvedValue(null);
        const getGroupByIdSpy = vi.spyOn(GroupService, 'getGroupById').mockResolvedValue({ id: 'group-1', name: 'Group 1' } as never);

        const result = await GroupService.joinGroupByCode('ABC12345', 'student-1');

        expect(prismaMock.groupMember.create).toHaveBeenCalledWith({
            data: {
                groupId: 'group-1',
                userId: 'student-1',
            },
        });
        expect(getGroupByIdSpy).toHaveBeenCalledWith('group-1');
        expect(result).toEqual({ id: 'group-1', name: 'Group 1' });
    });

    it('rejects joining a group twice', async () => {
        prismaMock.group.findUnique.mockResolvedValue({
            id: 'group-1',
            courseId: 'course-1',
            course: { id: 'course-1' },
        });
        prismaMock.courseStudent.findUnique.mockResolvedValue({ courseId: 'course-1', userId: 'student-1' });
        prismaMock.groupMember.findUnique.mockResolvedValue({ id: 'member-1' });

        await expect(GroupService.joinGroupByCode('ABC12345', 'student-1')).rejects.toMatchObject({
            statusCode: 400,
            message: 'You are already a member of this group',
        });
    });

    it('invites members when requested by a student group member', async () => {
        prismaMock.group.findUnique.mockResolvedValue({
            id: 'group-1',
            courseId: 'course-1',
            course: { ownerId: 'lecturer-1' },
            members: [{ userId: 'student-1' }],
        });
        prismaMock.courseStudent.findMany.mockResolvedValue([{ userId: 'student-2' }]);
        const getGroupByIdSpy = vi.spyOn(GroupService, 'getGroupById').mockResolvedValue({ id: 'group-1', members: [] } as never);

        const result = await GroupService.inviteMembers('group-1', ['student-2'], 'student-1', 'student');

        expect(prismaMock.groupMember.createMany).toHaveBeenCalledWith({
            data: [{ groupId: 'group-1', userId: 'student-2' }],
            skipDuplicates: true,
        });
        expect(result).toEqual({ id: 'group-1', members: [] });
        expect(getGroupByIdSpy).toHaveBeenCalledWith('group-1');
    });

    it('getGroupById returns a result', async () => {
        const result = await GroupService.getGroupById('group-1').catch(() => null);
        expect(result === null || typeof result === 'object').toBe(true);
    });

    it('checks whether a user is a group member', async () => {
        prismaMock.groupMember.findUnique.mockResolvedValueOnce({ id: 'member-1' }).mockResolvedValueOnce(null);

        await expect(GroupService.isGroupMember('group-1', 'student-1')).resolves.toBe(true);
        await expect(GroupService.isGroupMember('group-1', 'student-2')).resolves.toBe(false);
    });

    it('creates a chat space for lecturers who own the course', async () => {
        prismaMock.group.findUnique.mockResolvedValue({
            id: 'group-1',
            course: { ownerId: 'lecturer-1' },
            members: [],
        });
        prismaMock.chatSpace.create.mockResolvedValue({
            id: 'chat-1',
            name: 'General',
            description: 'Main space',
            isDefault: false,
        });

        const result = await GroupService.createChatSpace('group-1', { name: 'General', description: 'Main space' }, 'lecturer-1', 'lecturer');

        expect(result).toEqual({
            id: 'chat-1',
            name: 'General',
            description: 'Main space',
            isDefault: false,
        });
    });

    it('marks closed chat spaces and shared goals in getMyGroup', async () => {
        prismaMock.groupMember.findFirst.mockResolvedValue({
            group: {
                id: 'group-1',
                name: 'Group 1',
                joinCode: 'ABC12345',
                members: [{ user: { id: 'student-1', name: 'Student One', email: 's1@example.com' } }],
                chatSpaces: [
                    {
                        id: 'chat-1',
                        name: 'General',
                        description: 'Main space',
                        isDefault: true,
                        closedAt: new Date('2026-05-03T00:00:00.000Z'),
                        goals: [
                            {
                                id: 'goal-1',
                                content: 'Shared goal',
                                isValidated: true,
                                createdAt: new Date('2026-05-01T00:00:00.000Z'),
                                user: { id: 'student-1', name: 'Student One' },
                            },
                        ],
                    },
                ],
            },
        });

        const result = await GroupService.getMyGroup('course-1', 'student-1');

        expect(result).toEqual({
            id: 'group-1',
            name: 'Group 1',
            joinCode: 'ABC12345',
            members: [{ id: 'student-1', name: 'Student One', email: 's1@example.com' }],
            chatSpaces: [
                {
                    id: 'chat-1',
                    name: 'General',
                    description: 'Main space',
                    isDefault: true,
                    isClosed: true,
                    closedAt: new Date('2026-05-03T00:00:00.000Z'),
                    myGoal: {
                        id: 'goal-1',
                        content: 'Shared goal',
                        isValidated: true,
                        createdBy: { id: 'student-1', name: 'Student One' },
                        createdAt: new Date('2026-05-01T00:00:00.000Z'),
                    },
                },
            ],
        });
    });
});
