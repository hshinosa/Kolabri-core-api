import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';

const { prismaMock, chatLogMock } = vi.hoisted(() => ({
    prismaMock: {
        course: { findFirst: vi.fn(), findUnique: vi.fn() },
        exportJob: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
        courseStudent: { findMany: vi.fn() },
        group: { findMany: vi.fn() },
    },
    chatLogMock: {
        countDocuments: vi.fn(),
        aggregate: vi.fn(),
    },
}));

vi.mock('@prisma/client', () => ({
    PrismaClient: vi.fn(() => prismaMock),
}));

vi.mock('../models/ChatLog.js', () => ({
    ChatLog: chatLogMock,
}));

import { CourseExportService } from './course-export.service.js';

type ProcessCourseExport = (jobId: string, courseId: string) => Promise<void>;

const originalProcessCourseExport = Reflect.get(CourseExportService, 'processCourseExport') as ProcessCourseExport;
const exportDir = path.join(process.cwd(), 'exports');
const generatedFiles: string[] = [];

async function removeGeneratedFiles() {
    await Promise.all(
        generatedFiles.splice(0).map(async (fileName) => {
            try {
                await fs.unlink(path.join(exportDir, fileName));
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                    throw error;
                }
            }
        })
    );
}

describe('CourseExportService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Reflect.set(CourseExportService, 'processCourseExport', originalProcessCourseExport);
    });

    afterEach(async () => {
        Reflect.set(CourseExportService, 'processCourseExport', originalProcessCourseExport);
        await removeGeneratedFiles();
    });

    it('allows a new export when only failed jobs exist in the last 24 hours', async () => {
        const processMock = vi.fn().mockResolvedValue(undefined);
        Reflect.set(CourseExportService, 'processCourseExport', processMock);

        prismaMock.course.findFirst.mockResolvedValue({ id: 'course-1', ownerId: 'lecturer-1' });
        prismaMock.exportJob.findFirst.mockImplementation(async (args: { where?: { status?: string | { in: string[] } } }) => {
            if (typeof args.where?.status === 'object') {
                return null;
            }
            if (args.where?.status === 'completed') {
                return null;
            }
            return { id: 'failed-export', status: 'failed' };
        });
        prismaMock.exportJob.create.mockResolvedValue({ id: 'new-export', status: 'pending' });

        await expect(CourseExportService.requestCourseExport('lecturer-1', 'course-1')).resolves.toEqual({
            jobId: 'new-export',
            status: 'pending',
        });

        expect(prismaMock.exportJob.create).toHaveBeenCalledWith({
            data: {
                userId: 'lecturer-1',
                courseId: 'course-1',
                exportType: 'COURSE_DATA',
                status: 'pending',
            },
        });
        expect(processMock).toHaveBeenCalledWith('new-export', 'course-1');
    });

    it('completes course export and writes a non-empty zip file', async () => {
        prismaMock.exportJob.update.mockImplementation(async (args: { data: { filePath?: string } }) => {
            if (args.data.filePath) {
                generatedFiles.push(args.data.filePath);
            }
            return { id: 'job-1', ...args.data };
        });
        prismaMock.course.findUnique.mockResolvedValue({
            id: 'course-1',
            code: 'IF101',
            name: 'Intro AI',
            description: 'Basics',
            semester: 'Odd',
            academicYear: '2026/2027',
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            minMembersPerGroup: 2,
            maxMembersPerGroup: 4,
        });
        prismaMock.courseStudent.findMany.mockResolvedValue([
            { user: { id: 'student-1', name: 'Student One', email: 's1@test.dev' }, enrolledAt: new Date('2026-01-02T00:00:00.000Z') },
        ]);
        prismaMock.group.findMany.mockResolvedValue([
            {
                id: 'group-1',
                name: 'Group One',
                chatSpaces: [{ id: 'chat-1', name: 'Week 1', type: 'discussion', createdAt: new Date('2026-01-03T00:00:00.000Z'), closedAt: null }],
                members: [{ userId: 'student-1', user: { id: 'student-1', name: 'Student One' } }],
            },
        ]);
        chatLogMock.countDocuments.mockResolvedValue(3);
        chatLogMock.aggregate.mockResolvedValue([{ _id: 'student-1', messageCount: 3 }]);

        const result = originalProcessCourseExport('job-1', 'course-1');

        await expect(Promise.race([result, new Promise((_, reject) => setTimeout(() => reject(new Error('course export timed out')), 1_000))])).resolves.toBeUndefined();
        expect(prismaMock.exportJob.update).toHaveBeenLastCalledWith({
            where: { id: 'job-1' },
            data: expect.objectContaining({
                status: 'completed',
                filePath: expect.stringMatching(/^course-export-course-1-\d+\.zip$/),
                completedAt: expect.any(Date),
            }),
        });

        const filePath = path.join(exportDir, generatedFiles[0]);
        const stats = await fs.stat(filePath);
        expect(stats.size).toBeGreaterThan(100);
    });
});
