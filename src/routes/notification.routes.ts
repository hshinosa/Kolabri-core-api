import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.get('/', verifyToken, NotificationController.list);
router.post('/:id/read', verifyToken, NotificationController.markRead);
router.post('/read-all', verifyToken, NotificationController.markAllRead);

export default router;
