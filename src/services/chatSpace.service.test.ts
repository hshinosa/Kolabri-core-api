import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, ioMock, getIOMock, loggerMock } = vi.hoisted(() => ({
    prismaMock: {
        chatSpace: { findUnique: vi.fn(), update: vi.fn() },
        reflection: { findFirst: vi.fn(), create: vi.fn() },
    },
    ioMock: {
        to: vi.fn(),
    },
    getIOMock: vi.fn(),
    loggerMock: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

ioMock.to.mockReturnValue({ emit: vi.fn() });
getIOMock.mockReturnValue(ioMock);

vi.mock('../config/database.js', () => ({
    default: prismaMock,
}));

vi.mock('../socket/index.js', () => ({
    getIO: getIOMock,
}));

vi.mock('../utils/logger.js', () => ({
    logger: loggerMock,
}));

import { ChatSpaceService } from './chatSpace.service.js';

describe('ChatSpaceService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        ioMock.to.mockReturnValue({ emit: vi.fn() });
    });

    it('closes a session for a student group member and broadcasts the closure', async () => {
        const closedAt = new Date('2026-05-03T10:00:00.000Z');
        const emitMock = vi.fn();
        ioMock.to.mockReturnValue({ emit: emitMock });
        prismaMock.chatSpace.findUnique.mockResolvedValue({
            id: 'chat-1',
            name: 'General',
            closedAt: null,
            closedBy: null,
            group: {
                course: { ownerId: 'lecturer-1' },
                members: [{ userId: 'student-1' }],
            },
        });
        prismaMock.chatSpace.update.mockResolvedValue({
            id: 'chat-1',
            name: 'General',
            closedAt,
            closedBy: 'student-1',
        });

        const result = await ChatSpaceService.closeSession('chat-1', 'student-1', 'student');

        expect(prismaMock.chatSpace.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'chat-1' },
                data: expect.objectContaining({ closedBy: 'student-1' }),
            })
        );
        expect(emitMock).toHaveBeenCalledWith('session_closed', {
            chatSpaceId: 'chat-1',
            closedAt: closedAt.toISOString(),
            message: 'Sesi diskusi ini telah ditutup oleh mahasiswa.',
        });
        expect(result).toEqual({
            id: 'chat-1',
            name: 'General',
            closedAt,
            closedBy: 'student-1',
        });
    });

    it('rejects closing a session when the student is not a group member', async () => {
        prismaMock.chatSpace.findUnique.mockResolvedValue({
            id: 'chat-1',
            name: 'General',
            closedAt: null,
            closedBy: null,
            group: {
                course: { ownerId: 'lecturer-1' },
                members: [{ userId: 'student-2' }],
            },
        });

        await expect(ChatSpaceService.closeSession('chat-1', 'student-1', 'student')).rejects.toMatchObject({
            statusCode: 403,
            message: 'You are not a member of this group',
        });
    });

    it('computes chat space reflection status for a closed student session', async () => {
        prismaMock.chatSpace.findUnique.mockResolvedValue({
            id: 'chat-1',
            name: 'General',
            closedAt: new Date('2026-05-03T10:00:00.000Z'),
            closedBy: 'lecturer-1',
            group: {
                course: { ownerId: 'lecturer-1' },
                members: [{ userId: 'student-1' }],
            },
            goals: [{ id: 'goal-1' }],
            reflections: [],
        });

        const result = await ChatSpaceService.getChatSpaceStatus('chat-1', 'student-1', 'student');

        expect(result).toEqual({
            id: 'chat-1',
            name: 'General',
            isClosed: true,
            closedAt: new Date('2026-05-03T10:00:00.000Z'),
            hasReflection: false,
            needsReflection: true,
            hasGoal: true,
        });
    });

    it('submits a closed-session reflection and links the user goal when available', async () => {
        const createdAt = new Date('2026-05-03T12:00:00.000Z');
        prismaMock.chatSpace.findUnique.mockResolvedValue({
            id: 'chat-1',
            name: 'General',
            closedAt: new Date('2026-05-03T10:00:00.000Z'),
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
            content: 'I learned how to synthesize arguments.',
            type: 'session',
            chatSpace: { id: 'chat-1', name: 'General' },
            goal: { id: 'goal-1', content: 'Synthesize arguments' },
            user: { id: 'student-1', name: 'Alya' },
            createdAt,
        });

        const result = await ChatSpaceService.submitSessionReflection('chat-1', 'I learned how to synthesize arguments.', 'student-1');

        expect(prismaMock.reflection.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ goalId: 'goal-1', type: 'session' }),
            })
        );
        expect(result).toEqual({
            id: 'reflection-1',
            content: 'I learned how to synthesize arguments.',
            type: 'session',
            chatSpace: { id: 'chat-1', name: 'General' },
            goal: { id: 'goal-1', content: 'Synthesize arguments' },
            createdBy: { id: 'student-1', name: 'Alya' },
            createdAt,
        });
    });

    it('rejects reflection submission before the session is closed', async () => {
        prismaMock.chatSpace.findUnique.mockResolvedValue({
            id: 'chat-1',
            name: 'General',
            closedAt: null,
            closedBy: null,
            group: {
                course: { ownerId: 'lecturer-1' },
                members: [{ userId: 'student-1' }],
            },
            goals: [],
        });

        await expect(ChatSpaceService.submitSessionReflection('chat-1', 'Reflection', 'student-1')).rejects.toMatchObject({
            statusCode: 400,
            message: 'Session must be closed before submitting reflection',
        });
    });
});
