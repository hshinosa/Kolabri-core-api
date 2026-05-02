import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCourseAdminService } = vi.hoisted(() => ({
    mockCourseAdminService: {
        getCourses: vi.fn(),
        getCourseById: vi.fn(),
        createCourse: vi.fn(),
        updateCourse: vi.fn(),
        deleteCourse: vi.fn(),
        cloneCourse: vi.fn(),
        createTemplate: vi.fn(),
        getTemplates: vi.fn(),
        getTemplateById: vi.fn(),
        deleteTemplate: vi.fn(),
        createCourseFromTemplate: vi.fn(),
        archiveCourse: vi.fn(),
        restoreCourse: vi.fn(),
        getArchivedCourses: vi.fn(),
        permanentlyDeleteCourse: vi.fn(),
        bulkActivateCourses: vi.fn(),
        bulkDeactivateCourses: vi.fn(),
        bulkImportCoursesFromCsv: vi.fn(),
    },
}));

vi.mock('../services/course-admin.service.js', () => ({
    CourseAdminService: mockCourseAdminService,
}));

import { CourseAdminController } from './course-admin.controller.js';

function mockReq(overrides: Partial<Request> = {}) {
    return {
        body: {},
        params: {},
        query: {},
        user: {
            userId: 'user-1',
            role: 'admin',
            email: 'admin@example.com',
        },
        ...overrides,
    } as Partial<Request>;
}

function mockRes(): Partial<Response> {
    const res: Partial<Response> & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } = {
        status: vi.fn(),
        json: vi.fn(),
    };
    res.status.mockReturnValue(res as Response);
    res.json.mockReturnValue(res as Response);
    return res;
}

function mockNext(): NextFunction {
    return vi.fn() as unknown as NextFunction;
}

describe('CourseAdminController', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns paginated courses', async () => {
        const result = { data: [{ id: 'course-1' }], meta: { total: 1 } };
        mockCourseAdminService.getCourses.mockResolvedValue(result);
        const req = mockReq({ query: { search: 'AI' } });
        const res = mockRes();
        const next = mockNext();

        await CourseAdminController.index(req as Request, res as Response, next);

        expect(mockCourseAdminService.getCourses).toHaveBeenCalledWith(req.query);
        expect(res.json).toHaveBeenCalledWith({ data: result.data, meta: result.meta });
        expect(next).not.toHaveBeenCalled();
    });

    it('creates a course and returns 201', async () => {
        const course = { id: 'course-1', name: 'Intro AI' };
        mockCourseAdminService.createCourse.mockResolvedValue(course);
        const req = mockReq({ body: { name: 'Intro AI' } });
        const res = mockRes();
        const next = mockNext();

        await CourseAdminController.create(req as Request, res as Response, next);

        expect(mockCourseAdminService.createCourse).toHaveBeenCalledWith(req.body, 'user-1');
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
            data: course,
            meta: { message: 'Course created successfully' },
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('creates a course from a template and returns 201', async () => {
        const course = { id: 'course-2', templateId: 'template-1' };
        mockCourseAdminService.createCourseFromTemplate.mockResolvedValue(course);
        const req = mockReq({ params: { templateId: 'template-1' }, body: { name: 'Cloned Course' } });
        const res = mockRes();
        const next = mockNext();

        await CourseAdminController.createFromTemplate(req as Request, res as Response, next);

        expect(mockCourseAdminService.createCourseFromTemplate).toHaveBeenCalledWith('template-1', req.body);
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
            data: course,
            meta: { message: 'Course created from template successfully' },
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('returns 201 when bulk importing courses from CSV', async () => {
        const file = { buffer: Buffer.from('code,name\nIF101,Intro AI') } as Express.Multer.File;
        const result = { created: 1 };
        mockCourseAdminService.bulkImportCoursesFromCsv.mockResolvedValue(result);
        const req = mockReq({ file });
        const res = mockRes();
        const next = mockNext();

        await CourseAdminController.bulkImport(req as Request, res as Response, next);

        expect(mockCourseAdminService.bulkImportCoursesFromCsv).toHaveBeenCalledWith(file.buffer);
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
            data: result,
            meta: { message: 'Courses imported successfully' },
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('forwards an error when bulk import is called without a CSV file', async () => {
        const req = mockReq({ file: undefined as Request['file'] });
        const res = mockRes();
        const next = mockNext();

        await CourseAdminController.bulkImport(req as Request, res as Response, next);

        expect(mockCourseAdminService.bulkImportCoursesFromCsv).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith(expect.any(Error));
        expect((next as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({
            message: 'CSV file is required',
        });
    });
});
