import { Router } from 'express';
import { InternalController } from '../controllers/internal.controller.js';
import { verifyInternalSecret } from '../middleware/internalAuth.js';

const router = Router();

router.use(verifyInternalSecret);

router.post('/knowledge-base/queue-course-material', InternalController.queueCourseMaterial);
router.post('/knowledge-base/link-course-material', InternalController.linkCourseMaterial);
router.post('/knowledge-base/unassign-course-material', InternalController.unassignCourseMaterial);
router.post('/knowledge-base/delete-course-material', InternalController.deleteCourseMaterialKb);
router.post('/chat-spaces/backfill-week-ids', InternalController.backfillChatSpaceWeeks);

export default router;