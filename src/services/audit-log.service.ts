import { Prisma } from '@prisma/client';
import prisma from '../config/database.js';
import { AuditLogQuery } from '../validators/audit-log.validator.js';

type AuditLogActionInput = {
    action: string;
    entityType: string;
    entityId: string;
    userId: string;
    changes?: unknown;
    metadata?: unknown;
};

const auditUserSelect = {
    id: true,
    name: true,
    email: true,
    role: true,
} as const;

const SENSITIVE_FIELD_PATTERNS = [
    'password',
    'apiKey',
    'api_key',
    'accessToken',
    'refreshToken',
    'token',
    'authorization',
    'secret',
    'clientSecret',
    'credential',
];

function isSensitiveField(key: string) {
    const normalizedKey = key.toLowerCase();
    return SENSITIVE_FIELD_PATTERNS.some((pattern) => normalizedKey.includes(pattern.toLowerCase()));
}

function sanitizeValue(value: unknown): unknown {
    if (value === null || value === undefined) {
        return value ?? null;
    }

    if (Array.isArray(value)) {
        return value.map((item) => sanitizeValue(item));
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    if (typeof value === 'object') {
        return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, currentValue]) => {
            acc[key] = isSensitiveField(key) ? '[REDACTED]' : sanitizeValue(currentValue);
            return acc;
        }, {});
    }

    return value;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (value === null) {
        return Prisma.JsonNull;
    }

    return sanitizeValue(value) as Prisma.InputJsonValue;
}

function normalizeDate(value?: string, endOfDay = false) {
    if (!value) {
        return undefined;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return undefined;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        date.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
    }

    return date;
}

export class AuditLogService {
    static sanitizePayload<T>(payload: T): T {
        return sanitizeValue(payload) as T;
    }

    static async logAction(input: AuditLogActionInput) {
        return prisma.auditLog.create({
            data: {
                action: input.action,
                entityType: input.entityType,
                entityId: input.entityId,
                userId: input.userId,
                changes: toJsonValue(input.changes),
                metadata: toJsonValue(input.metadata),
            },
            include: {
                user: {
                    select: auditUserSelect,
                },
            },
        });
    }

    static async getAuditLogs(filters: AuditLogQuery) {
        const startDate = normalizeDate(filters.startDate);
        const endDate = normalizeDate(filters.endDate, true);

        const where: Prisma.AuditLogWhereInput = {
            ...(filters.action ? { action: filters.action.toUpperCase() } : {}),
            ...(filters.entityType ? { entityType: filters.entityType } : {}),
            ...(filters.entityId ? { entityId: filters.entityId } : {}),
            ...(filters.userId ? { userId: filters.userId } : {}),
            ...(startDate || endDate
                ? {
                      createdAt: {
                          ...(startDate ? { gte: startDate } : {}),
                          ...(endDate ? { lte: endDate } : {}),
                      },
                  }
                : {}),
        };

        const [data, total] = await Promise.all([
            prisma.auditLog.findMany({
                where,
                include: {
                    user: {
                        select: auditUserSelect,
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip: filters.offset,
                take: filters.limit,
            }),
            prisma.auditLog.count({ where }),
        ]);

        return {
            data,
            meta: {
                limit: filters.limit,
                offset: filters.offset,
                total,
                hasMore: filters.offset + filters.limit < total,
            },
        };
    }

    static async getEntityHistory(entityType: string, entityId: string) {
        return prisma.auditLog.findMany({
            where: { entityType, entityId },
            include: {
                user: {
                    select: auditUserSelect,
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }
}
