import { NextFunction, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { AuditLogService } from '../services/audit-log.service.js';
import { AuditEntityParams, AuditLogQuery } from '../validators/audit-log.validator.js';

export class AuditLogController {
    static async index(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const result = await AuditLogService.getAuditLogs(req.query as unknown as AuditLogQuery);

            res.json({
                data: result.data,
                meta: result.meta,
            });
        } catch (error) {
            next(error);
        }
    }

    static async entityHistory(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const { entityType, entityId } = req.params as unknown as AuditEntityParams;
            const data = await AuditLogService.getEntityHistory(entityType, entityId);

            res.json({
                data,
            });
        } catch (error) {
            next(error);
        }
    }
}
