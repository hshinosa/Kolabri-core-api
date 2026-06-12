import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockCourseService,
    mockKnowledgeBaseService,
    mockGroupService,
    mockGoalService,
    mockReadingRecommendationService,
} = vi.hoisted(() => ({
    mockCourseService: {
        createCourse: vi.fn(),
        joinCourse: vi.fn(),
        getMyCourses: vi.fn(),
        getCourseDetails: vi.fn(),
        getCourseStudents: vi.fn(),
    },
    mockKnowledgeBaseService: {
        uploadFile: vi.fn(),
        uploadBatch: vi.fn(),
        getCourseFiles: vi.fn(),
    },
    mockGroupService: {
        getMyGroup: vi.fn(),
    },
    mockGoalService: {
        getMyGoals: vi.fn(),
    },
    mockReadingRecommendationService: {
        generate: vi.fn(),
    },
}));

vi.mock('../services/course.service.js', () => ({
    CourseService: mockCourseService,
}));

vi.mock('../services/knowledgeBase.service.js', () => ({
    KnowledgeBaseService: mockKnowledgeBaseService,
}));

vi.mock('../services/group.service.js', () => ({
    GroupService: mockGroupService,
}));

vi.mock('../services/goal.service.js', () => ({
    GoalService: mockGoalService,
}));

vi.mock('../services/readingRecommendation.service.js', () => ({
    ReadingRecommendationService: mockReadingRecommendationService,
}));

import { CourseController } from './course.controller.js';

function mockReq(overrides: Partial<Request> = {}) {
    return {
        body: {},
        params: {},
        query: {},
        user: {
            userId: 'user-1',
            role: 'lecturer',
            email: 'user@example.com',
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

describe('CourseController', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('creates a course and returns 201 with success message', async () => {
        const course = { id: 'course-1', code: 'IF101' };
        mockCourseService.createCourse.mockResolvedValue(course);
        const req = mockReq({ body: { code: 'IF101', name: 'Intro AI' } });
        const res = mockRes();
        const next = mockNext();

        await CourseController.create(req as Request, res as Response, next);

        expect(mockCourseService.createCourse).toHaveBeenCalledWith(req.body, 'user-1');
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
            data: course,
            meta: { message: 'Course created successfully' },
        });
    });

    it('joins a course and returns enrollment success message', async () => {
        const course = { id: 'course-1', name: 'Intro AI' };
        mockCourseService.joinCourse.mockResolvedValue(course);
        const req = mockReq({ body: { join_code: 'JOIN01' }, user: { userId: 'student-1', role: 'student' } as Request['user'] });
        const res = mockRes();
        const next = mockNext();

        await CourseController.join(req as Request, res as Response, next);

        expect(mockCourseService.joinCourse).toHaveBeenCalledWith(req.body, 'student-1');
        expect(res.json).toHaveBeenCalledWith({
            data: course,
            meta: { message: 'Enrolled successfully' },
        });
    });

    it('returns courses for the authenticated user', async () => {
        const courses = [{ id: 'course-1' }];
        mockCourseService.getMyCourses.mockResolvedValue(courses);
        const req = mockReq({ user: { userId: 'lecturer-1', role: 'lecturer' } as Request['user'] });
        const res = mockRes();
        const next = mockNext();

        await CourseController.index(req as Request, res as Response, next);

        expect(mockCourseService.getMyCourses).toHaveBeenCalledWith('lecturer-1', 'lecturer');
        expect(res.json).toHaveBeenCalledWith({ data: courses });
    });

    it('returns course details for the authenticated user', async () => {
        const course = { id: 'course-1', code: 'IF101' };
        mockCourseService.getCourseDetails.mockResolvedValue(course);
        const req = mockReq({
            params: { id: 'course-1' },
            user: { userId: 'student-1', role: 'student' } as Request['user'],
        });
        const res = mockRes();
        const next = mockNext();

        await CourseController.show(req as Request, res as Response, next);

        expect(mockCourseService.getCourseDetails).toHaveBeenCalledWith('course-1', 'student-1', 'student');
        expect(res.json).toHaveBeenCalledWith({ data: course });
    });

    it('returns enrolled students for a course', async () => {
        const students = [{ id: 'student-1' }];
        mockCourseService.getCourseStudents.mockResolvedValue(students);
        const req = mockReq({ params: { id: 'course-1' }, user: { userId: 'lecturer-1', role: 'lecturer' } as Request['user'] });
        const res = mockRes();
        const next = mockNext();

        await CourseController.getStudents(req as Request, res as Response, next);

        expect(mockCourseService.getCourseStudents).toHaveBeenCalledWith('course-1', 'lecturer-1');
        expect(res.json).toHaveBeenCalledWith({ data: students });
    });

    it('returns 400 when uploadKnowledgeBase is called without a file', async () => {
        const req = mockReq({ params: { id: 'course-1' }, file: undefined as Request['file'] });
        const res = mockRes();
        const next = mockNext();

        await CourseController.uploadKnowledgeBase(req as Request, res as Response, next);

        expect(mockKnowledgeBaseService.uploadFile).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            error: { code: 'NO_FILE', message: 'No file uploaded' },
        });
    });

    it('uploads a knowledge base file and returns 201', async () => {
        const result = { id: 'kb-1', fileName: 'notes.pdf' };
        const file = { originalname: 'notes.pdf' } as Express.Multer.File;
        mockKnowledgeBaseService.uploadFile.mockResolvedValue(result);
        const req = mockReq({
            params: { id: 'course-1' },
            file,
            user: { userId: 'lecturer-1', role: 'lecturer' } as Request['user'],
        });
        const res = mockRes();
        const next = mockNext();

        await CourseController.uploadKnowledgeBase(req as Request, res as Response, next);

        expect(mockKnowledgeBaseService.uploadFile).toHaveBeenCalledWith('course-1', file, 'lecturer-1');
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
            data: result,
            meta: { message: 'File uploaded successfully' },
        });
    });

    it('returns 400 when uploadKnowledgeBaseBatch is called without any files', async () => {
        const req = mockReq({ params: { id: 'course-1' }, files: [] as Request['files'] });
        const res = mockRes();
        const next = mockNext();

        await CourseController.uploadKnowledgeBaseBatch(req as Request, res as Response, next);

        expect(mockKnowledgeBaseService.uploadBatch).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
            error: { code: 'NO_FILES', message: 'No files uploaded' },
        });
    });

    it('uploads batch knowledge base files from object-shaped multer input with parsed options', async () => {
        const fileA = { originalname: 'a.pdf' } as Express.Multer.File;
        const fileB = { originalname: 'b.pdf' } as Express.Multer.File;
        const result = { stats: { totalUploaded: 2 } };
        mockKnowledgeBaseService.uploadBatch.mockResolvedValue(result);
        const req = mockReq({
            params: { id: 'course-1' },
            body: { extract_images: 'false', perform_ocr: 'true' },
            files: { docs: [fileA, fileB] } as Request['files'],
            user: { userId: 'lecturer-1', role: 'lecturer' } as Request['user'],
        });
        const res = mockRes();
        const next = mockNext();

        await CourseController.uploadKnowledgeBaseBatch(req as Request, res as Response, next);

        expect(mockKnowledgeBaseService.uploadBatch).toHaveBeenCalledWith(
            'course-1',
            [fileA, fileB],
            'lecturer-1',
            { extractImages: false, performOcr: true }
        );
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
            data: result,
            meta: { message: 'Successfully uploaded 2 files' },
        });
    });

    it('returns knowledge base files for a course', async () => {
        const files = [{ id: 'kb-1' }];
        mockKnowledgeBaseService.getCourseFiles.mockResolvedValue(files);
        const req = mockReq({
            params: { id: 'course-1' },
            user: { userId: 'student-1', role: 'student' } as Request['user'],
        });
        const res = mockRes();
        const next = mockNext();

        await CourseController.getKnowledgeBase(req as Request, res as Response, next);

        expect(mockKnowledgeBaseService.getCourseFiles).toHaveBeenCalledWith('course-1', 'student-1', 'student');
        expect(res.json).toHaveBeenCalledWith({ data: files });
    });

    it('returns reading recommendations for a course', async () => {
        mockReadingRecommendationService.generate.mockResolvedValue({
            recommendations: [{ sourceTitle: 'week-3-transformer.pdf' }],
            fallback: null,
        });
        const req = mockReq({
            params: { id: 'course-1' },
            body: { topic: 'transformer', source_scope: 'course_knowledge_base', limit: 3 },
            user: { userId: 'student-1', role: 'student' } as Request['user'],
        });
        const res = mockRes();
        const next = mockNext();

        await CourseController.getReadingRecommendations(req as Request, res as Response, next);

        expect(mockReadingRecommendationService.generate).toHaveBeenCalledWith(
            'course-1',
            req.body,
            'student-1',
            'student'
        );
        expect(res.json).toHaveBeenCalledWith({
            data: {
                recommendations: [{ sourceTitle: 'week-3-transformer.pdf' }],
                fallback: null,
            },
        });
    });

    it('returns enrolled courses using student role override', async () => {
        const courses = [{ id: 'course-1' }];
        mockCourseService.getMyCourses.mockResolvedValue(courses);
        const req = mockReq({ user: { userId: 'student-1', role: 'lecturer' } as Request['user'] });
        const res = mockRes();
        const next = mockNext();

        await CourseController.enrolled(req as Request, res as Response, next);

        expect(mockCourseService.getMyCourses).toHaveBeenCalledWith('student-1', 'student');
        expect(res.json).toHaveBeenCalledWith({ data: courses });
    });

    it('returns the current user group for a course', async () => {
        const group = { id: 'group-1', name: 'Alpha' };
        mockGroupService.getMyGroup.mockResolvedValue(group);
        const req = mockReq({ params: { id: 'course-1' }, user: { userId: 'student-1', role: 'student' } as Request['user'] });
        const res = mockRes();
        const next = mockNext();

        await CourseController.getMyGroup(req as Request, res as Response, next);

        expect(mockGroupService.getMyGroup).toHaveBeenCalledWith('course-1', 'student-1');
        expect(res.json).toHaveBeenCalledWith({ data: group });
    });

    it('returns null goal when the student has no group in the course', async () => {
        mockGroupService.getMyGroup.mockResolvedValue(null);
        const req = mockReq({ params: { id: 'course-1' }, user: { userId: 'student-1', role: 'student' } as Request['user'] });
        const res = mockRes();
        const next = mockNext();

        await CourseController.getMyGoal(req as Request, res as Response, next);

        expect(mockGoalService.getMyGoals).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith({ data: null });
    });

    it('returns the goal belonging to the requested course', async () => {
        const matchingGoal = {
            id: 'goal-1',
            chatSpace: { group: { course: { id: 'course-1' } } },
        };
        mockGroupService.getMyGroup.mockResolvedValue({ id: 'group-1' });
        mockGoalService.getMyGoals.mockResolvedValue([
            { id: 'goal-2', chatSpace: { group: { course: { id: 'course-2' } } } },
            matchingGoal,
        ]);
        const req = mockReq({ params: { id: 'course-1' }, user: { userId: 'student-1', role: 'student' } as Request['user'] });
        const res = mockRes();
        const next = mockNext();

        await CourseController.getMyGoal(req as Request, res as Response, next);

        expect(mockGroupService.getMyGroup).toHaveBeenCalledWith('course-1', 'student-1');
        expect(mockGoalService.getMyGoals).toHaveBeenCalledWith('student-1');
        expect(res.json).toHaveBeenCalledWith({ data: matchingGoal });
    });

    it('forwards service errors to next from create', async () => {
        const error = new Error('create failed');
        mockCourseService.createCourse.mockRejectedValue(error);
        const req = mockReq();
        const res = mockRes();
        const next = mockNext();

        await CourseController.create(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith(error);
    });
});
