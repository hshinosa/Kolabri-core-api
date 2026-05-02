import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAuditLogService } = vi.hoisted(() => ({
    mockAuditLogService: {
        getAuditLogs: vi.fn(),
        getEntityHistory: vi.fn(),
    },
}));

vi.mock('../services/audit-log.service.js', () => ({
    AuditLogService: mockAuditLogService,
}));

import { AuditLogController } from './audit-log.controller.js';

function mockReq(overrides: Partial<Request> = {}) {
    return {
        body: {},
        params: {},
        query: {},
        user: {
            userId: 'user-1',
            role: 'admin',
            email: 'admin@example.com',
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

describe('AuditLogController', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns audit logs with pagination metadata', async () => {
        const result = { data: [{ id: 'log-1' }], meta: { total: 1 } };
        mockAuditLogService.getAuditLogs.mockResolvedValue(result);
        const req = mockReq({ query: { page: '1' } });
        const res = mockRes();
        const next = mockNext();

        await AuditLogController.index(req as Request, res as Response, next);

        expect(mockAuditLogService.getAuditLogs).toHaveBeenCalledWith(req.query);
        expect(res.json).toHaveBeenCalledWith({ data: result.data, meta: result.meta });
        expect(next).not.toHaveBeenCalled();
    });

    it('returns entity history from route params', async () => {
        const history = [{ id: 'log-1', action: 'UPDATE' }];
        mockAuditLogService.getEntityHistory.mockResolvedValue(history);
        const req = mockReq({ params: { entityType: 'course', entityId: 'course-1' } });
        const res = mockRes();
        const next = mockNext();

        await AuditLogController.entityHistory(req as Request, res as Response, next);

        expect(mockAuditLogService.getEntityHistory).toHaveBeenCalledWith('course', 'course-1');
        expect(res.json).toHaveBeenCalledWith({ data: history });
        expect(next).not.toHaveBeenCalled();
    });

    it('forwards history lookup errors to next', async () => {
        const error = new Error('history failed');
        mockAuditLogService.getEntityHistory.mockRejectedValue(error);
        const req = mockReq({ params: { entityType: 'course', entityId: 'course-1' } });
        const res = mockRes();
        const next = mockNext();

        await AuditLogController.entityHistory(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith(error);
    });
});
