import { Router } from 'express';
import { ConsentController } from '../controllers/consent.controller.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();
router.use(verifyToken); // all consent routes require auth
router.post('/grant', ConsentController.grant);
router.post('/revoke', ConsentController.revoke);
router.get('/', ConsentController.list);
export default router;
