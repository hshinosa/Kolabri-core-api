import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryRawMock, mongooseMock } = vi.hoisted(() => ({
    queryRawMock: vi.fn(),
    mongooseMock: { connection: { readyState: 1 } },
}));

vi.mock('../config/database.js', () => ({
    default: { $queryRaw: queryRawMock },
}));

vi.mock('mongoose', () => ({
    default: mongooseMock,
}));

import healthRouter from './health.routes.js';

function getHealthHandler() {
    const layer = healthRouter.stack[0];
    if (!layer?.route?.stack[0]?.handle) {
        throw new Error('Health route handler not found');
    }

    return layer.route.stack[0].handle as (
        req: Request,
        res: Response,
        next: NextFunction
    ) => Promise<void>;
}

function createResponseMock() {
    const res = {
        status: vi.fn(),
        json: vi.fn(),
    };
    res.status.mockReturnValue(res);
    return res;
}

describe('health.routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mongooseMock.connection.readyState = 1;
    });

    it('returns ok when postgres and mongodb are healthy', async () => {
        queryRawMock.mockResolvedValue([1]);
        const handler = getHealthHandler();
        const res = createResponseMock();

        await handler({} as Request, res as unknown as Response, vi.fn());

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                status: 'ok',
                services: {
                    postgres: 'up',
                    mongodb: 'up',
                },
            })
        );
    });

    it('returns degraded when postgres is down', async () => {
        queryRawMock.mockRejectedValue(new Error('db down'));
        const handler = getHealthHandler();
        const res = createResponseMock();

        await handler({} as Request, res as unknown as Response, vi.fn());

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                status: 'degraded',
                services: expect.objectContaining({
                    postgres: 'down',
                }),
            })
        );
    });

    it('reports mongodb as not connected when readyState is not 1', async () => {
        queryRawMock.mockResolvedValue([1]);
        mongooseMock.connection.readyState = 0;
        const handler = getHealthHandler();
        const res = createResponseMock();

        await handler({} as Request, res as unknown as Response, vi.fn());

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                status: 'ok',
                services: {
                    postgres: 'up',
                    mongodb: 'not connected',
                },
            })
        );
    });
});
