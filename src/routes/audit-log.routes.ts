import { Router } from 'express';
import { AuditLogController } from '../controllers/audit-log.controller.js';
import { checkRole, verifyToken } from '../middleware/auth.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import { validateParams, validateQuery } from '../validators/validate.js';
import { auditEntityParamsSchema, auditLogQuerySchema } from '../validators/audit-log.validator.js';

const router = Router();

router.use(verifyToken);
router.use(checkRole(['admin']));
router.use(rateLimiter);

router.get('/', validateQuery(auditLogQuerySchema), AuditLogController.index);
router.get('/entity/:entityType/:entityId', validateParams(auditEntityParamsSchema), AuditLogController.entityHistory);

export default router;
