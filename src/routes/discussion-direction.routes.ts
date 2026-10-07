import { Router } from 'express';
import { DiscussionDirectionController } from '../controllers/discussion-direction.controller.js';
import { verifyToken, requireLecturer } from '../middleware/auth.js';


const router = Router();

// P2-04 (pass2): direction/summary adalah fitur monitoring dosen — tanpa
// guard ini mahasiswa mana pun bisa membakar kuota AI engine tanpa batas.
router.use(verifyToken, requireLecturer);

router.post('/classify', DiscussionDirectionController.classify);
router.post('/summary', DiscussionDirectionController.summary);

export default router;
