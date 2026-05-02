import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Response } from 'express';

const { auditLogServiceMock } = vi.hoisted(() => ({
    auditLogServiceMock: {
        logAction: vi.fn(),
        sanitizePayload: vi.fn(),
    },
}));

vi.mock('../services/audit-log.service.js', () => ({
    AuditLogService: auditLogServiceMock,
}));

import { auditLogMiddleware } from './audit-log.middleware.js';

describe('auditLogMiddleware', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        auditLogServiceMock.sanitizePayload.mockImplementation((payload: unknown) => payload);
        auditLogServiceMock.logAction.mockResolvedValue({ id: 'audit-1' });
    });

    it('calls next immediately and logs the action on successful finish', async () => {
        let finishHandler: (() => Promise<void>) | undefined;
        const req = {
            method: 'POST',
            originalUrl: '/admin/users',
            params: { id: 'user-1' },
            body: { name: 'Alya' },
            user: { userId: 'admin-1' },
        } as never;
        const res = {
            statusCode: 201,
            locals: {},
            on: vi.fn((event: string, handler: () => Promise<void>) => {
                if (event === 'finish') finishHandler = handler;
            }),
        } as unknown as Response;
        const next = vi.fn() as NextFunction;

        auditLogMiddleware({ action: 'CREATE', entityType: 'User' })(req, res, next);
        await finishHandler?.();

        expect(next).toHaveBeenCalled();
        expect(auditLogServiceMock.logAction).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'CREATE',
                entityType: 'User',
                entityId: 'user-1',
                userId: 'admin-1',
            })
        );
        expect(res.locals.auditLogged).toBe(true);
    });

    it('skips logging when there is no authenticated user', async () => {
        let finishHandler: (() => Promise<void>) | undefined;
        const req = { method: 'POST', originalUrl: '/admin/users', params: {}, body: {} } as never;
        const res = {
            statusCode: 200,
            locals: {},
            on: vi.fn((event: string, handler: () => Promise<void>) => {
                if (event === 'finish') finishHandler = handler;
            }),
        } as unknown as Response;

        auditLogMiddleware({ action: 'CREATE', entityType: 'User' })(req, res, vi.fn());
        await finishHandler?.();

        expect(auditLogServiceMock.logAction).not.toHaveBeenCalled();
    });

    it('swallows fallback logging errors to preserve the response', async () => {
        let finishHandler: (() => Promise<void>) | undefined;
        auditLogServiceMock.logAction.mockRejectedValue(new Error('db failed'));
        const req = {
            method: 'DELETE',
            originalUrl: '/admin/users/user-1',
            params: { id: 'user-1' },
            body: {},
            user: { userId: 'admin-1' },
        } as never;
        const res = {
            statusCode: 200,
            locals: {},
            on: vi.fn((event: string, handler: () => Promise<void>) => {
                if (event === 'finish') finishHandler = handler;
            }),
        } as unknown as Response;

        auditLogMiddleware({ action: 'DELETE', entityType: 'User' })(req, res, vi.fn());
        await expect(finishHandler?.()).resolves.toBeUndefined();
    });
});
