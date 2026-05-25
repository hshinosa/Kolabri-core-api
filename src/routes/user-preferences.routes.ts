import { Router } from 'express';
import { UserPreferencesController } from '../controllers/user-preferences.controller.js';
import { AccountDeletionController } from '../controllers/account-deletion.controller.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.get('/preferences', verifyToken, UserPreferencesController.get);
router.patch('/preferences', verifyToken, UserPreferencesController.update);
router.delete('/account', verifyToken, AccountDeletionController.deleteAccount);

export default router;
