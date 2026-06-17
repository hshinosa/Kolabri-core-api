import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
    prismaMock: {
        auditLog: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    },
}));

vi.mock('../config/database.js', () => ({
    default: prismaMock,
}));

import { AuditLogService } from './audit-log.service.js';

describe('AuditLogService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('sanitizes sensitive fields recursively', () => {
        const payload = {
            password: 'secret',
            profile: {
                apiKey: 'abc',
                nested: {
                    refreshToken: 'token',
                    safe: 'value',
                },
            },
            history: [{ authorization: 'Bearer 1' }, { note: 'keep me' }],
            provider_context: { auth: { credential: 'sk-live-secret' } },
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
        };

        const result = AuditLogService.sanitizePayload(payload);

        expect(result).toEqual({
            password: '[REDACTED]',
            profile: {
                apiKey: '[REDACTED]',
                nested: {
                    refreshToken: '[REDACTED]',
                    safe: 'value',
                },
            },
            history: [{ authorization: '[REDACTED]' }, { note: 'keep me' }],
            provider_context: { auth: { credential: '[REDACTED]' } },
            createdAt: '2026-01-01T00:00:00.000Z',
        });
    });

    it('logs actions with sanitized changes and metadata', async () => {
        prismaMock.auditLog.create.mockResolvedValue({ id: 'audit-1' });

        await AuditLogService.logAction({
            action: 'UPDATE',
            entityType: 'course',
            entityId: 'course-1',
            userId: 'user-1',
            changes: { password: 'secret', title: 'New title' },
            metadata: { apiKey: 'abc', source: 'admin-panel' },
        });

        expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
            data: {
                action: 'UPDATE',
                entityType: 'course',
                entityId: 'course-1',
                userId: 'user-1',
                changes: { password: '[REDACTED]', title: 'New title' },
                metadata: { apiKey: '[REDACTED]', source: 'admin-panel' },
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        role: true,
                    },
                },
            },
        });
    });

    it('stores null json payloads as Prisma.JsonNull', async () => {
        prismaMock.auditLog.create.mockResolvedValue({ id: 'audit-2' });

        await AuditLogService.logAction({
            action: 'DELETE',
            entityType: 'group',
            entityId: 'group-1',
            userId: 'user-2',
            changes: null,
            metadata: null,
        });

        expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    changes: Prisma.JsonNull,
                    metadata: Prisma.JsonNull,
                }),
            })
        );
    });

    it('builds audit log filters including normalized dates and uppercase action', async () => {
        prismaMock.auditLog.findMany.mockResolvedValue([{ id: 'audit-1' }]);
        prismaMock.auditLog.count.mockResolvedValue(12);

        const result = await AuditLogService.getAuditLogs({
            action: 'update',
            entityType: 'course',
            userId: '550e8400-e29b-41d4-a716-446655440000',
            startDate: '2026-05-01',
            endDate: '2026-05-02',
            limit: 5,
            offset: 5,
        });

        expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith({
            where: {
                action: 'UPDATE',
                entityType: 'course',
                userId: '550e8400-e29b-41d4-a716-446655440000',
                createdAt: {
                    gte: expect.any(Date),
                    lte: expect.any(Date),
                },
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        role: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
            skip: 5,
            take: 5,
        });

        const call = prismaMock.auditLog.findMany.mock.calls[0][0];
        const gteDate = call.where.createdAt.gte;
        const lteDate = call.where.createdAt.lte;
        expect(gteDate).toBeInstanceOf(Date);
        expect(lteDate).toBeInstanceOf(Date);
        expect(gteDate.getFullYear()).toBe(2026);
        expect(lteDate.getFullYear()).toBe(2026);
        expect(result).toEqual({
            data: [{ id: 'audit-1' }],
            meta: {
                limit: 5,
                offset: 5,
                total: 12,
                hasMore: true,
            },
        });
    });

    it('ignores invalid dates in audit log filters', async () => {
        prismaMock.auditLog.findMany.mockResolvedValue([]);
        prismaMock.auditLog.count.mockResolvedValue(0);

        await AuditLogService.getAuditLogs({
            limit: 20,
            offset: 0,
            startDate: 'not-a-date',
            endDate: 'still-not-a-date',
        });

        expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {},
            })
        );
    });

    it('returns entity history ordered by latest first', async () => {
        prismaMock.auditLog.findMany.mockResolvedValue([{ id: 'audit-3' }]);

        const result = await AuditLogService.getEntityHistory('group', 'group-1');

        expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith({
            where: { entityType: 'group', entityId: 'group-1' },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        role: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
        expect(result).toEqual([{ id: 'audit-3' }]);
    });
});
