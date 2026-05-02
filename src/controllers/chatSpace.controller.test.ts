import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockChatSpaceService } = vi.hoisted(() => ({
    mockChatSpaceService: {
        closeSession: vi.fn(),
        reopenSession: vi.fn(),
        getChatSpaceStatus: vi.fn(),
        submitSessionReflection: vi.fn(),
    },
}));

vi.mock('../services/chatSpace.service.js', () => ({
    ChatSpaceService: mockChatSpaceService,
}));

import { ChatSpaceController } from './chatSpace.controller.js';

function mockReq(overrides: Partial<Request> = {}) {
    return {
        body: {},
        params: {},
        query: {},
        user: {
            userId: 'user-1',
            role: 'lecturer',
            email: 'lecturer@example.com',
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

describe('ChatSpaceController', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('closes a session and returns success message', async () => {
        const result = { id: 'chat-space-1', closed: true };
        mockChatSpaceService.closeSession.mockResolvedValue(result);
        const req = mockReq({ params: { id: 'chat-space-1' } });
        const res = mockRes();
        const next = mockNext();

        await ChatSpaceController.close(req as Request, res as Response, next);

        expect(mockChatSpaceService.closeSession).toHaveBeenCalledWith('chat-space-1', 'user-1', 'lecturer');
        expect(res.json).toHaveBeenCalledWith({
            data: result,
            meta: { message: 'Session closed successfully' },
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('reopens a session and returns success message', async () => {
        const result = { id: 'chat-space-1', closed: false };
        mockChatSpaceService.reopenSession.mockResolvedValue(result);
        const req = mockReq({ params: { id: 'chat-space-1' } });
        const res = mockRes();
        const next = mockNext();

        await ChatSpaceController.reopen(req as Request, res as Response, next);

        expect(mockChatSpaceService.reopenSession).toHaveBeenCalledWith('chat-space-1', 'user-1', 'lecturer');
        expect(res.json).toHaveBeenCalledWith({
            data: result,
            meta: { message: 'Session reopened successfully' },
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('returns chat space status for the authenticated user', async () => {
        const status = { isClosed: false, requiresReflection: true };
        mockChatSpaceService.getChatSpaceStatus.mockResolvedValue(status);
        const req = mockReq({ params: { id: 'chat-space-1' }, user: { userId: 'student-1', role: 'student' } as Request['user'] });
        const res = mockRes();
        const next = mockNext();

        await ChatSpaceController.getStatus(req as Request, res as Response, next);

        expect(mockChatSpaceService.getChatSpaceStatus).toHaveBeenCalledWith('chat-space-1', 'student-1', 'student');
        expect(res.json).toHaveBeenCalledWith({ data: status });
        expect(next).not.toHaveBeenCalled();
    });

    it('submits a reflection and returns 201', async () => {
        const reflection = { id: 'reflection-1', content: 'It went well' };
        mockChatSpaceService.submitSessionReflection.mockResolvedValue(reflection);
        const req = mockReq({ params: { id: 'chat-space-1' }, body: { content: 'It went well' }, user: { userId: 'student-1', role: 'student' } as Request['user'] });
        const res = mockRes();
        const next = mockNext();

        await ChatSpaceController.submitReflection(req as Request, res as Response, next);

        expect(mockChatSpaceService.submitSessionReflection).toHaveBeenCalledWith('chat-space-1', 'It went well', 'student-1');
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
            data: reflection,
            meta: { message: 'Reflection submitted successfully' },
        });
        expect(next).not.toHaveBeenCalled();
    });
});
