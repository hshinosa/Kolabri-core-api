import { Router } from 'express';
import { PrivacyController } from '../controllers/privacy.controller.js';

const router = Router();
router.get('/policy', PrivacyController.getPolicy);
router.get('/data-categories', PrivacyController.getDataCategories);
export default router;
