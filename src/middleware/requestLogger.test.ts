import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

const { loggerMock } = vi.hoisted(() => ({
    loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../utils/logger.js', () => ({
    logger: loggerMock,
}));

import { requestLogger } from './requestLogger.js';

describe('requestLogger', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('logs the incoming request and calls next', () => {
        const req = { method: 'GET', path: '/health' } as Request;
        const res = { on: vi.fn() } as unknown as Response;
        const next = vi.fn() as NextFunction;

        requestLogger(req, res, next);

        expect(loggerMock.info).toHaveBeenCalledWith('→ GET /health');
        expect(next).toHaveBeenCalled();
    });

    it('logs successful responses at info level on finish', () => {
        let finishHandler: (() => void) | undefined;
        const req = { method: 'POST', path: '/courses' } as Request;
        const res = {
            statusCode: 201,
            on: vi.fn((event: string, handler: () => void) => {
                if (event === 'finish') finishHandler = handler;
            }),
        } as unknown as Response;

        requestLogger(req, res, vi.fn() as NextFunction);
        finishHandler?.();

        expect(loggerMock.info).toHaveBeenCalledWith(expect.stringMatching(/^← POST \/courses 201 \d+ms$/));
    });

    it('logs error responses at warn level on finish', () => {
        let finishHandler: (() => void) | undefined;
        const req = { method: 'DELETE', path: '/courses/course-1' } as Request;
        const res = {
            statusCode: 500,
            on: vi.fn((event: string, handler: () => void) => {
                if (event === 'finish') finishHandler = handler;
            }),
        } as unknown as Response;

        requestLogger(req, res, vi.fn() as NextFunction);
        finishHandler?.();

        expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringMatching(/^← DELETE \/courses\/course-1 500 \d+ms$/));
    });
});
