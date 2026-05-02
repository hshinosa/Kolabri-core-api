import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

import { ApiError, errorHandler } from './errorHandler.js';

describe('errorHandler', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('serializes ApiError details into the response body', () => {
        const statusMock = vi.fn().mockReturnThis();
        const jsonMock = vi.fn();
        const res = { status: statusMock, json: jsonMock } as unknown as Response;

        errorHandler(
            ApiError.badRequest('Validation failed', { field: 'email' }),
            {} as Request,
            res,
            vi.fn() as NextFunction
        );

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({
            error: {
                code: 'BAD_REQUEST',
                message: 'Validation failed',
                details: { field: 'email' },
            },
        });
    });

    it('falls back to a 500 internal error payload for generic errors', () => {
        const statusMock = vi.fn().mockReturnThis();
        const jsonMock = vi.fn();
        const res = { status: statusMock, json: jsonMock } as unknown as Response;

        errorHandler(new Error('boom'), {} as Request, res, vi.fn() as NextFunction);

        expect(statusMock).toHaveBeenCalledWith(500);
        expect(jsonMock).toHaveBeenCalledWith({
            error: {
                code: 'INTERNAL_ERROR',
                message: 'boom',
            },
        });
    });

    it('logs errors to console outside production mode', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const statusMock = vi.fn().mockReturnThis();
        const jsonMock = vi.fn();
        const res = { status: statusMock, json: jsonMock } as unknown as Response;
        process.env.NODE_ENV = 'test';

        errorHandler(ApiError.notFound('Missing resource'), {} as Request, res, vi.fn() as NextFunction);

        expect(consoleSpy).toHaveBeenCalledWith('Error:', expect.objectContaining({ message: 'Missing resource' }));
    });
});
