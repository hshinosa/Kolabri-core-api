import { Router } from 'express';
import { DiscussionDirectionController } from '../controllers/discussion-direction.controller.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.use(verifyToken);

router.post('/classify', DiscussionDirectionController.classify);
router.post('/summary', DiscussionDirectionController.summary);

export default router;
