import { Router } from 'express';
import { GoalController } from '../controllers/goal.controller.js';
import { verifyToken, requireStudent } from '../middleware/auth.js';
import { validateBody } from '../validators/validate.js';
import { createGoalSchema } from '../validators/goal.validator.js';

const router = Router();

// All routes require authentication
router.use(verifyToken);

// Goal routes
router.post('/', requireStudent, validateBody(createGoalSchema), GoalController.create);
router.get('/me', GoalController.getMyGoals);
router.get('/session-discussion/:sessionDiscussionId', GoalController.getSessionDiscussionGoals);
router.get('/:id', GoalController.show);

export default router;
