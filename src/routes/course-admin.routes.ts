import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { CourseAdminController } from '../controllers/course-admin.controller.js';
import { verifyToken, checkRole } from '../middleware/auth.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import { validateBody, validateParams, validateQuery } from '../validators/validate.js';
import {
    bulkCourseSelectionSchema,
    createCourseSchema,
    listCoursesQuerySchema,
    updateCourseSchema,
} from '../validators/course-admin.validator.js';
import { cloneCourseSchema } from '../validators/course-clone.validator.js';
import {
    createCourseFromTemplateSchema,
} from '../validators/course-template.validator.js';

const router = Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024,
    },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.toLowerCase().endsWith('.csv')) {
            cb(null, true);
            return;
        }

        cb(new Error('Only CSV files are allowed'));
    },
});

const idSchema = z.object({
    id: z.string().uuid('Invalid course id'),
});

const templateIdSchema = z.object({
    templateId: z.string().uuid('Invalid template id'),
});

router.use(verifyToken);
router.use(checkRole(['admin']));
router.use(rateLimiter);

router.get('/archived', validateQuery(listCoursesQuerySchema), CourseAdminController.archived);
router.post('/from-template/:templateId', validateParams(templateIdSchema), validateBody(createCourseFromTemplateSchema), CourseAdminController.createFromTemplate);
router.post('/bulk-activate', validateBody(bulkCourseSelectionSchema), CourseAdminController.bulkActivate);
router.post('/bulk-deactivate', validateBody(bulkCourseSelectionSchema), CourseAdminController.bulkDeactivate);
router.post('/bulk-import', upload.single('file'), CourseAdminController.bulkImport);
router.get('/', validateQuery(listCoursesQuerySchema), CourseAdminController.index);
router.get('/:id', validateParams(idSchema), CourseAdminController.show);
router.post('/', validateBody(createCourseSchema), CourseAdminController.create);
router.post('/:id/clone', validateParams(idSchema), validateBody(cloneCourseSchema), CourseAdminController.clone);
router.post('/:id/archive', validateParams(idSchema), CourseAdminController.archive);
router.post('/:id/restore', validateParams(idSchema), CourseAdminController.restore);
router.delete('/:id/permanent', validateParams(idSchema), CourseAdminController.permanentDelete);
router.put('/:id', validateParams(idSchema), validateBody(updateCourseSchema), CourseAdminController.update);
router.delete('/:id', validateParams(idSchema), CourseAdminController.delete);

export default router;
