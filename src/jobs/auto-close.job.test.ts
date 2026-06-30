import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, chatLogFindOneMock, closeSessionMock, loggerMock } = vi.hoisted(() => ({
    prismaMock: {
        sessionDiscussion: {
            findMany: vi.fn(),
        },
    },
    chatLogFindOneMock: vi.fn(),
    closeSessionMock: vi.fn(),
    loggerMock: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

vi.mock('../config/database.js', () => ({
    default: prismaMock,
}));

vi.mock('../models/ChatLog.js', () => ({
    ChatLog: {
        findOne: chatLogFindOneMock,
    },
}));

vi.mock('../services/sessionDiscussion.service.js', () => ({
    SessionDiscussionService: {
        closeSession: closeSessionMock,
    },
}));

vi.mock('../utils/logger.js', () => ({
    logger: loggerMock,
}));

import { runAutoCloseJob } from './auto-close.job.js';

describe('runAutoCloseJob', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-06-26T03:00:00.000Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('does not close a new session without messages before three hours', async () => {
        prismaMock.sessionDiscussion.findMany.mockResolvedValue([
            {
                id: 'session-1',
                name: 'Fresh Session',
                createdAt: new Date('2026-06-26T02:31:24.765Z'),
            },
        ]);
        chatLogFindOneMock.mockReturnValue({
            sort: vi.fn(() => ({
                select: vi.fn(() => ({
                    lean: vi.fn(() => Promise.resolve(null)),
                })),
            })),
        });

        const result = await runAutoCloseJob();

        expect(closeSessionMock).not.toHaveBeenCalled();
        expect(result).toEqual({ closed: 0, errors: 0 });
    });

    it('closes a session without messages after three hours from creation', async () => {
        prismaMock.sessionDiscussion.findMany.mockResolvedValue([
            {
                id: 'session-2',
                name: 'Stale Session',
                createdAt: new Date('2026-06-25T23:30:00.000Z'),
            },
        ]);
        chatLogFindOneMock.mockReturnValue({
            sort: vi.fn(() => ({
                select: vi.fn(() => ({
                    lean: vi.fn(() => Promise.resolve(null)),
                })),
            })),
        });

        const result = await runAutoCloseJob();

        expect(closeSessionMock).toHaveBeenCalledWith('session-2', 'system', 'admin');
        expect(result).toEqual({ closed: 1, errors: 0 });
    });
});
