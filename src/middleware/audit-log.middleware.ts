import { NextFunction, Response } from 'express';
import { AuthenticatedRequest } from './auth.js';
import { AuditLogService } from '../services/audit-log.service.js';

type AuditLogMiddlewareOptions = {
    action: string;
    entityType: string;
    entityIdParam?: string;
};

export function auditLogMiddleware(options: AuditLogMiddlewareOptions) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const startedAt = Date.now();

        res.on('finish', async () => {
            if (!req.user || res.statusCode < 200 || res.statusCode >= 400 || res.locals.auditLogged) {
                return;
            }

            const entityIdParam = options.entityIdParam ?? 'id';
            const entityId = res.locals.auditEntityId ?? req.params[entityIdParam] ?? 'unknown';

            try {
                await AuditLogService.logAction({
                    action: options.action,
                    entityType: options.entityType,
                    entityId: String(entityId),
                    userId: req.user.userId,
                    changes: {
                        before: null,
                        after: AuditLogService.sanitizePayload(req.body ?? {}),
                    },
                    metadata: {
                        source: 'middleware-fallback',
                        method: req.method,
                        route: req.originalUrl,
                        durationMs: Date.now() - startedAt,
                    },
                });
                res.locals.auditLogged = true;
            } catch {
                // keep response success even when fallback logging fails
            }
        });

        next();
    };
}
