import { Response, NextFunction } from 'express';
import { CourseService } from '../services/course.service.js';
import { KnowledgeBaseService } from '../services/knowledgeBase.service.js';
import { GroupService } from '../services/group.service.js';
import { GoalService } from '../services/goal.service.js';
import { ReadingRecommendationService } from '../services/readingRecommendation.service.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { ChatLog } from '../models/ChatLog.js';

export class CourseController {
    /**
     * POST /api/courses
     * Create a new course (lecturer only)
     */
    static async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const course = await CourseService.createCourse(req.body, req.user!.userId);

            res.status(201).json({
                data: course,
                meta: {
                    message: 'Course created successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/courses/:id/messages
     * Get course chat messages from MongoDB ChatLog for lecturer activity views.
     */
    static async getMessages(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const limit = Math.min(Number(req.query.limit ?? 1000), 10000);
            const messages = await ChatLog.find({
                courseId: req.params.id,
                deletedAt: null,
            })
                .sort({ createdAt: -1 })
                .limit(limit)
                .lean();

            res.json({
                data: messages.map((message) => ({
                    id: String(message._id),
                    course_id: message.courseId,
                    group_id: message.groupId,
                    session_discussion_id: message.sessionDiscussionId,
                    sender_id: message.senderId,
                    sender_name: message.senderName,
                    sender_type: message.senderType === 'student' ? 'user' : message.senderType,
                    content: message.content,
                    is_intervention: message.isIntervention,
                    created_at: message.createdAt,
                })),
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/courses/join
     * Join a course with join code (student only)
     */
    static async join(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const course = await CourseService.joinCourse(req.body, req.user!.userId);

            res.json({
                data: course,
                meta: {
                    message: 'Enrolled successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/courses
     * Get my courses (owned or enrolled)
     */
    static async index(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const courses = await CourseService.getMyCourses(req.user!.userId, req.user!.role);

            res.json({
                data: courses,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/courses/:id
     * Get course details
     */
    static async show(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const course = await CourseService.getCourseDetails(
                req.params.id,
                req.user!.userId,
                req.user!.role
            );

            res.json({
                data: course,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * PUT /api/courses/:id
     * Update course (lecturer only, must own course)
     */
    static async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const course = await CourseService.updateCourse(
                req.params.id,
                req.user!.userId,
                req.body
            );

            res.json({
                data: course,
                meta: { message: 'Course updated successfully' },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/courses/:id/students
     * Get enrolled students (lecturer only)
     */
    static async getStudents(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const students = await CourseService.getCourseStudents(req.params.id, req.user!.userId);

            res.json({
                data: students,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/courses/:id/knowledge-base
     * Upload PDF to knowledge base (lecturer only)
     */
    static async uploadKnowledgeBase(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            if (!req.file) {
                return res.status(400).json({
                    error: { code: 'NO_FILE', message: 'No file uploaded' },
                });
            }

            const result = await KnowledgeBaseService.uploadFile(
                req.params.id,
                req.file,
                req.user!.userId
            );

            res.status(201).json({
                data: result,
                meta: {
                    message: 'File uploaded successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/courses/:id/knowledge-base/batch
     * Upload multiple files or ZIP to knowledge base (lecturer only)
     * Supports: PDF, DOCX, PPTX, TXT, MD, images, ZIP
     */
    static async uploadKnowledgeBaseBatch(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const rawFiles = req.files as Express.Multer.File[] | Record<string, Express.Multer.File[]> | undefined;
            const files = Array.isArray(rawFiles)
                ? rawFiles
                : rawFiles
                    ? Object.values(rawFiles).flat()
                    : [];

            if (!files || files.length === 0) {
                return res.status(400).json({
                    error: { code: 'NO_FILES', message: 'No files uploaded' },
                });
            }

            // Get options from request body
            const options = {
                extractImages: req.body.extract_images !== 'false',
                performOcr: req.body.perform_ocr !== 'false',
            };

            const result = await KnowledgeBaseService.uploadBatch(
                req.params.id,
                files,
                req.user!.userId,
                options
            );

            res.status(201).json({
                data: result,
                meta: {
                    message: `Successfully uploaded ${result.stats.totalUploaded} files`,
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/courses/:id/knowledge-base
     * Get knowledge base files
     */
    static async getKnowledgeBase(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const files = await KnowledgeBaseService.getCourseFiles(
                req.params.id,
                req.user!.userId,
                req.user!.role
            );

            res.json({
                data: files,
            });
        } catch (error) {
            next(error);
        }
    }

    static async getReadingRecommendations(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const result = await ReadingRecommendationService.generate(
                req.params.id,
                req.body,
                req.user!.userId,
                req.user!.role
            );

            res.json({
                data: result,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/courses/enrolled
     * Get student's enrolled courses
     */
    static async enrolled(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const courses = await CourseService.getMyCourses(req.user!.userId, 'student');

            res.json({
                data: courses,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/courses/:id/my-group
     * Get student's group in a course
     */
    static async getMyGroup(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const group = await GroupService.getMyGroup(req.params.id, req.user!.userId);

            res.json({
                data: group,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/courses/:id/my-goal
     * Get student's goal in a course
     */
    static async getMyGoal(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            // First get the student's group in this course
            const group = await GroupService.getMyGroup(req.params.id, req.user!.userId);
            
            if (!group) {
                return res.json({
                    data: null,
                });
            }

            // Then get the student's goals - now structured with sessionDiscussion.group.course
            const goals = await GoalService.getMyGoals(req.user!.userId);
            const courseGoal = goals.find((g: { sessionDiscussion: { group: { course: { id: string } } } }) => 
                g.sessionDiscussion?.group?.course?.id === req.params.id
            );

            res.json({
                data: courseGoal || null,
            });
        } catch (error) {
            next(error);
        }
    }
}
