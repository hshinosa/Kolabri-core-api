import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSessionDiscussionService } = vi.hoisted(() => ({
    mockSessionDiscussionService: {
        closeSession: vi.fn(),
        reopenSession: vi.fn(),
        getSessionDiscussionStatus: vi.fn(),
        submitSessionReflection: vi.fn(),
    },
}));

vi.mock('../services/sessionDiscussion.service.js', () => ({
    SessionDiscussionService: mockSessionDiscussionService,
}));

import { SessionDiscussionController } from './sessionDiscussion.controller.js';

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

describe('SessionDiscussionController', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('closes a session and returns success message', async () => {
        const result = { id: 'session-discussion-1', closed: true };
        mockSessionDiscussionService.closeSession.mockResolvedValue(result);
        const req = mockReq({ params: { id: 'session-discussion-1' } });
        const res = mockRes();
        const next = mockNext();

        await SessionDiscussionController.close(req as Request, res as Response, next);

        expect(mockSessionDiscussionService.closeSession).toHaveBeenCalledWith('session-discussion-1', 'user-1', 'lecturer');
        expect(res.json).toHaveBeenCalledWith({
            data: result,
            meta: { message: 'Session closed successfully' },
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('reopens a session and returns success message', async () => {
        const result = { id: 'session-discussion-1', closed: false };
        mockSessionDiscussionService.reopenSession.mockResolvedValue(result);
        const req = mockReq({ params: { id: 'session-discussion-1' } });
        const res = mockRes();
        const next = mockNext();

        await SessionDiscussionController.reopen(req as Request, res as Response, next);

        expect(mockSessionDiscussionService.reopenSession).toHaveBeenCalledWith('session-discussion-1', 'user-1', 'lecturer');
        expect(res.json).toHaveBeenCalledWith({
            data: result,
            meta: { message: 'Session reopened successfully' },
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('returns session discussion status for the authenticated user', async () => {
        const status = { isClosed: false, requiresReflection: true };
        mockSessionDiscussionService.getSessionDiscussionStatus.mockResolvedValue(status);
        const req = mockReq({ params: { id: 'session-discussion-1' }, user: { userId: 'student-1', role: 'student' } as Request['user'] });
        const res = mockRes();
        const next = mockNext();

        await SessionDiscussionController.getStatus(req as Request, res as Response, next);

        expect(mockSessionDiscussionService.getSessionDiscussionStatus).toHaveBeenCalledWith('session-discussion-1', 'student-1', 'student');
        expect(res.json).toHaveBeenCalledWith({ data: status });
        expect(next).not.toHaveBeenCalled();
    });

    it('submits a reflection and returns 201', async () => {
        const reflection = { id: 'reflection-1', content: 'It went well' };
        mockSessionDiscussionService.submitSessionReflection.mockResolvedValue(reflection);
        const req = mockReq({ params: { id: 'session-discussion-1' }, body: { content: 'It went well' }, user: { userId: 'student-1', role: 'student' } as Request['user'] });
        const res = mockRes();
        const next = mockNext();

        await SessionDiscussionController.submitReflection(req as Request, res as Response, next);

        expect(mockSessionDiscussionService.submitSessionReflection).toHaveBeenCalledWith('session-discussion-1', 'It went well', 'student-1');
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
            data: reflection,
            meta: { message: 'Reflection submitted successfully' },
        });
        expect(next).not.toHaveBeenCalled();
    });
});
