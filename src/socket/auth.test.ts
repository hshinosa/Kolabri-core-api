import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyMock, findFirstMock, loggerMock } = vi.hoisted(() => ({
    verifyMock: vi.fn(),
    findFirstMock: vi.fn(),
    loggerMock: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('jsonwebtoken', () => ({
    default: {
        verify: verifyMock,
    },
}));

vi.mock('../config/database.js', () => ({
    default: {
        user: {
            findFirst: findFirstMock,
        },
    },
}));

vi.mock('../utils/logger.js', () => ({
    logger: loggerMock,
}));

import { authMiddleware } from './auth.js';

describe('authMiddleware', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.JWT_SECRET = 'jwt-secret';
        verifyMock.mockReturnValue({ userId: 'user-1' });
        findFirstMock.mockResolvedValue({ id: 'user-1' });
    });

    it('accepts tokens from handshake.auth', async () => {
        const next = vi.fn();
        const socket = {
            handshake: {
                auth: { token: 'valid-token' },
                query: {},
            },
        };

        await authMiddleware(socket as any, next);

        expect(verifyMock).toHaveBeenCalledWith('valid-token', 'jwt-secret');
        expect(next).toHaveBeenCalledWith();
    });

    it('rejects query-only tokens', async () => {
        const next = vi.fn();
        const socket = {
            handshake: {
                auth: {},
                query: { token: 'legacy-query-token' },
            },
        };

        await authMiddleware(socket as any, next);

        expect(verifyMock).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith(expect.any(Error));
        expect((next.mock.calls[0]?.[0] as Error).message).toBe('Authentication required');
    });
});
