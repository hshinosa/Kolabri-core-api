import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { CourseAdminService } from '../services/course-admin.service.js';
import { ApiError } from '../middleware/errorHandler.js';
import {
    BulkCourseSelectionInput,
    CreateCourseInput,
    ListCoursesQuery,
    UpdateCourseInput,
} from '../validators/course-admin.validator.js';
import { CloneCourseInput } from '../validators/course-clone.validator.js';
import {
    CreateCourseFromTemplateInput,
    CreateCourseTemplateInput,
} from '../validators/course-template.validator.js';

export class CourseAdminController {
    static async index(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const result = await CourseAdminService.getCourses(req.query as unknown as ListCoursesQuery);

            res.json({
                data: result.data,
                meta: result.meta,
            });
        } catch (error) {
            next(error);
        }
    }

    static async show(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const course = await CourseAdminService.getCourseById(req.params.id);

            res.json({
                data: course,
            });
        } catch (error) {
            next(error);
        }
    }

    static async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const course = await CourseAdminService.createCourse(req.body as CreateCourseInput, req.user!.userId);

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

    static async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const course = await CourseAdminService.updateCourse(req.params.id, req.body as UpdateCourseInput, req.user!.userId);

            res.json({
                data: course,
                meta: {
                    message: 'Course updated successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    static async delete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            await CourseAdminService.deleteCourse(req.params.id, req.user!.userId);

            res.json({
                meta: {
                    message: 'Course deleted successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    static async clone(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const course = await CourseAdminService.cloneCourse(req.params.id, req.body as CloneCourseInput, req.user!.userId);

            res.status(201).json({
                data: course,
                meta: {
                    message: 'Course cloned successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    static async createTemplate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const template = await CourseAdminService.createTemplate(
                req.body as CreateCourseTemplateInput,
                req.user!.userId
            );

            res.status(201).json({
                data: template,
                meta: {
                    message: 'Course template created successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    static async listTemplates(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const templates = await CourseAdminService.getTemplates();

            res.json({
                data: templates,
            });
        } catch (error) {
            next(error);
        }
    }

    static async showTemplate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const template = await CourseAdminService.getTemplateById(req.params.id);

            res.json({
                data: template,
            });
        } catch (error) {
            next(error);
        }
    }

    static async deleteTemplate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            await CourseAdminService.deleteTemplate(req.params.id);

            res.json({
                meta: {
                    message: 'Course template deleted successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    static async createFromTemplate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const course = await CourseAdminService.createCourseFromTemplate(
                req.params.templateId,
                req.body as CreateCourseFromTemplateInput
            );

            res.status(201).json({
                data: course,
                meta: {
                    message: 'Course created from template successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    static async archive(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const course = await CourseAdminService.archiveCourse(req.params.id, req.user!.userId);

            res.json({
                data: course,
                meta: {
                    message: 'Course archived successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    static async restore(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const course = await CourseAdminService.restoreCourse(req.params.id, req.user!.userId);

            res.json({
                data: course,
                meta: {
                    message: 'Course restored successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    static async archived(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const result = await CourseAdminService.getArchivedCourses(req.query as unknown as ListCoursesQuery);

            res.json({
                data: result.data,
                meta: result.meta,
            });
        } catch (error) {
            next(error);
        }
    }

    static async permanentDelete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            await CourseAdminService.permanentlyDeleteCourse(req.params.id, req.user!.userId);

            res.json({
                meta: {
                    message: 'Course permanently deleted successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    static async bulkActivate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const result = await CourseAdminService.bulkActivateCourses(
                (req.body as BulkCourseSelectionInput).courseIds,
                req.user!.userId
            );

            res.json({
                data: result,
                meta: {
                    message: 'Courses activated successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    static async bulkDeactivate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const result = await CourseAdminService.bulkDeactivateCourses(
                (req.body as BulkCourseSelectionInput).courseIds,
                req.user!.userId
            );

            res.json({
                data: result,
                meta: {
                    message: 'Courses deactivated successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    static async bulkImport(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const file = req.file;

            if (!file) {
                throw ApiError.badRequest('CSV file is required');
            }

            const result = await CourseAdminService.bulkImportCoursesFromCsv(file.buffer);

            res.status(201).json({
                data: result,
                meta: {
                    message: 'Courses imported successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }
}
