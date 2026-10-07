import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, fsMock, loggerMock, aiEngineServiceMock } = vi.hoisted(() => ({
    prismaMock: {
        course: { findUnique: vi.fn() },
        courseStudent: { findUnique: vi.fn() },
        knowledgeBase: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), delete: vi.fn(), update: vi.fn() },
    },
    fsMock: { mkdir: vi.fn(), writeFile: vi.fn(), unlink: vi.fn() },
    loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    aiEngineServiceMock: { isAvailable: vi.fn(), ingestDocument: vi.fn(), deleteDocument: vi.fn(), ingestBatch: vi.fn() },
}));

vi.mock('../config/database.js', () => ({
    default: prismaMock,
}));

vi.mock('node:fs/promises', () => ({
    default: fsMock,
    ...fsMock,
}));

vi.mock('../utils/logger.js', () => ({
    logger: loggerMock,
}));

vi.mock('./aiEngine.service.js', () => ({
    aiEngineService: aiEngineServiceMock,
}));

import { KnowledgeBaseService } from './knowledgeBase.service.js';

describe('KnowledgeBaseService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('uploads a pdf file for the course owner and stores the record', async () => {
        prismaMock.course.findUnique.mockResolvedValue({ id: 'course-1', ownerId: 'lecturer-1' });
        prismaMock.knowledgeBase.create.mockResolvedValue({
            id: 'file-1',
            fileName: 'notes.pdf',
            vectorStatus: 'pending',
            uploadedAt: new Date('2026-05-01T00:00:00.000Z'),
        });
        aiEngineServiceMock.isAvailable.mockResolvedValue(false);

        const result = await KnowledgeBaseService.uploadFile(
            'course-1',
            {
                originalname: 'notes.pdf',
                mimetype: 'application/pdf',
                size: 1024,
                // real PDF magic bytes (content sniffing, M6)
                buffer: Buffer.from('%PDF-1.4\n1 0 obj\n'),
            },
            'lecturer-1'
        );

        expect(fsMock.mkdir).toHaveBeenCalled();
        expect(fsMock.writeFile).toHaveBeenCalled();
        expect(prismaMock.knowledgeBase.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    fileName: 'notes.pdf',
                    mimeType: 'application/pdf',
                    courseId: 'course-1',
                    uploadedBy: 'lecturer-1',
                }),
            })
        );
        expect(result).toEqual({
            id: 'file-1',
            fileName: 'notes.pdf',
            status: 'pending',
            uploadedAt: new Date('2026-05-01T00:00:00.000Z'),
        });
    });

    it('rejects non-pdf uploads for single-file upload', async () => {
        prismaMock.course.findUnique.mockResolvedValue({ id: 'course-1', ownerId: 'lecturer-1' });

        await expect(
            KnowledgeBaseService.uploadFile(
                'course-1',
                {
                    originalname: 'notes.txt',
                    mimetype: 'text/plain',
                    size: 128,
                    buffer: Buffer.from('notes'),
                },
                'lecturer-1'
            )
        ).rejects.toMatchObject({
            statusCode: 400,
            message: 'Only PDF files are allowed',
        });
    });

    it('rejects an HTML payload disguised as text/plain (F-05)', async () => {
        prismaMock.course.findUnique.mockResolvedValue({ id: 'course-1', ownerId: 'lecturer-1' });

        await expect(
            KnowledgeBaseService.uploadBatch(
                'course-1',
                [
                    {
                        originalname: 'RACE-UJI-batch.txt',
                        mimetype: 'text/plain',
                        size: 64,
                        buffer: Buffer.from('<html><script>alert(document.cookie)</script></html>'),
                    },
                ],
                'lecturer-1'
            )
        ).rejects.toMatchObject({
            statusCode: 400,
            message: 'No valid files to upload',
        });
    });

    it('rejects a single upload whose bytes are not a PDF (F-05)', async () => {
        prismaMock.course.findUnique.mockResolvedValue({ id: 'course-1', ownerId: 'lecturer-1' });

        await expect(
            KnowledgeBaseService.uploadFile(
                'course-1',
                {
                    originalname: 'xss.pdf',
                    mimetype: 'application/pdf',
                    size: 64,
                    buffer: Buffer.from('<html><script>alert(1)</script></html>'),
                },
                'lecturer-1'
            )
        ).rejects.toMatchObject({
            statusCode: 400,
            message: 'HTML files are not allowed',
        });
    });

    it('returns course files for enrolled students', async () => {
        prismaMock.course.findUnique.mockResolvedValue({ id: 'course-1', ownerId: 'lecturer-1' });
        prismaMock.courseStudent.findUnique.mockResolvedValue({ courseId: 'course-1', userId: 'student-1' });
        prismaMock.knowledgeBase.findMany.mockResolvedValue([{ id: 'file-1', fileName: 'notes.pdf' }]);

        const result = await KnowledgeBaseService.getCourseFiles('course-1', 'student-1', 'student');

        expect(prismaMock.courseStudent.findUnique).toHaveBeenCalledWith({
            where: {
                courseId_userId: {
                    courseId: 'course-1',
                    userId: 'student-1',
                },
            },
        });
        expect(result).toEqual([{ id: 'file-1', fileName: 'notes.pdf' }]);
    });

    it('deletes a file, swallowing vector-store and disk deletion warnings', async () => {
        prismaMock.knowledgeBase.findUnique.mockResolvedValue({
            id: 'file-1',
            filePath: '/tmp/notes.pdf',
            course: { ownerId: 'lecturer-1', id: 'course-1' },
        });
        aiEngineServiceMock.deleteDocument.mockRejectedValue(new Error('vector error'));
        fsMock.unlink.mockRejectedValue(new Error('fs error'));
        prismaMock.knowledgeBase.update.mockResolvedValue({ id: 'file-1' });

        const result = await KnowledgeBaseService.deleteFile('file-1', 'lecturer-1');

        expect(loggerMock.warn).toHaveBeenCalledTimes(2);
        expect(prismaMock.knowledgeBase.update).toHaveBeenCalledWith({ where: { id: 'file-1' }, data: { deletedAt: expect.any(Date) } });
        expect(result).toEqual({ success: true });
    });

    it('uploads a valid batch and reports rejected files', async () => {
        prismaMock.course.findUnique.mockResolvedValue({ id: 'course-1', ownerId: 'lecturer-1' });
        prismaMock.knowledgeBase.create
            .mockResolvedValueOnce({ id: 'kb-1' })
            .mockResolvedValueOnce({ id: 'kb-2' });

        const result = await KnowledgeBaseService.uploadBatch(
            'course-1',
            [
                { originalname: 'notes.pdf', mimetype: 'application/pdf', size: 1024, buffer: Buffer.from('%PDF-1.4\n1 0 obj\n') },
                { originalname: 'diagram.png', mimetype: 'image/png', size: 2048, buffer: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('IHDR')]) },
                { originalname: 'script.exe', mimetype: 'application/x-msdownload', size: 300, buffer: Buffer.from('bad') },
            ],
            'lecturer-1'
        );

        expect(result.uploaded).toHaveLength(2);
        expect(result.rejected).toEqual([{ name: 'script.exe', reason: 'Unsupported file type: application/x-msdownload' }]);
        expect(result.stats).toEqual({ totalUploaded: 2, totalRejected: 1 });
    });
});
