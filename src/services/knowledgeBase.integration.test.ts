import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, aiEngineServiceMock, fsMock } = vi.hoisted(() => ({
    prismaMock: {
        course: { findUnique: vi.fn() },
        knowledgeBase: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
        courseStudent: { findUnique: vi.fn() },
    },
    aiEngineServiceMock: {
        isAvailable: vi.fn(),
        ingestDocument: vi.fn(),
        ingestBatch: vi.fn(),
        deleteDocument: vi.fn(),
    },
    fsMock: {
        readFile: vi.fn(),
        writeFile: vi.fn().mockResolvedValue(undefined),
        mkdir: vi.fn().mockResolvedValue(undefined),
        unlink: vi.fn().mockResolvedValue(undefined),
    },
}));

vi.mock('../config/database.js', () => ({ default: prismaMock }));
vi.mock('./aiEngine.service.js', () => ({ aiEngineService: aiEngineServiceMock }));
vi.mock('node:fs/promises', () => ({ default: fsMock }));
vi.mock('../utils/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { KnowledgeBaseService } from './knowledgeBase.service.js';

const NOW = new Date('2026-06-01T00:00:00.000Z');

function makePdfFile(overrides: Record<string, unknown> = {}) {
    return {
        originalname: 'materi.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('fake-pdf-content'),
        ...overrides,
    };
}

describe('KnowledgeBaseService Integration — Flow 4: RAG Pipeline', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('uploads a single PDF and creates a pending KB record', async () => {
        prismaMock.course.findUnique.mockResolvedValue({ id: 'course-1', ownerId: 'lecturer-1' });
        prismaMock.knowledgeBase.create.mockResolvedValue({
            id: 'kb-1', fileName: 'materi.pdf', vectorStatus: 'pending', uploadedAt: NOW,
        });
        aiEngineServiceMock.isAvailable.mockResolvedValue(false);

        const result = await KnowledgeBaseService.uploadFile('course-1', makePdfFile() as any, 'lecturer-1');

        expect(result.status).toBe('pending');
        expect(prismaMock.knowledgeBase.create).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ vectorStatus: 'pending', courseId: 'course-1' }) }),
        );
    });

    it('rejects non-PDF files for single upload', async () => {
        prismaMock.course.findUnique.mockResolvedValue({ id: 'course-1', ownerId: 'lecturer-1' });

        await expect(
            KnowledgeBaseService.uploadFile('course-1', makePdfFile({ mimetype: 'image/png' }) as any, 'lecturer-1'),
        ).rejects.toThrow('Only PDF files are allowed');
    });

    it('rejects oversized files', async () => {
        prismaMock.course.findUnique.mockResolvedValue({ id: 'course-1', ownerId: 'lecturer-1' });

        await expect(
            KnowledgeBaseService.uploadFile('course-1', makePdfFile({ size: 20 * 1024 * 1024 }) as any, 'lecturer-1'),
        ).rejects.toThrow(/File size must be less than/);
    });

    it('rejects upload when user does not own the course', async () => {
        prismaMock.course.findUnique.mockResolvedValue({ id: 'course-1', ownerId: 'other-lecturer' });

        await expect(
            KnowledgeBaseService.uploadFile('course-1', makePdfFile() as any, 'lecturer-1'),
        ).rejects.toThrow('You do not own this course');
    });

    it('rejects upload when course not found', async () => {
        prismaMock.course.findUnique.mockResolvedValue(null);

        await expect(
            KnowledgeBaseService.uploadFile('nonexistent', makePdfFile() as any, 'lecturer-1'),
        ).rejects.toThrow('Course not found');
    });

    it('batch upload separates valid and invalid files', async () => {
        prismaMock.course.findUnique.mockResolvedValue({ id: 'course-1', ownerId: 'lecturer-1' });
        prismaMock.knowledgeBase.create.mockResolvedValue({ id: 'kb-1' });
        aiEngineServiceMock.isAvailable.mockResolvedValue(false);

        const files = [
            makePdfFile({ originalname: 'doc1.pdf' }),
            makePdfFile({ originalname: 'doc2.pdf' }),
            makePdfFile({ originalname: 'bad.exe', mimetype: 'application/x-msdownload' }),
        ];

        const result = await KnowledgeBaseService.uploadBatch('course-1', files as any, 'lecturer-1');

        expect(result.uploaded).toHaveLength(2);
        expect(result.rejected).toHaveLength(1);
        expect(result.rejected[0].name).toBe('bad.exe');
    });

    it('batch upload rejects when all files are invalid', async () => {
        prismaMock.course.findUnique.mockResolvedValue({ id: 'course-1', ownerId: 'lecturer-1' });

        const files = [
            makePdfFile({ originalname: 'bad.exe', mimetype: 'application/x-msdownload' }),
        ];

        await expect(
            KnowledgeBaseService.uploadBatch('course-1', files as any, 'lecturer-1'),
        ).rejects.toThrow('No valid files to upload');
    });

    it('deletes file from vector store, disk, and database', async () => {
        prismaMock.knowledgeBase.findUnique.mockResolvedValue({
            id: 'kb-1', filePath: '/uploads/course-1/materi.pdf',
            course: { ownerId: 'lecturer-1', id: 'course-1' },
        });
        aiEngineServiceMock.deleteDocument.mockResolvedValue(true);
        prismaMock.knowledgeBase.update.mockResolvedValue({});

        const result = await KnowledgeBaseService.deleteFile('kb-1', 'lecturer-1');

        expect(result).toEqual({ success: true });
        expect(aiEngineServiceMock.deleteDocument).toHaveBeenCalledWith('kb-1', 'course_course-1');
        expect(fsMock.unlink).toHaveBeenCalledWith('/uploads/course-1/materi.pdf');
        expect(prismaMock.knowledgeBase.update).toHaveBeenCalledWith({ where: { id: 'kb-1' }, data: { deletedAt: expect.any(Date) } });
    });

    it('rejects delete when user does not own the course', async () => {
        prismaMock.knowledgeBase.findUnique.mockResolvedValue({
            id: 'kb-1', filePath: '/uploads/course-1/materi.pdf',
            course: { ownerId: 'other-lecturer', id: 'course-1' },
        });

        await expect(KnowledgeBaseService.deleteFile('kb-1', 'lecturer-1'))
            .rejects.toThrow('You do not own this course');
    });

    it('rejects delete when file not found', async () => {
        prismaMock.knowledgeBase.findUnique.mockResolvedValue(null);

        await expect(KnowledgeBaseService.deleteFile('nonexistent', 'lecturer-1'))
            .rejects.toThrow('File not found');
    });

    it('lists course files for lecturer (owner)', async () => {
        prismaMock.course.findUnique.mockResolvedValue({ id: 'course-1', ownerId: 'lecturer-1' });
        prismaMock.knowledgeBase.findMany.mockResolvedValue([
            { id: 'kb-1', fileName: 'materi.pdf', fileSize: 1024, mimeType: 'application/pdf', vectorStatus: 'ready', uploadedAt: NOW, processedAt: NOW, errorMessage: null },
        ]);

        const files = await KnowledgeBaseService.getCourseFiles('course-1', 'lecturer-1', 'lecturer');

        expect(files).toHaveLength(1);
        expect(files[0].vectorStatus).toBe('ready');
    });

    it('lists course files for enrolled student', async () => {
        prismaMock.course.findUnique.mockResolvedValue({ id: 'course-1', ownerId: 'lecturer-1' });
        prismaMock.courseStudent.findUnique.mockResolvedValue({ courseId: 'course-1', userId: 'student-1' });
        prismaMock.knowledgeBase.findMany.mockResolvedValue([]);

        const files = await KnowledgeBaseService.getCourseFiles('course-1', 'student-1', 'student');
        expect(files).toEqual([]);
    });
});
