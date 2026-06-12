import { Router } from 'express';
import { DataExportController } from '../controllers/data-export.controller.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();
router.use(verifyToken);
router.post('/', DataExportController.requestExport);
router.get('/:jobId', DataExportController.getExportStatus);
export default router;
