import path from 'node:path';
import fs from 'node:fs/promises';
import prisma from '../config/database.js';
import { ApiError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import { aiEngineService } from './aiEngine.service.js';

export type QueueCourseMaterialInput = {
    courseId: string;
    courseMaterialId: string;
    filePath: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    uploadedBy: string;
    weekId?: string | null;
    weekIndex?: number | null;
    extractImages?: boolean;
    performOcr?: boolean;
};

export type LinkCourseMaterialInput = QueueCourseMaterialInput & {
    weekId: string;
    weekIndex: number;
};

/**
 * Link or update KnowledgeBase row for a Laravel course material assigned to a week.
 * Re-ingests vectors when file path changes or KB was missing.
 */
export class CourseMaterialKbService {
    static async queuePoolMaterial(input: QueueCourseMaterialInput) {
        return CourseMaterialKbService.upsertAndIngest(input);
    }

    static async linkCourseMaterial(input: LinkCourseMaterialInput) {
        return CourseMaterialKbService.upsertAndIngest(input);
    }

    static async softDeleteForCourseMaterial(courseId: string, courseMaterialId: string) {
        const rows = await prisma.knowledgeBase.findMany({
            where: { courseId, courseMaterialId, deletedAt: null },
            select: { id: true },
        });

        // Remove vectors too: soft-deleting the row alone leaves orphan chunks in
        // Qdrant that still surface as citations for material the lecturer deleted.
        for (const row of rows) {
            try {
                await aiEngineService.deleteDocument(row.id, `course_${courseId}`);
            } catch (error) {
                logger.warn('Failed to delete document from vector store', {
                    knowledgeBaseId: row.id,
                    courseId,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }

        await prisma.knowledgeBase.updateMany({
            where: { courseId, courseMaterialId, deletedAt: null },
            data: { deletedAt: new Date(), courseMaterialId: null },
        });
    }

    private static async upsertAndIngest(input: QueueCourseMaterialInput) {
        const {
            courseId,
            courseMaterialId,
            filePath,
            fileName,
            mimeType,
            fileSize,
            uploadedBy,
            weekId = null,
            weekIndex = null,
            extractImages,
            performOcr,
        } = input;

        const course = await prisma.course.findUnique({ where: { id: courseId } });
        if (!course) {
            throw ApiError.notFound('Course not found');
        }

        const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);

        let kb = await prisma.knowledgeBase.findFirst({
            where: {
                courseId,
                courseMaterialId,
                deletedAt: null,
            },
        });

        const weekChanged =
            kb &&
            (kb.weekId !== weekId || kb.weekIndex !== weekIndex);

        if (!kb) {
            kb = await prisma.knowledgeBase.create({
                data: {
                    fileName,
                    filePath: absolutePath,
                    fileSize,
                    mimeType,
                    vectorStatus: 'pending',
                    courseId,
                    uploadedBy,
                    weekId,
                    weekIndex,
                    courseMaterialId,
                },
            });
        } else {
            const pathChanged = kb.filePath !== absolutePath;
            kb = await prisma.knowledgeBase.update({
                where: { id: kb.id },
                data: {
                    fileName,
                    filePath: absolutePath,
                    fileSize,
                    mimeType,
                    weekId,
                    weekIndex,
                    courseMaterialId,
                    ...(pathChanged || weekChanged
                        ? { vectorStatus: 'pending', processedAt: null, errorMessage: null }
                        : {}),
                },
            });
        }

        try {
            await fs.access(absolutePath);
        } catch {
            logger.warn('Course material file missing for KB link', { courseMaterialId, absolutePath });
            await prisma.knowledgeBase.update({
                where: { id: kb.id },
                data: { vectorStatus: 'failed', errorMessage: 'Source file not found on disk' },
            });
            return { knowledgeBaseId: kb.id, ingestTriggered: false };
        }

        if (kb.vectorStatus === 'ready' && kb.processedAt && !weekChanged && kb.filePath === absolutePath) {
            return { knowledgeBaseId: kb.id, ingestTriggered: false, alreadyReady: true };
        }

        await prisma.knowledgeBase.update({
            where: { id: kb.id },
            data: { vectorStatus: 'processing' },
        });

        const extraMetadata: Record<string, string | number> = {
            course_material_id: courseMaterialId,
        };
        if (weekIndex != null) {
            extraMetadata.week_index = weekIndex;
        }
        if (weekId) {
            extraMetadata.week_id = weekId;
        }
        if (input.extractImages) {
            extraMetadata.extract_images = 1;
        }
        if (input.performOcr) {
            extraMetadata.perform_ocr = 1;
        }

        aiEngineService
            .ingestDocument(kb.id, absolutePath, courseId, fileName, extraMetadata, {
                extractImages: input.extractImages,
                performOcr: input.performOcr,
            })
            .then(async (result) => {
                if (result.success) {
                    await prisma.knowledgeBase.update({
                        where: { id: kb!.id },
                        data: { vectorStatus: 'ready', processedAt: new Date(), errorMessage: null },
                    });
                } else {
                    await prisma.knowledgeBase.update({
                        where: { id: kb!.id },
                        data: {
                            vectorStatus: 'failed',
                            errorMessage: result.message || 'Ingest failed',
                        },
                    });
                }
            })
            .catch(async (err) => {
                logger.error('KB ingest after week assign failed', err);
                await prisma.knowledgeBase.update({
                    where: { id: kb!.id },
                    data: {
                        vectorStatus: 'failed',
                        errorMessage: err instanceof Error ? err.message : 'Ingest failed',
                    },
                });
            });

        return { knowledgeBaseId: kb.id, ingestTriggered: true };
    }

    static async clearWeekOnUnassign(courseId: string, courseMaterialId: string) {
        // F7 pass2: ambil id dokumen DULU (sebelum di-null-kan) supaya metadata
        // minggu ikut dibersihkan di vector store — tanpa ini chunk Qdrant
        // tetap membawa week_index basi dan tetap ter-boost/citation.
        const rows = await prisma.knowledgeBase.findMany({
            where: { courseId, courseMaterialId, deletedAt: null },
            select: { id: true },
        });
        await prisma.knowledgeBase.updateMany({
            where: { courseId, courseMaterialId, deletedAt: null },
            data: { weekId: null, weekIndex: null },
        });
        for (const row of rows) {
            const ok = await aiEngineService.updateDocumentMetadata(
                row.id,
                `course_${courseId}`,
                { week_index: null, week_id: null }
            );
            if (!ok) {
                logger.warn('Failed to clear week metadata from vector store', {
                    knowledgeBaseId: row.id,
                    courseId,
                    courseMaterialId,
                });
            }
        }
    }
}