import { Router } from 'express';
import { DiscussionHealthController } from '../controllers/discussion-health.controller.js';
import { verifyToken, requireLecturer } from '../middleware/auth.js';

const router = Router();

router.get('/', verifyToken, requireLecturer, DiscussionHealthController.list);

export default router;