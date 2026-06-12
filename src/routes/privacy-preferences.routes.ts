import { Router } from 'express';
import { PrivacyPreferencesController } from '../controllers/privacy-preferences.controller.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();
router.use(verifyToken);
router.get('/privacy-preferences', PrivacyPreferencesController.get);
router.put('/privacy-preferences', PrivacyPreferencesController.update);
export default router;
