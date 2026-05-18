import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, mockGetIO } = vi.hoisted(() => ({
    prismaMock: {
        chatSpace: { findUnique: vi.fn(), update: vi.fn() },
        reflection: { findFirst: vi.fn(), create: vi.fn() },
        groupMember: { findUnique: vi.fn() },
    },
    mockGetIO: vi.fn(),
}));

vi.mock('../config/database.js', () => ({ default: prismaMock }));
vi.mock('../socket/index.js', () => ({ getIO: mockGetIO }));
vi.mock('../utils/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { ChatSpaceService } from './chatSpace.service.js';

describe('ChatSpaceService Integration - Lifecycle', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('closes a session for the lecturer who owns the course', async () => {
        const closedAt = new Date('2026-05-03T10:00:00.000Z');
        const mockEmit = vi.fn();
        const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
        mockGetIO.mockReturnValue({ to: mockTo });

        prismaMock.chatSpace.findUnique.mockResolvedValue({
            id: 'chat-1',
            name: 'Group Discussion',
            closedAt: null,
            closedBy: null,
            group: {
                course: { ownerId: 'lecturer-1' },
                members: [{ userId: 'student-1' }],
            },
        });
        prismaMock.chatSpace.update.mockResolvedValue({
            id: 'chat-1',
            name: 'Group Discussion',
            closedAt,
            closedBy: 'lecturer-1',
        });

        const result = await ChatSpaceService.closeSession('chat-1', 'lecturer-1', 'lecturer');

        expect(prismaMock.chatSpace.update).toHaveBeenCalledWith({
            where: { id: 'chat-1' },
            data: {
                closedAt: expect.any(Date),
                closedBy: 'lecturer-1',
            },
        });
        expect(mockTo).toHaveBeenCalledWith('chat-1');
        expect(mockEmit).toHaveBeenCalledWith('session_closed', {
            chatSpaceId: 'chat-1',
            closedAt: closedAt.toISOString(),
            message: 'Sesi diskusi ini telah ditutup oleh dosen.',
        });
        expect(result).toEqual({
            id: 'chat-1',
            name: 'Group Discussion',
            closedAt,
            closedBy: 'lecturer-1',
        });
    });

    it('closes a session for a student group member', async () => {
        const closedAt = new Date('2026-05-03T11:00:00.000Z');
        const mockEmit = vi.fn();
        const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
        mockGetIO.mockReturnValue({ to: mockTo });

        prismaMock.chatSpace.findUnique.mockResolvedValue({
            id: 'chat-2',
            name: 'Peer Session',
            closedAt: null,
            closedBy: null,
            group: {
                course: { ownerId: 'lecturer-1' },
                members: [{ userId: 'student-1' }],
            },
        });
        prismaMock.chatSpace.update.mockResolvedValue({
            id: 'chat-2',
            name: 'Peer Session',
            closedAt,
            closedBy: 'student-1',
        });

        const result = await ChatSpaceService.closeSession('chat-2', 'student-1', 'student');

        expect(prismaMock.chatSpace.update).toHaveBeenCalledWith({
            where: { id: 'chat-2' },
            data: {
                closedAt: expect.any(Date),
                closedBy: 'student-1',
            },
        });
        expect(mockEmit).toHaveBeenCalledWith('session_closed', {
            chatSpaceId: 'chat-2',
            closedAt: closedAt.toISOString(),
            message: 'Sesi diskusi ini telah ditutup oleh mahasiswa.',
        });
        expect(result).toEqual({
            id: 'chat-2',
            name: 'Peer Session',
            closedAt,
            closedBy: 'student-1',
        });
    });

    it('rejects closing a session that is already closed', async () => {
        prismaMock.chatSpace.findUnique.mockResolvedValue({
            id: 'chat-3',
            name: 'Closed Session',
            closedAt: new Date('2026-05-03T09:00:00.000Z'),
            closedBy: 'lecturer-1',
            group: {
                course: { ownerId: 'lecturer-1' },
                members: [{ userId: 'student-1' }],
            },
        });

        await expect(ChatSpaceService.closeSession('chat-3', 'lecturer-1', 'lecturer')).rejects.toMatchObject({
            statusCode: 400,
            message: 'This session is already closed',
        });
    });

    it('rejects closing a session when the lecturer does not own the course', async () => {
        prismaMock.chatSpace.findUnique.mockResolvedValue({
            id: 'chat-4',
            name: 'Other Course Session',
            closedAt: null,
            closedBy: null,
            group: {
                course: { ownerId: 'lecturer-2' },
                members: [{ userId: 'student-1' }],
            },
        });

        await expect(ChatSpaceService.closeSession('chat-4', 'lecturer-1', 'lecturer')).rejects.toMatchObject({
            statusCode: 403,
            message: 'You do not own this course',
        });
    });

    it('rejects closing a session when the student is not a group member', async () => {
        prismaMock.chatSpace.findUnique.mockResolvedValue({
            id: 'chat-5',
            name: 'Restricted Session',
            closedAt: null,
            closedBy: null,
            group: {
                course: { ownerId: 'lecturer-1' },
                members: [{ userId: 'student-2' }],
            },
        });

        await expect(ChatSpaceService.closeSession('chat-5', 'student-1', 'student')).rejects.toMatchObject({
            statusCode: 403,
            message: 'You are not a member of this group',
        });
    });

    it('returns not found when closing a missing chat space', async () => {
        prismaMock.chatSpace.findUnique.mockResolvedValue(null);

        await expect(ChatSpaceService.closeSession('missing-chat', 'lecturer-1', 'lecturer')).rejects.toMatchObject({
            statusCode: 404,
            message: 'Chat space not found',
        });
    });

    it('reopens a closed session for the lecturer who owns the course', async () => {
        const mockEmit = vi.fn();
        const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
        mockGetIO.mockReturnValue({ to: mockTo });

        prismaMock.chatSpace.findUnique.mockResolvedValue({
            id: 'chat-6',
            name: 'Reopenable Session',
            closedAt: new Date('2026-05-03T08:00:00.000Z'),
            closedBy: 'lecturer-1',
            group: {
                course: { ownerId: 'lecturer-1' },
                members: [{ userId: 'student-1' }],
            },
        });
        prismaMock.chatSpace.update.mockResolvedValue({
            id: 'chat-6',
            name: 'Reopenable Session',
            closedAt: null,
            closedBy: null,
        });

        const result = await ChatSpaceService.reopenSession('chat-6', 'lecturer-1', 'lecturer');

        expect(prismaMock.chatSpace.update).toHaveBeenCalledWith({
            where: { id: 'chat-6' },
            data: {
                closedAt: null,
                closedBy: null,
            },
        });
        expect(mockTo).toHaveBeenCalledWith('chat-6');
        expect(mockEmit).toHaveBeenCalledWith('session_reopened', {
            chatSpaceId: 'chat-6',
        });
        expect(result).toEqual({
            id: 'chat-6',
            name: 'Reopenable Session',
            closedAt: null,
            closedBy: null,
        });
    });

    it('rejects reopening a session for students', async () => {
        await expect(ChatSpaceService.reopenSession('chat-7', 'student-1', 'student')).rejects.toMatchObject({
            statusCode: 403,
            message: 'Only lecturers can reopen chat sessions',
        });
    });

    it('rejects reopening a session that is not closed', async () => {
        prismaMock.chatSpace.findUnique.mockResolvedValue({
            id: 'chat-8',
            name: 'Open Session',
            closedAt: null,
            closedBy: null,
            group: {
                course: { ownerId: 'lecturer-1' },
                members: [{ userId: 'student-1' }],
            },
        });

        await expect(ChatSpaceService.reopenSession('chat-8', 'lecturer-1', 'lecturer')).rejects.toMatchObject({
            statusCode: 400,
            message: 'This session is not closed',
        });
    });

    it('returns open session status with no goal and no reflection', async () => {
        prismaMock.chatSpace.findUnique.mockResolvedValue({
            id: 'chat-9',
            name: 'Fresh Session',
            closedAt: null,
            closedBy: null,
            group: {
                course: { ownerId: 'lecturer-1' },
                members: [{ userId: 'student-1' }],
            },
            goals: [],
            reflections: [],
        });

        const result = await ChatSpaceService.getChatSpaceStatus('chat-9', 'student-1', 'student');

        expect(result).toEqual({
            id: 'chat-9',
            name: 'Fresh Session',
            isClosed: false,
            closedAt: null,
            hasReflection: false,
            needsReflection: false,
            hasGoal: false,
        });
    });

    it('returns closed session status showing that a student needs reflection', async () => {
        const closedAt = new Date('2026-05-03T14:00:00.000Z');
        prismaMock.chatSpace.findUnique.mockResolvedValue({
            id: 'chat-10',
            name: 'Reflection Needed',
            closedAt,
            closedBy: 'lecturer-1',
            group: {
                course: { ownerId: 'lecturer-1' },
                members: [{ userId: 'student-1' }],
            },
            goals: [],
            reflections: [],
        });

        const result = await ChatSpaceService.getChatSpaceStatus('chat-10', 'student-1', 'student');

        expect(result).toEqual({
            id: 'chat-10',
            name: 'Reflection Needed',
            isClosed: true,
            closedAt,
            hasReflection: false,
            needsReflection: true,
            hasGoal: false,
        });
    });

    it('submits a reflection successfully for a closed session and links the goal', async () => {
        const createdAt = new Date('2026-05-03T15:00:00.000Z');
        prismaMock.chatSpace.findUnique.mockResolvedValue({
            id: 'chat-11',
            name: 'Closed Reflection Session',
            closedAt: new Date('2026-05-03T13:00:00.000Z'),
            closedBy: 'lecturer-1',
            group: {
                course: { ownerId: 'lecturer-1' },
                members: [{ userId: 'student-1' }],
            },
            goals: [{ id: 'goal-1' }],
        });
        prismaMock.reflection.findFirst.mockResolvedValue(null);
        prismaMock.reflection.create.mockResolvedValue({
            id: 'reflection-1',
            content: 'I learned to connect the discussion with my goal.',
            type: 'session',
            user: { id: 'student-1', name: 'Alya' },
            chatSpace: { id: 'chat-11', name: 'Closed Reflection Session' },
            goal: { id: 'goal-1', content: 'Summarize key arguments' },
            createdAt,
        });

        const result = await ChatSpaceService.submitSessionReflection(
            'chat-11',
            'I learned to connect the discussion with my goal.',
            'student-1'
        );

        expect(prismaMock.reflection.create).toHaveBeenCalledWith({
            data: {
                content: 'I learned to connect the discussion with my goal.',
                type: 'session',
                userId: 'student-1',
                chatSpaceId: 'chat-11',
                goalId: 'goal-1',
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
        });
        expect(result).toEqual({
            id: 'reflection-1',
            content: 'I learned to connect the discussion with my goal.',
            type: 'session',
            chatSpace: { id: 'chat-11', name: 'Closed Reflection Session' },
            goal: { id: 'goal-1', content: 'Summarize key arguments' },
            createdBy: { id: 'student-1', name: 'Alya' },
            createdAt,
        });
    });

    it('rejects reflection submission when the session is not closed', async () => {
        prismaMock.chatSpace.findUnique.mockResolvedValue({
            id: 'chat-12',
            name: 'Open Reflection Session',
            closedAt: null,
            closedBy: null,
            group: {
                course: { ownerId: 'lecturer-1' },
                members: [{ userId: 'student-1' }],
            },
            goals: [],
        });

        await expect(ChatSpaceService.submitSessionReflection('chat-12', 'Reflection content', 'student-1')).rejects.toMatchObject({
            statusCode: 400,
            message: 'Session must be closed before submitting reflection',
        });
    });

    it('rejects duplicate reflection submission', async () => {
        prismaMock.chatSpace.findUnique.mockResolvedValue({
            id: 'chat-13',
            name: 'Duplicate Reflection Session',
            closedAt: new Date('2026-05-03T16:00:00.000Z'),
            closedBy: 'lecturer-1',
            group: {
                course: { ownerId: 'lecturer-1' },
                members: [{ userId: 'student-1' }],
            },
            goals: [],
        });
        prismaMock.reflection.findFirst.mockResolvedValue({
            id: 'reflection-existing',
        });

        await expect(ChatSpaceService.submitSessionReflection('chat-13', 'Reflection content', 'student-1')).rejects.toMatchObject({
            statusCode: 400,
            message: 'You have already submitted a reflection for this session',
        });
    });

    it('rejects reflection submission when the user is not a group member', async () => {
        prismaMock.chatSpace.findUnique.mockResolvedValue({
            id: 'chat-14',
            name: 'Protected Reflection Session',
            closedAt: new Date('2026-05-03T17:00:00.000Z'),
            closedBy: 'lecturer-1',
            group: {
                course: { ownerId: 'lecturer-1' },
                members: [{ userId: 'student-2' }],
            },
            goals: [],
        });

        await expect(ChatSpaceService.submitSessionReflection('chat-14', 'Reflection content', 'student-1')).rejects.toMatchObject({
            statusCode: 403,
            message: 'You are not a member of this group',
        });
    });
});
