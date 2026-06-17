import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, loggerMock, randomBytesMock } = vi.hoisted(() => ({
    prismaMock: {
        group: { findFirst: vi.fn(), findUnique: vi.fn() },
        user: { findUnique: vi.fn() },
        courseStudent: { findUnique: vi.fn(), findMany: vi.fn() },
        chatSpace: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
        chatSpacePreReadCompletion: { findUnique: vi.fn(), findMany: vi.fn() },
        groupMember: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), createMany: vi.fn(), delete: vi.fn() },
        $queryRaw: vi.fn(),
        $transaction: vi.fn(),
    },
    loggerMock: { error: vi.fn(), warn: vi.fn() },
    randomBytesMock: vi.fn(),
}));

vi.mock('../config/database.js', () => ({ default: prismaMock, prisma: prismaMock }));
vi.mock('./../utils/logger.js', () => ({ logger: loggerMock }));
vi.mock('crypto', () => ({ randomBytes: randomBytesMock }));

import { GroupService } from './group.service.js';

describe('GroupService week logging', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        randomBytesMock.mockReturnValue({ toString: vi.fn().mockReturnValue('ABC12345') });
    });

    it('logs and falls back to null week labels when week label query fails', async () => {
        prismaMock.groupMember.findFirst.mockResolvedValue({
            group: {
                id: 'group-1',
                name: 'Group 1',
                joinCode: 'JOIN',
                createdBy: 'user-1',
                members: [],
                chatSpaces: [{ id: 'chat-1', name: 'Chat', description: null, isDefault: false, weekId: 'week-1', goals: [] }],
            },
        });
        prismaMock.$queryRaw.mockRejectedValue(new Error('query failed'));
        prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1', name: 'Owner', email: 'owner@test.dev' });
        prismaMock.chatSpacePreReadCompletion.findMany.mockResolvedValue([]);

        const result = await GroupService.getMyGroup('course-1', 'user-1');

        expect(loggerMock.warn).toHaveBeenCalledWith(
            'Failed to resolve week labels',
            expect.objectContaining({ weekIds: ['week-1'] }),
        );
        expect(result?.chatSpaces[0]).toEqual(expect.objectContaining({ weekTitle: null, weekIndex: null }));
    });
});
