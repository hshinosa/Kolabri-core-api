import { Router } from 'express';
import { UserPreferencesController } from '../controllers/user-preferences.controller.js';
import { AccountDeletionController } from '../controllers/account-deletion.controller.js';
import { AccountRecoveryController } from '../controllers/account-recovery.controller.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

router.get('/preferences', verifyToken, UserPreferencesController.get);
router.patch('/preferences', verifyToken, UserPreferencesController.update);
router.delete('/account', verifyToken, AccountDeletionController.deleteAccount);
router.post('/account/recover', verifyToken, AccountRecoveryController.recoverAccount);

export default router;
