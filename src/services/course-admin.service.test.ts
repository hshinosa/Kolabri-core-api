import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, auditLogServiceMock, broadcastAdminEventMock, generateJoinCodeMock } = vi.hoisted(() => ({
    prismaMock: {
        course: {
            findMany: vi.fn(),
            count: vi.fn(),
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            createMany: vi.fn(),
        },
        group: { count: vi.fn() },
        user: { findUnique: vi.fn(), findMany: vi.fn() },
        courseTemplate: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn(), delete: vi.fn() },
        $transaction: vi.fn(),
    },
    auditLogServiceMock: { logAction: vi.fn() },
    broadcastAdminEventMock: vi.fn(),
    generateJoinCodeMock: vi.fn(),
}));

vi.mock('../config/database.js', () => ({
    default: prismaMock,
}));

vi.mock('./audit-log.service.js', () => ({
    AuditLogService: auditLogServiceMock,
}));

vi.mock('../websocket/server.js', () => ({
    broadcastAdminEvent: broadcastAdminEventMock,
}));

vi.mock('../utils/helpers.js', () => ({
    generateJoinCode: generateJoinCodeMock,
}));

import { CourseAdminService } from './course-admin.service.js';

describe('CourseAdminService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        auditLogServiceMock.logAction.mockResolvedValue({ user: { id: 'admin-1', name: 'Admin' } });
        generateJoinCodeMock.mockReturnValue('JOIN123');
    });

    it('returns paginated active courses', async () => {
        prismaMock.course.findMany.mockResolvedValue([{ id: 'course-1', code: 'IF101' }]);
        prismaMock.course.count.mockResolvedValue(1);

        const result = await CourseAdminService.getCourses({ page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' });

        expect(prismaMock.course.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { isArchived: false },
                skip: 0,
                take: 10,
            })
        );
        expect(result).toEqual({
            data: [{ id: 'course-1', code: 'IF101' }],
            meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
        });
    });

    it('creates a course after validating owner and unique code', async () => {
        prismaMock.course.findUnique
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(null);
        prismaMock.user.findUnique.mockResolvedValue({ id: 'lecturer-1', role: 'lecturer', isActive: true });
        prismaMock.course.create.mockResolvedValue({ id: 'course-1', code: 'IF101', joinCode: 'JOIN123' });

        const result = await CourseAdminService.createCourse(
            { code: 'IF101', name: 'Intro AI', description: 'Basics', ownerId: 'lecturer-1' },
            'admin-1'
        );

        expect(prismaMock.course.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ joinCode: 'JOIN123', ownerId: 'lecturer-1' }),
            })
        );
        expect(auditLogServiceMock.logAction).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'CREATE', entityType: 'Course', entityId: 'course-1', userId: 'admin-1' })
        );
        expect(result).toEqual({ id: 'course-1', code: 'IF101', joinCode: 'JOIN123' });
    });

    it('rejects deleting a course that still has active groups', async () => {
        prismaMock.course.findUnique.mockResolvedValue({
            id: 'course-1',
            isArchived: false,
            _count: { groups: 2, students: 12 },
        });
        prismaMock.group.count.mockResolvedValue(1);

        await expect(CourseAdminService.deleteCourse('course-1', 'admin-1')).rejects.toMatchObject({
            statusCode: 400,
            message: 'Cannot delete course with active groups',
            details: { activeGroupsCount: 1, totalGroupsCount: 2, studentsCount: 12 },
        });
    });

    it('archives a course when there are no active chat spaces', async () => {
        prismaMock.course.findUnique.mockResolvedValue({
            id: 'course-1',
            isArchived: false,
            _count: { groups: 2 },
            groups: [{ id: 'group-1', chatSpaces: [] }, { id: 'group-2', chatSpaces: [] }],
        });
        prismaMock.user.findUnique.mockResolvedValue({ id: 'admin-1', role: 'admin', isActive: true });
        prismaMock.course.update.mockResolvedValue({ id: 'course-1', isArchived: true });

        const result = await CourseAdminService.archiveCourse('course-1', 'admin-1');

        expect(prismaMock.course.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'course-1' },
                data: expect.objectContaining({ isArchived: true, archivedById: 'admin-1' }),
            })
        );
        expect(result).toEqual({ id: 'course-1', isArchived: true });
    });

    it('imports courses from csv after validating owners and generating join codes', async () => {
        const csv = Buffer.from('code,name,owner_id\nif101,Intro AI,lecturer-1\nif102,Data Science,lecturer-2\n');
        prismaMock.course.findMany.mockResolvedValue([]);
        prismaMock.user.findMany.mockResolvedValue([
            { id: 'lecturer-1', role: 'lecturer', isActive: true },
            { id: 'lecturer-2', role: 'lecturer', isActive: true },
        ]);
        prismaMock.course.findUnique.mockResolvedValue(null);
        generateJoinCodeMock.mockReturnValueOnce('JOIN101').mockReturnValueOnce('JOIN102');
        prismaMock.course.createMany.mockResolvedValue({ count: 2 });

        const result = await CourseAdminService.bulkImportCoursesFromCsv(csv);

        expect(prismaMock.course.createMany).toHaveBeenCalledWith({
            data: [
                { code: 'IF101', name: 'Intro AI', description: null, ownerId: 'lecturer-1', joinCode: 'JOIN101', isActive: true },
                { code: 'IF102', name: 'Data Science', description: null, ownerId: 'lecturer-2', joinCode: 'JOIN102', isActive: true },
            ],
        });
        expect(result).toEqual({ createdCount: 2 });
    });
});
