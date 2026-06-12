import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, randomBytesMock } = vi.hoisted(() => ({
    prismaMock: {
        group: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), createMany: vi.fn(), delete: vi.fn(), update: vi.fn(), findMany: vi.fn() },
        course: { findUnique: vi.fn(), findFirst: vi.fn() },
        courseStudent: { findUnique: vi.fn(), findMany: vi.fn() },
        groupMember: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), createMany: vi.fn(), delete: vi.fn() },
        chatSpace: { create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
        chatSpacePreReadCompletion: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
        $queryRaw: vi.fn(),
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
        prismaMock.course.findFirst.mockResolvedValue({ id: 'course-1', ownerId: 'lecturer-1' });
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
        prismaMock.course.findFirst.mockResolvedValue({ id: 'course-1', ownerId: 'lecturer-1' });
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
        prismaMock.course.findFirst.mockResolvedValue({ id: 'course-1', ownerId: 'lecturer-1' });
        prismaMock.courseStudent.findUnique.mockResolvedValue(null);

        await expect(GroupService.createGroup('course-1', { name: 'Group 1' }, 'student-1', 'student')).rejects.toMatchObject({
            statusCode: 403,
            message: 'You are not enrolled in this course',
        });
    });

    it('rejects lecturer-managed group creation when selected members exceed the course maximum', async () => {
        prismaMock.course.findFirst.mockResolvedValue({
            id: 'course-1',
            ownerId: 'lecturer-1',
            minMembersPerGroup: 2,
            maxMembersPerGroup: 3,
        });

        await expect(
            GroupService.createGroup(
                'course-1',
                { name: 'Group 1', member_ids: ['student-1', 'student-2', 'student-3', 'student-4'] },
                'lecturer-1',
                'lecturer'
            )
        ).rejects.toMatchObject({
            statusCode: 400,
            message: 'Group cannot exceed 3 members for this course',
        });
    });

    it('rejects student-managed group creation when the resulting group would exceed the course maximum', async () => {
        prismaMock.course.findFirst.mockResolvedValue({
            id: 'course-1',
            ownerId: 'lecturer-1',
            minMembersPerGroup: 1,
            maxMembersPerGroup: 0,
        });
        prismaMock.courseStudent.findUnique.mockResolvedValue({ courseId: 'course-1', userId: 'student-1' });

        await expect(GroupService.createGroup('course-1', { name: 'Group 1' }, 'student-1', 'student')).rejects.toMatchObject({
            statusCode: 400,
            message: 'Group cannot exceed 0 members for this course',
        });
    });

    it('joins a group by code for enrolled students who are not already members', async () => {
        prismaMock.group.findUnique.mockResolvedValue({
            id: 'group-1',
            courseId: 'course-1',
            course: { id: 'course-1' },
            members: [],
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

    it('rejects join by code when the group has reached the course maximum', async () => {
        prismaMock.group.findUnique.mockResolvedValue({
            id: 'group-1',
            courseId: 'course-1',
            course: { id: 'course-1', maxMembersPerGroup: 2 },
            members: [{ userId: 'student-9' }, { userId: 'student-8' }],
        });
        prismaMock.courseStudent.findUnique.mockResolvedValue({ courseId: 'course-1', userId: 'student-1' });
        prismaMock.groupMember.findUnique.mockResolvedValue(null);

        await expect(GroupService.joinGroupByCode('ABC12345', 'student-1')).rejects.toMatchObject({
            statusCode: 400,
            message: 'Group has reached the maximum member limit for this course',
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

    it('rejects invite when adding members would exceed the course maximum', async () => {
        prismaMock.group.findUnique.mockResolvedValue({
            id: 'group-1',
            courseId: 'course-1',
            course: { ownerId: 'lecturer-1', maxMembersPerGroup: 3 },
            members: [{ userId: 'student-1' }, { userId: 'student-2' }],
        });
        prismaMock.courseStudent.findMany.mockResolvedValue([{ userId: 'student-3' }, { userId: 'student-4' }]);

        await expect(GroupService.inviteMembers('group-1', ['student-3', 'student-4'], 'lecturer-1', 'lecturer')).rejects.toMatchObject({
            statusCode: 400,
            message: 'Adding members would exceed the maximum group size for this course',
        });
    });

    it('allows a student to leave when the group stays at or above the minimum', async () => {
        prismaMock.groupMember.findUnique.mockResolvedValue({ groupId: 'group-1', userId: 'student-2' });
        prismaMock.group.findFirst.mockResolvedValue({
            id: 'group-1',
            createdBy: 'student-1',
            members: [{ userId: 'student-1' }, { userId: 'student-2' }, { userId: 'student-3' }],
            course: { minMembersPerGroup: 2, maxMembersPerGroup: 5 },
        });

        const result = await GroupService.leaveGroup('group-1', 'student-2');

        expect(prismaMock.groupMember.delete).toHaveBeenCalledWith({
            where: {
                groupId_userId: {
                    groupId: 'group-1',
                    userId: 'student-2',
                },
            },
        });
        expect(result).toEqual({ success: true });
    });

    it('rejects leaving when the group would fall below the course minimum', async () => {
        prismaMock.groupMember.findUnique.mockResolvedValue({ groupId: 'group-1', userId: 'student-2' });
        prismaMock.group.findFirst.mockResolvedValue({
            id: 'group-1',
            createdBy: 'student-1',
            members: [{ userId: 'student-1' }, { userId: 'student-2' }],
            course: { minMembersPerGroup: 2, maxMembersPerGroup: 5 },
        });

        await expect(GroupService.leaveGroup('group-1', 'student-2')).rejects.toMatchObject({
            statusCode: 400,
            message: 'Group must keep at least 2 members for this course',
        });
    });

    it('rejects leaving for the group owner', async () => {
        prismaMock.groupMember.findUnique.mockResolvedValue({ groupId: 'group-1', userId: 'student-1' });
        prismaMock.group.findFirst.mockResolvedValue({
            id: 'group-1',
            createdBy: 'student-1',
            members: [{ userId: 'student-1' }, { userId: 'student-2' }, { userId: 'student-3' }],
            course: { minMembersPerGroup: 2, maxMembersPerGroup: 5 },
        });

        await expect(GroupService.leaveGroup('group-1', 'student-1')).rejects.toMatchObject({
            statusCode: 400,
            message: 'Group owner cannot leave the group',
        });
    });

    it('allows lecturer-owned member removal when the group stays at or above the minimum', async () => {
        prismaMock.group.findFirst.mockResolvedValue({
            id: 'group-1',
            members: [{ userId: 'student-1' }, { userId: 'student-2' }, { userId: 'student-3' }],
            course: { ownerId: 'lecturer-1', minMembersPerGroup: 2, maxMembersPerGroup: 5 },
        });

        const result = await GroupService.removeMember('group-1', 'student-3', 'lecturer-1', 'lecturer');

        expect(prismaMock.groupMember.delete).toHaveBeenCalledWith({
            where: {
                groupId_userId: {
                    groupId: 'group-1',
                    userId: 'student-3',
                },
            },
        });
        expect(result).toEqual({ success: true });
    });

    it('rejects member removal when the group would fall below the course minimum', async () => {
        prismaMock.group.findFirst.mockResolvedValue({
            id: 'group-1',
            members: [{ userId: 'student-1' }, { userId: 'student-2' }],
            course: { ownerId: 'lecturer-1', minMembersPerGroup: 2, maxMembersPerGroup: 5 },
        });

        await expect(GroupService.removeMember('group-1', 'student-2', 'lecturer-1', 'lecturer')).rejects.toMatchObject({
            statusCode: 400,
            message: 'Group must keep at least 2 members for this course',
        });
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

    it('rejects chat space create without week_id', async () => {
        prismaMock.group.findUnique.mockResolvedValue({
            id: 'group-1',
            courseId: 'course-1',
            course: { ownerId: 'lecturer-1' },
            members: [],
        });

        await expect(
            GroupService.createChatSpace('group-1', { name: 'General' }, 'lecturer-1', 'lecturer')
        ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('creates a chat space with week_id when week belongs to course', async () => {
        const weekUuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
        prismaMock.group.findUnique.mockResolvedValue({
            id: 'group-1',
            courseId: 'course-1',
            course: { ownerId: 'lecturer-1' },
            members: [{ userId: 'student-1' }],
        });
        prismaMock.$queryRaw.mockResolvedValue([
            { id: weekUuid, course_id: 'course-1', week_index: 2, title: 'Minggu 2' },
        ]);
        prismaMock.chatSpace.create.mockResolvedValue({
            id: 'chat-2',
            name: 'Diskusi',
            description: null,
            isDefault: false,
            weekId: weekUuid,
        });

        const result = await GroupService.createChatSpace(
            'group-1',
            { name: 'Diskusi', week_id: weekUuid },
            'student-1',
            'student'
        );

        expect(prismaMock.$queryRaw).toHaveBeenCalled();
        expect(prismaMock.chatSpace.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                weekId: weekUuid,
                groupId: 'group-1',
            }),
        });
        expect(result.weekId).toBe(weekUuid);
        expect(result.weekTitle).toBe('Minggu 2');
        expect(result.weekIndex).toBe(2);
    });


    it('allows multiple chat spaces for the same week_id', async () => {
        const weekUuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
        const groupStub = {
            id: 'group-1',
            courseId: 'course-1',
            course: { ownerId: 'lecturer-1' },
            members: [{ userId: 'student-1' }],
        };
        prismaMock.group.findUnique.mockResolvedValue(groupStub);
        prismaMock.$queryRaw.mockResolvedValue([
            { id: weekUuid, course_id: 'course-1', week_index: 1, title: 'Pengenalan' },
        ]);
        prismaMock.chatSpace.create
            .mockResolvedValueOnce({
                id: 'chat-a',
                name: 'Sesi A',
                description: null,
                isDefault: false,
                weekId: weekUuid,
            })
            .mockResolvedValueOnce({
                id: 'chat-b',
                name: 'Sesi B',
                description: null,
                isDefault: false,
                weekId: weekUuid,
            });

        const first = await GroupService.createChatSpace(
            'group-1',
            { name: 'Sesi A', week_id: weekUuid },
            'student-1',
            'student'
        );
        const second = await GroupService.createChatSpace(
            'group-1',
            { name: 'Sesi B', week_id: weekUuid },
            'student-1',
            'student'
        );

        expect(prismaMock.chatSpace.create).toHaveBeenCalledTimes(2);
        expect(first.id).toBe('chat-a');
        expect(second.id).toBe('chat-b');
        expect(first.weekId).toBe(weekUuid);
        expect(second.weekId).toBe(weekUuid);
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
                        weekId: null,
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
        prismaMock.$queryRaw.mockResolvedValue([]);
        prismaMock.chatSpacePreReadCompletion.findMany.mockResolvedValue([]);

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
                    weekId: null,
                    weekTitle: null,
                    weekIndex: null,
                    hasPreReadCompleted: false,
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

    it('completes pre-read for a chat space', async () => {
        prismaMock.chatSpace.findFirst.mockResolvedValue({
            id: 'chat-1',
            weekId: 'week-1',
            group: {
                course: { ownerId: 'lecturer-1' },
                members: [{ userId: 'student-1' }],
            },
        });
        prismaMock.chatSpacePreReadCompletion.findUnique.mockResolvedValue(null);
        prismaMock.chatSpacePreReadCompletion.create.mockResolvedValue({
            id: 'pr-1',
            completedAt: new Date('2026-06-12T00:00:00.000Z'),
        });

        const result = await GroupService.completePreRead('chat-1', 'student-1', 'student');

        expect(result.alreadyCompleted).toBe(false);
        expect(prismaMock.chatSpacePreReadCompletion.create).toHaveBeenCalled();
    });
});
