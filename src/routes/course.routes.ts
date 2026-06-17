import { Router } from 'express';
import multer from 'multer';
import { CourseController } from '../controllers/course.controller.js';
import { GroupController } from '../controllers/group.controller.js';
import { verifyToken, requireLecturer, requireStudent } from '../middleware/auth.js';
import { validateBody } from '../validators/validate.js';
import { createCourseSchema, joinCourseSchema, updateCourseSchema } from '../validators/course.validator.js';
import { createGroupSchema, addMembersSchema } from '../validators/group.validator.js';
import { readingRecommendationRequestSchema } from '../validators/readingRecommendation.validator.js';
import { z } from 'zod';

const router = Router();

const uploadBatchOptionsSchema = z.object({
    extract_images: z.string().optional().default('true'),
    perform_ocr: z.string().optional().default('true'),
});

// Configure multer for single file uploads (PDF only - legacy)
const uploadSingle = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
    },
    fileFilter: (_req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'));
        }
    },
});

// Configure multer for batch uploads (multiple file types including ZIP)
const SUPPORTED_MIMETYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint',
    'text/plain',
    'text/markdown',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/webp',
    'application/zip',
    'application/x-zip-compressed',
];

const uploadBatch = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max per file
        files: 50, // Max 50 files
    },
    fileFilter: (_req, file, cb) => {
        if (SUPPORTED_MIMETYPES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Unsupported file type: ${file.mimetype}`));
        }
    },
});

// Keep backward compatibility
const upload = uploadSingle;
const uploadBatchHandler = uploadBatch.fields([
    { name: 'files', maxCount: 50 },
    { name: 'files[]', maxCount: 50 },
]);

// All routes require authentication
router.use(verifyToken);

// Course CRUD
router.post('/', requireLecturer, validateBody(createCourseSchema), CourseController.create);
router.post('/join', requireStudent, validateBody(joinCourseSchema), CourseController.join);

// IMPORTANT: Specific routes MUST come before :id routes
router.get('/enrolled', requireStudent, CourseController.enrolled);
router.get('/my', CourseController.index);
router.get('/', CourseController.index); // Alias for /my

// Course by ID routes
router.get('/:id', CourseController.show);
router.put('/:id', requireLecturer, validateBody(updateCourseSchema), CourseController.update);
router.get('/:id/my-group', requireStudent, CourseController.getMyGroup);
router.get('/:id/my-goal', requireStudent, CourseController.getMyGoal);

// Course students (lecturer and enrolled students can access)
router.get('/:id/students', CourseController.getStudents);
router.get('/:id/messages', CourseController.getMessages);

// Course groups (lecturer and students can create/view)
router.get('/:id/groups', GroupController.getCourseGroups);
router.post('/:id/groups', validateBody(createGroupSchema), GroupController.createInCourse);
router.post('/:id/groups/:groupId/members', requireLecturer, validateBody(addMembersSchema), GroupController.addMembers);

// Knowledge base
router.post('/:id/knowledge-base', requireLecturer, upload.single('file'), CourseController.uploadKnowledgeBase);
router.post('/:id/knowledge-base/batch', requireLecturer, uploadBatchHandler, validateBody(uploadBatchOptionsSchema), CourseController.uploadKnowledgeBaseBatch);
router.get('/:id/knowledge-base', CourseController.getKnowledgeBase);
router.post('/:id/reading-recommendations', validateBody(readingRecommendationRequestSchema), CourseController.getReadingRecommendations);

export default router;
