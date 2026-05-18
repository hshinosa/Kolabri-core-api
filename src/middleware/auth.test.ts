import http from 'node:http';

import express from 'express';
import jwt from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
    prismaMock: {
        user: { findFirst: vi.fn() },
    },
}));

vi.mock('../config/database.js', () => ({ default: prismaMock }));

import { verifyToken } from './auth.js';
import { errorHandler } from './errorHandler.js';

async function makeRequest(token?: string): Promise<{ status: number; body: string }> {
    const app = express();

    app.get('/protected', verifyToken, (req, res) => {
        res.status(200).json({
            ok: true,
            user: (req as { user?: unknown }).user,
        });
    });

    app.use(errorHandler);

    const server = http.createServer(app);

    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
        throw new Error('Failed to start test server');
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/protected`, {
        headers: token
            ? {
                Authorization: `Bearer ${token}`,
            }
            : undefined,
    });

    const body = await response.text();

    await new Promise<void>((resolve, reject) => {
        server.close((error) => {
            if (error) {
                reject(error);
                return;
            }

            resolve();
        });
    });

    return {
        status: response.status,
        body,
    };
}

describe('verifyToken', () => {
    beforeEach(() => {
        process.env.JWT_SECRET = 'test-secret';
        vi.clearAllMocks();
    });

    afterEach(() => {
        delete process.env.JWT_SECRET;
    });

    it('passes valid token and attaches user to request', async () => {
        prismaMock.user.findFirst.mockResolvedValue({ id: 'user-1' });

        const token = jwt.sign(
            {
                userId: 'user-1',
                email: 'test@example.com',
                role: 'student',
            },
            process.env.JWT_SECRET as string,
            { expiresIn: '1h' }
        );

        const response = await makeRequest(token);

        expect(response.status).toBe(200);
        expect(JSON.parse(response.body)).toEqual({
            ok: true,
            user: {
                userId: 'user-1',
                email: 'test@example.com',
                role: 'student',
                iat: expect.any(Number),
                exp: expect.any(Number),
            },
        });
    });

    it('returns 401 when token is missing', async () => {
        const response = await makeRequest();

        expect(response.status).toBe(401);
        expect(JSON.parse(response.body)).toEqual({
            error: {
                code: 'UNAUTHORIZED',
                message: 'No token provided',
            },
        });
    });

    it('returns 401 when token is expired', async () => {
        const token = jwt.sign(
            {
                userId: 'user-1',
                email: 'test@example.com',
                role: 'student',
            },
            process.env.JWT_SECRET as string,
            { expiresIn: -1 }
        );

        const response = await makeRequest(token);

        expect(response.status).toBe(401);
        expect(JSON.parse(response.body)).toEqual({
            error: expect.objectContaining({
                code: 'UNAUTHORIZED',
            }),
        });
    });

    it('returns 401 when token is invalid', async () => {
        const response = await makeRequest('invalid-token');

        expect(response.status).toBe(401);
        expect(JSON.parse(response.body)).toEqual({
            error: {
                code: 'UNAUTHORIZED',
                message: 'Invalid token',
            },
        });
    });

    it('returns 401 when user does not exist in database', async () => {
        prismaMock.user.findFirst.mockResolvedValue(null);

        const token = jwt.sign(
            { userId: 'deleted-user', email: 'gone@example.com', role: 'student' },
            process.env.JWT_SECRET as string,
            { expiresIn: '1h' }
        );

        const response = await makeRequest(token);

        expect(response.status).toBe(401);
        expect(JSON.parse(response.body)).toEqual({
            error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
    });

    it('returns 401 when user is soft-deleted', async () => {
        prismaMock.user.findFirst.mockResolvedValue(null);

        const token = jwt.sign(
            { userId: 'soft-deleted-user', email: 'inactive@example.com', role: 'student' },
            process.env.JWT_SECRET as string,
            { expiresIn: '1h' }
        );

        const response = await makeRequest(token);

        expect(response.status).toBe(401);
        expect(JSON.parse(response.body)).toEqual({
            error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
    });
});
