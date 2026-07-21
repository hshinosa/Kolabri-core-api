import { Router } from 'express';
import { UserPreferencesController } from '../controllers/user-preferences.controller.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.get('/preferences', verifyToken, UserPreferencesController.get);
router.patch('/preferences', verifyToken, UserPreferencesController.update);

export default router;
