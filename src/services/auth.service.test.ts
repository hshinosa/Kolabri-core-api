import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';

const { prismaMock, bcryptMock } = vi.hoisted(() => ({
    prismaMock: {
        user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    },
    bcryptMock: {
        hash: vi.fn(),
        compare: vi.fn(),
    },
}));

vi.mock('../config/database.js', () => ({
    default: prismaMock,
}));

vi.mock('bcrypt', () => ({
    default: bcryptMock,
}));

import { AuthService } from './auth.service.js';

describe('AuthService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.JWT_SECRET = 'test-secret';
        process.env.JWT_REFRESH_SECRET = 'refresh-secret';
    });

    afterEach(() => {
        delete process.env.JWT_SECRET;
        delete process.env.JWT_REFRESH_SECRET;
    });

    it('registers a new user and returns access and refresh tokens', async () => {
        prismaMock.user.findFirst.mockResolvedValue(null);
        bcryptMock.hash.mockResolvedValue('hashed-password');
        prismaMock.user.create.mockResolvedValue({
            id: 'user-1',
            name: 'Alya',
            email: 'alya@example.com',
            role: 'student',
            createdAt: new Date('2026-05-01T00:00:00.000Z'),
        });

        const result = await AuthService.register({
            name: 'Alya',
            email: 'alya@example.com',
            password: 'secret123',
            role: 'student',
        });

        expect(bcryptMock.hash).toHaveBeenCalledWith('secret123', 10);
        expect(prismaMock.user.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ password: 'hashed-password' }),
            })
        );
        expect(result.user.id).toBe('user-1');
        expect(typeof result.accessToken).toBe('string');
        expect(typeof result.refreshToken).toBe('string');
    });

    it('rejects login when the password does not match', async () => {
        prismaMock.user.findFirst.mockResolvedValue({
            id: 'user-1',
            name: 'Alya',
            email: 'alya@example.com',
            password: 'stored-hash',
            role: 'student',
            isActive: true,
        });
        bcryptMock.compare.mockResolvedValue(false);

        await expect(AuthService.login({ email: 'alya@example.com', password: 'wrong-pass' })).rejects.toMatchObject({
            statusCode: 401,
            message: 'Invalid email or password',
        });
    });

    it('returns a new access token from a valid refresh token', async () => {
        const refreshToken = jwt.sign(
            { userId: 'user-1', email: 'alya@example.com', role: 'student', type: 'refresh' },
            process.env.JWT_REFRESH_SECRET as string,
            { expiresIn: '1h' }
        );
        prismaMock.user.findFirst.mockResolvedValue({
            id: 'user-1',
            email: 'alya@example.com',
            role: 'student',
            isActive: true,
        });

        const result = await AuthService.refreshAccessToken(refreshToken);

        expect(result).toEqual({ accessToken: expect.any(String) });
        const decoded = jwt.verify(result.accessToken, process.env.JWT_SECRET as string) as jwt.JwtPayload;
        expect(decoded.userId).toBe('user-1');
        expect(decoded.email).toBe('alya@example.com');
    });

    it('revokes refresh tokens on logout', async () => {
        const refreshToken = 'refresh-token-1';

        const result = await AuthService.logout(refreshToken);

        expect(result).toEqual({ message: 'Logged out successfully' });
        expect(await AuthService.isTokenBlacklisted(refreshToken)).toBe(true);
    });

    it('rejects revoked refresh tokens before verification', async () => {
        const refreshToken = 'refresh-token-2';
        await AuthService.logout(refreshToken);

        await expect(AuthService.refreshAccessToken(refreshToken)).rejects.toMatchObject({
            statusCode: 401,
            message: 'Token has been revoked',
        });
    });
});
