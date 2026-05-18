import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAuthService } = vi.hoisted(() => ({
    mockAuthService: {
        register: vi.fn(),
        login: vi.fn(),
        refreshAccessToken: vi.fn(),
        logout: vi.fn(),
        getProfile: vi.fn(),
    },
}));

vi.mock('../services/auth.service.js', () => ({
    AuthService: mockAuthService,
}));

import { AuthController } from './auth.controller.js';

function mockReq(overrides: Partial<Request> = {}) {
    return {
        body: {},
        params: {},
        query: {},
        user: {
            userId: 'user-1',
            role: 'student',
            email: 'user@example.com',
        },
        ...overrides,
    } as Partial<Request>;
}

function mockRes(): Partial<Response> {
    const res: Partial<Response> & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } = {
        status: vi.fn(),
        json: vi.fn(),
    };
    res.status.mockReturnValue(res as Response);
    res.json.mockReturnValue(res as Response);
    return res;
}

function mockNext(): NextFunction {
    return vi.fn() as unknown as NextFunction;
}

describe('AuthController', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('registers a user and returns 201 with success message', async () => {
        const result = { id: 'user-1', email: 'new@example.com' };
        mockAuthService.register.mockResolvedValue(result);
        const req = mockReq({ body: { email: 'new@example.com', password: 'secret' } });
        const res = mockRes();
        const next = mockNext();

        await AuthController.register(req as Request, res as Response, next);

        expect(mockAuthService.register).toHaveBeenCalledWith(req.body);
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
            data: result,
            meta: { message: 'User registered successfully' },
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('forwards register errors to next', async () => {
        const error = new Error('register failed');
        mockAuthService.register.mockRejectedValue(error);
        const req = mockReq({ body: { email: 'bad@example.com' } });
        const res = mockRes();
        const next = mockNext();

        await AuthController.register(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith(error);
    });

    it('logs in a user and returns tokens with success message', async () => {
        const result = { accessToken: 'access', refreshToken: 'refresh' };
        mockAuthService.login.mockResolvedValue(result);
        const req = mockReq({ body: { email: 'user@example.com', password: 'secret' } });
        const res = mockRes();
        const next = mockNext();

        await AuthController.login(req as Request, res as Response, next);

        expect(mockAuthService.login).toHaveBeenCalledWith(req.body);
        expect(res.json).toHaveBeenCalledWith({
            data: result,
            meta: { message: 'Login successful' },
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 400 when refresh token is missing on refresh', async () => {
        const req = mockReq({ body: {} });
        const res = mockRes();
        const next = mockNext();

        await AuthController.refresh(req as Request, res as Response, next);

        expect(mockAuthService.refreshAccessToken).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, code: 'BAD_REQUEST' }));
    });

    it('refreshes an access token when refresh token exists', async () => {
        const result = { accessToken: 'new-access' };
        mockAuthService.refreshAccessToken.mockResolvedValue(result);
        const req = mockReq({ body: { refreshToken: 'refresh-1' } });
        const res = mockRes();
        const next = mockNext();

        await AuthController.refresh(req as Request, res as Response, next);

        expect(mockAuthService.refreshAccessToken).toHaveBeenCalledWith('refresh-1');
        expect(res.json).toHaveBeenCalledWith({
            data: result,
            meta: { message: 'Token refreshed successfully' },
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 400 when refresh token is missing on logout', async () => {
        const req = mockReq({ body: {} });
        const res = mockRes();
        const next = mockNext();

        await AuthController.logout(req as Request, res as Response, next);

        expect(mockAuthService.logout).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, code: 'BAD_REQUEST' }));
    });

    it('logs out a user and returns success message', async () => {
        const result = { success: true };
        mockAuthService.logout.mockResolvedValue(result);
        const req = mockReq({ body: { refreshToken: 'refresh-1' } });
        const res = mockRes();
        const next = mockNext();

        await AuthController.logout(req as Request, res as Response, next);

        expect(mockAuthService.logout).toHaveBeenCalledWith('refresh-1');
        expect(res.json).toHaveBeenCalledWith({
            data: result,
            meta: { message: 'Logged out successfully' },
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when getProfile is called without authenticated user', async () => {
        const req = mockReq({ user: undefined });
        const res = mockRes();
        const next = mockNext();

        await AuthController.getProfile(req as Request, res as Response, next);

        expect(mockAuthService.getProfile).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
            error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('returns the current user profile when authenticated', async () => {
        const user = { id: 'user-1', email: 'user@example.com' };
        mockAuthService.getProfile.mockResolvedValue(user);
        const req = mockReq({
            user: { userId: 'user-1', role: 'student', email: 'user@example.com' } as Request['user'],
        });
        const res = mockRes();
        const next = mockNext();

        await AuthController.getProfile(req as Request, res as Response, next);

        expect(mockAuthService.getProfile).toHaveBeenCalledWith('user-1');
        expect(res.json).toHaveBeenCalledWith({ data: user });
        expect(next).not.toHaveBeenCalled();
    });
});
