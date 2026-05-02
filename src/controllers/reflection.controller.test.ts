import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockReflectionService } = vi.hoisted(() => ({
    mockReflectionService: {
        createReflection: vi.fn(),
        getMyReflections: vi.fn(),
        getGoalReflections: vi.fn(),
    },
}));

vi.mock('../services/reflection.service.js', () => ({
    ReflectionService: mockReflectionService,
}));

import { ReflectionController } from './reflection.controller.js';

function mockReq(overrides: Partial<Request> = {}) {
    return {
        body: {},
        params: {},
        query: {},
        user: {
            userId: 'user-1',
            role: 'student',
            email: 'student@example.com',
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

describe('ReflectionController', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('creates a reflection and returns 201', async () => {
        const reflection = { id: 'reflection-1', content: 'I learned a lot' };
        mockReflectionService.createReflection.mockResolvedValue(reflection);
        const req = mockReq({ body: { content: 'I learned a lot' } });
        const res = mockRes();
        const next = mockNext();

        await ReflectionController.create(req as Request, res as Response, next);

        expect(mockReflectionService.createReflection).toHaveBeenCalledWith(req.body, 'user-1');
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
            data: reflection,
            meta: { message: 'Reflection submitted successfully' },
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('returns reflections for the authenticated user', async () => {
        const reflections = [{ id: 'reflection-1' }];
        mockReflectionService.getMyReflections.mockResolvedValue(reflections);
        const req = mockReq();
        const res = mockRes();
        const next = mockNext();

        await ReflectionController.getMyReflections(req as Request, res as Response, next);

        expect(mockReflectionService.getMyReflections).toHaveBeenCalledWith('user-1');
        expect(res.json).toHaveBeenCalledWith({ data: reflections });
        expect(next).not.toHaveBeenCalled();
    });

    it('forwards goal reflection lookup errors to next', async () => {
        const error = new Error('reflection lookup failed');
        mockReflectionService.getGoalReflections.mockRejectedValue(error);
        const req = mockReq({ params: { goalId: 'goal-1' }, user: { userId: 'lecturer-1', role: 'lecturer' } as Request['user'] });
        const res = mockRes();
        const next = mockNext();

        await ReflectionController.getGoalReflections(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith(error);
    });
});
