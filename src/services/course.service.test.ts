import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, cacheMock, generateJoinCodeMock } = vi.hoisted(() => ({
    prismaMock: {
        course: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
        courseStudent: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    },
    cacheMock: { get: vi.fn(), set: vi.fn(), invalidatePattern: vi.fn() },
    generateJoinCodeMock: vi.fn(),
}));

vi.mock('../config/database.js', () => ({
    default: prismaMock,
}));

vi.mock('../utils/helpers.js', () => ({
    generateJoinCode: generateJoinCodeMock,
}));

vi.mock('../utils/cache.js', () => ({
    cache: cacheMock,
}));

import { CourseService } from './course.service.js';

describe('CourseService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('creates a course with a unique join code and invalidates cached course lists', async () => {
        prismaMock.course.findUnique
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ id: 'existing-join-code' })
            .mockResolvedValueOnce(null);
        generateJoinCodeMock.mockReturnValueOnce('ABC123').mockReturnValueOnce('XYZ789');
        prismaMock.course.create.mockResolvedValue({
            id: 'course-1',
            code: 'IF101',
            joinCode: 'XYZ789',
        });

        const result = await CourseService.createCourse(
            { code: 'IF101', name: 'Intro AI', description: 'Basics' },
            'lecturer-1'
        );

        expect(prismaMock.course.create).toHaveBeenCalledWith({
            data: {
                code: 'IF101',
                name: 'Intro AI',
                description: 'Basics',
                joinCode: 'XYZ789',
                ownerId: 'lecturer-1',
            },
            include: {
                owner: {
                    select: { id: true, name: true, email: true },
                },
            },
        });
        expect(cacheMock.invalidatePattern).toHaveBeenCalledWith('courses:lecturer-1:');
        expect(result).toEqual({ id: 'course-1', code: 'IF101', joinCode: 'XYZ789' });
    });

    it('rejects duplicate course codes', async () => {
        prismaMock.course.findUnique.mockResolvedValue({ id: 'course-1' });

        await expect(
            CourseService.createCourse({ code: 'IF101', name: 'Intro AI' }, 'lecturer-1')
        ).rejects.toMatchObject({
            statusCode: 409,
            message: 'Course code already exists',
        });
    });

    it('fails when a unique join code cannot be generated after max attempts', async () => {
        prismaMock.course.findUnique.mockResolvedValueOnce(null).mockResolvedValue({ id: 'collision' });
        generateJoinCodeMock.mockReturnValue('SAME01');

        await expect(
            CourseService.createCourse({ code: 'IF101', name: 'Intro AI' }, 'lecturer-1')
        ).rejects.toMatchObject({
            statusCode: 500,
            message: 'Failed to generate unique join code',
        });
    });

    it('joins an active course when the student is not yet enrolled', async () => {
        prismaMock.course.findFirst.mockResolvedValue({
            id: 'course-1',
            code: 'IF101',
            name: 'Intro AI',
            description: 'Basics',
            isArchived: false,
            isActive: true,
        });
        prismaMock.courseStudent.findUnique.mockResolvedValue(null);

        const result = await CourseService.joinCourse({ join_code: 'JOIN01' }, 'student-1');

        expect(prismaMock.course.findFirst).toHaveBeenCalledWith({
            where: { joinCode: 'JOIN01', deletedAt: null },
        });
        expect(prismaMock.courseStudent.create).toHaveBeenCalledWith({
            data: {
                courseId: 'course-1',
                userId: 'student-1',
            },
        });
        expect(result).toEqual({
            id: 'course-1',
            code: 'IF101',
            name: 'Intro AI',
            description: 'Basics',
        });
    });

    it('rejects archived courses when joining', async () => {
        prismaMock.course.findFirst.mockResolvedValue({ isArchived: true, isActive: true });

        await expect(CourseService.joinCourse({ join_code: 'JOIN01' }, 'student-1')).rejects.toMatchObject({
            statusCode: 403,
            message: 'This course is archived',
        });
    });

    it('rejects inactive courses when joining', async () => {
        prismaMock.course.findFirst.mockResolvedValue({ isArchived: false, isActive: false });

        await expect(CourseService.joinCourse({ join_code: 'JOIN01' }, 'student-1')).rejects.toMatchObject({
            statusCode: 403,
            message: 'This course is no longer active',
        });
    });

    it('rejects duplicate enrollments when joining a course', async () => {
        prismaMock.course.findFirst.mockResolvedValue({
            id: 'course-1',
            isArchived: false,
            isActive: true,
        });
        prismaMock.courseStudent.findUnique.mockResolvedValue({ id: 'enrollment-1' });

        await expect(CourseService.joinCourse({ join_code: 'JOIN01' }, 'student-1')).rejects.toMatchObject({
            statusCode: 409,
            message: 'Already enrolled in this course',
        });
    });

    it('rejects soft-deleted courses (findFirst returns null when deletedAt is set)', async () => {
        prismaMock.course.findFirst.mockResolvedValue(null);

        await expect(CourseService.joinCourse({ join_code: 'JOIN01' }, 'student-1')).rejects.toMatchObject({
            statusCode: 404,
            message: 'Invalid join code',
        });
    });

    it('returns cached courses without querying prisma again', async () => {
        cacheMock.get.mockReturnValue([{ id: 'cached-course' }]);

        const result = await CourseService.getMyCourses('user-1', 'lecturer');

        expect(prismaMock.course.findMany).not.toHaveBeenCalled();
        expect(result).toEqual([{ id: 'cached-course' }]);
    });

    it('maps lecturer courses and caches the result', async () => {
        cacheMock.get.mockReturnValue(null);
        prismaMock.course.findMany.mockResolvedValue([
            {
                id: 'course-1',
                code: 'IF101',
                name: 'Intro AI',
                description: 'Basics',
                joinCode: 'JOIN01',
                createdAt: new Date('2026-05-01T00:00:00.000Z'),
                _count: { students: 10, groups: 3 },
            },
        ]);

        const result = await CourseService.getMyCourses('lecturer-1', 'lecturer');

        expect(result).toEqual([
            {
                id: 'course-1',
                code: 'IF101',
                name: 'Intro AI',
                description: 'Basics',
                joinCode: 'JOIN01',
                studentsCount: 10,
                groupsCount: 3,
                createdAt: new Date('2026-05-01T00:00:00.000Z'),
            },
        ]);
        expect(cacheMock.set).toHaveBeenCalledWith('courses:lecturer-1:lecturer', result, 180000);
    });

    it('filters archived student courses and maps owner data', async () => {
        cacheMock.get.mockReturnValue(null);
        prismaMock.courseStudent.findMany.mockResolvedValue([
            {
                enrolledAt: new Date('2026-05-01T00:00:00.000Z'),
                course: {
                    id: 'course-1',
                    code: 'IF101',
                    name: 'Intro AI',
                    description: 'Basics',
                    isArchived: false,
                    owner: { id: 'lecturer-1', name: 'Dr. AI' },
                    _count: { students: 10 },
                },
            },
            {
                enrolledAt: new Date('2026-05-02T00:00:00.000Z'),
                course: {
                    id: 'course-2',
                    code: 'IF102',
                    name: 'Archived',
                    description: 'Skip',
                    isArchived: true,
                    owner: { id: 'lecturer-2', name: 'Dr. Skip' },
                    _count: { students: 20 },
                },
            },
        ]);

        const result = await CourseService.getMyCourses('student-1', 'student');

        expect(result).toEqual([
            {
                id: 'course-1',
                code: 'IF101',
                name: 'Intro AI',
                description: 'Basics',
                ownerName: 'Dr. AI',
                owner: { id: 'lecturer-1', name: 'Dr. AI' },
                studentsCount: 10,
                enrolledAt: new Date('2026-05-01T00:00:00.000Z'),
            },
        ]);
    });

    it('returns lecturer course details with join code and aggregated group goals', async () => {
        prismaMock.course.findUnique.mockResolvedValue({
            id: 'course-1',
            code: 'IF101',
            name: 'Intro AI',
            description: 'Basics',
            joinCode: 'JOIN01',
            ownerId: 'lecturer-1',
            isArchived: false,
            createdAt: new Date('2026-05-01T00:00:00.000Z'),
            owner: { id: 'lecturer-1', name: 'Dr. AI', email: 'ai@example.com' },
            groups: [
                {
                    id: 'group-1',
                    name: 'Group 1',
                    members: [{ user: { id: 'student-1', name: 'Student', email: 's@example.com' } }],
                    chatSpaces: [{ _count: { goals: 2 } }, { _count: { goals: 1 } }],
                    _count: { members: 1, chatSpaces: 2 },
                },
            ],
            knowledgeBases: [
                {
                    id: 'kb-1',
                    fileName: 'notes.pdf',
                    fileSize: 100,
                    mimeType: 'application/pdf',
                    vectorStatus: 'processed',
                    errorMessage: null,
                    uploadedAt: new Date('2026-05-01T00:00:00.000Z'),
                    processedAt: new Date('2026-05-01T01:00:00.000Z'),
                },
            ],
            _count: { students: 10, groups: 1 },
        });

        const result = await CourseService.getCourseDetails('course-1', 'lecturer-1', 'lecturer');

        expect(result).toEqual({
            id: 'course-1',
            code: 'IF101',
            name: 'Intro AI',
            description: 'Basics',
            join_code: 'JOIN01',
            owner: { id: 'lecturer-1', name: 'Dr. AI', email: 'ai@example.com' },
            groups: [
                {
                    id: 'group-1',
                    name: 'Group 1',
                    members: [{ id: 'student-1', name: 'Student', email: 's@example.com' }],
                    goalsCount: 3,
                    chatSpacesCount: 2,
                },
            ],
            knowledge_base: [
                {
                    id: 'kb-1',
                    file_name: 'notes.pdf',
                    file_size: 100,
                    file_type: 'application/pdf',
                    vector_status: 'processed',
                    uploaded_at: new Date('2026-05-01T00:00:00.000Z'),
                    processed_at: new Date('2026-05-01T01:00:00.000Z'),
                    error_message: null,
                },
            ],
            students_count: 10,
            groups_count: 1,
            createdAt: new Date('2026-05-01T00:00:00.000Z'),
        });
    });

    it('hides join code from students in course details', async () => {
        prismaMock.course.findUnique.mockResolvedValue({
            id: 'course-1',
            code: 'IF101',
            name: 'Intro AI',
            description: 'Basics',
            joinCode: 'JOIN01',
            ownerId: 'lecturer-1',
            isArchived: false,
            createdAt: new Date('2026-05-01T00:00:00.000Z'),
            owner: { id: 'lecturer-1', name: 'Dr. AI', email: 'ai@example.com' },
            groups: [],
            knowledgeBases: [],
            _count: { students: 10, groups: 0 },
        });
        prismaMock.courseStudent.findUnique.mockResolvedValue({ id: 'enrollment-1' });

        const result = await CourseService.getCourseDetails('course-1', 'student-1', 'student');

        expect(result.join_code).toBeUndefined();
    });

    it('returns course students for owners and enrolled students', async () => {
        prismaMock.course.findUnique.mockResolvedValue({ id: 'course-1', ownerId: 'lecturer-1' });
        prismaMock.courseStudent.findUnique.mockResolvedValue({ id: 'enrollment-1' });
        prismaMock.courseStudent.findMany.mockResolvedValue([
            {
                user: { id: 'student-1', name: 'Student One', email: 's1@example.com' },
                enrolledAt: new Date('2026-05-01T00:00:00.000Z'),
            },
        ]);

        const result = await CourseService.getCourseStudents('course-1', 'student-1');

        expect(result).toEqual([
            {
                id: 'student-1',
                name: 'Student One',
                email: 's1@example.com',
                enrolledAt: new Date('2026-05-01T00:00:00.000Z'),
            },
        ]);
    });

    it('rejects course student access for unrelated users', async () => {
        prismaMock.course.findUnique.mockResolvedValue({ id: 'course-1', ownerId: 'lecturer-1' });
        prismaMock.courseStudent.findUnique.mockResolvedValue(null);

        await expect(CourseService.getCourseStudents('course-1', 'outsider-1')).rejects.toMatchObject({
            statusCode: 403,
            message: 'You must be the course owner or an enrolled student to view students',
        });
    });
});
