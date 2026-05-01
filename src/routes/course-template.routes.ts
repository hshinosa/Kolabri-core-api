import { Router } from 'express';
import { z } from 'zod';
import { CourseAdminController } from '../controllers/course-admin.controller.js';
import { verifyToken, checkRole } from '../middleware/auth.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import { validateBody, validateParams } from '../validators/validate.js';
import { createCourseTemplateSchema } from '../validators/course-template.validator.js';

const router = Router();

const idSchema = z.object({
    id: z.string().uuid('Invalid template id'),
});

router.use(verifyToken);
router.use(checkRole(['admin']));
router.use(rateLimiter);

router.post('/', validateBody(createCourseTemplateSchema), CourseAdminController.createTemplate);
router.get('/', CourseAdminController.listTemplates);
router.get('/:id', validateParams(idSchema), CourseAdminController.showTemplate);
router.delete('/:id', validateParams(idSchema), CourseAdminController.deleteTemplate);

export default router;
