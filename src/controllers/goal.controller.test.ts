import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGoalService } = vi.hoisted(() => ({
    mockGoalService: {
        createGoal: vi.fn(),
        getSessionDiscussionGoals: vi.fn(),
        getMyGoals: vi.fn(),
        getGoalDetails: vi.fn(),
    },
}));

vi.mock('../services/goal.service.js', () => ({
    GoalService: mockGoalService,
}));

import { GoalController } from './goal.controller.js';

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

describe('GoalController', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('creates a goal and returns 201', async () => {
        const goal = { id: 'goal-1', title: 'Learn AI' };
        mockGoalService.createGoal.mockResolvedValue(goal);
        const req = mockReq({ body: { title: 'Learn AI' } });
        const res = mockRes();
        const next = mockNext();

        await GoalController.create(req as Request, res as Response, next);

        expect(mockGoalService.createGoal).toHaveBeenCalledWith(req.body, 'user-1');
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
            data: goal,
            meta: { message: 'Goal submitted successfully' },
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('returns goals for a session discussion using auth context', async () => {
        const goals = [{ id: 'goal-1' }];
        mockGoalService.getSessionDiscussionGoals.mockResolvedValue(goals);
        const req = mockReq({ params: { sessionDiscussionId: 'session-discussion-1' }, user: { userId: 'lecturer-1', role: 'lecturer' } as Request['user'] });
        const res = mockRes();
        const next = mockNext();

        await GoalController.getSessionDiscussionGoals(req as Request, res as Response, next);

        expect(mockGoalService.getSessionDiscussionGoals).toHaveBeenCalledWith('session-discussion-1', 'lecturer-1', 'lecturer');
        expect(res.json).toHaveBeenCalledWith({ data: goals });
        expect(next).not.toHaveBeenCalled();
    });

    it('returns the authenticated user goals', async () => {
        const goals = [{ id: 'goal-1' }];
        mockGoalService.getMyGoals.mockResolvedValue(goals);
        const req = mockReq();
        const res = mockRes();
        const next = mockNext();

        await GoalController.getMyGoals(req as Request, res as Response, next);

        expect(mockGoalService.getMyGoals).toHaveBeenCalledWith('user-1');
        expect(res.json).toHaveBeenCalledWith({ data: goals });
        expect(next).not.toHaveBeenCalled();
    });

    it('forwards show errors to next', async () => {
        const error = new Error('goal lookup failed');
        mockGoalService.getGoalDetails.mockRejectedValue(error);
        const req = mockReq({ params: { id: 'goal-1' } });
        const res = mockRes();
        const next = mockNext();

        await GoalController.show(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith(error);
    });
});
