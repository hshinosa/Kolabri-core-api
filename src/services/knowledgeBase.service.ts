import path from 'node:path';
import fs from 'node:fs/promises';
import prisma from '../config/database.js';
import { ApiError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import { aiEngineService } from './aiEngine.service.js';

interface UploadedFile {
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
}

interface BatchUploadOptions {
    extractImages?: boolean;
    performOcr?: boolean;
}

// Supported file types for batch upload
const SUPPORTED_MIMETYPES: Record<string, string> = {
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'text/plain': 'txt',
    'text/markdown': 'md',
    'image/png': 'image',
    'image/jpeg': 'image',
    'image/jpg': 'image',
    'image/gif': 'image',
    'image/webp': 'image',
    'application/zip': 'zip',
    'application/x-zip-compressed': 'zip',
};

export class KnowledgeBaseService {
    /**
     * Upload a PDF file to knowledge base
     */
    static async uploadFile(courseId: string, file: UploadedFile, lecturerId: string) {
        // Verify course ownership
        const course = await prisma.course.findUnique({
            where: { id: courseId },
        });

        if (!course) {
            throw ApiError.notFound('Course not found');
        }

        if (course.ownerId !== lecturerId) {
            throw ApiError.forbidden('You do not own this course');
        }

        // Validate file type
        if (file.mimetype !== 'application/pdf') {
            throw ApiError.badRequest('Only PDF files are allowed');
        }

        // Validate file size (10MB max)
        const maxSize = (Number(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024;
        if (file.size > maxSize) {
            throw ApiError.badRequest(`File size must be less than ${maxSize / 1024 / 1024}MB`);
        }

        // Create upload directory if it doesn't exist
        const uploadDir = process.env.UPLOAD_DIR || './uploads';
        const courseDir = path.join(uploadDir, courseId);
        await fs.mkdir(courseDir, { recursive: true });

        // Generate unique filename
        const timestamp = Date.now();
        const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        const fileName = `${timestamp}_${sanitizedName}`;
        const filePath = path.join(courseDir, fileName);

        // Save file to disk
        await fs.writeFile(filePath, file.buffer);

        // Create database record
        const knowledgeBase = await prisma.knowledgeBase.create({
            data: {
                fileName: file.originalname,
                filePath,
                fileSize: file.size,
                mimeType: file.mimetype,
                vectorStatus: 'pending',
                courseId,
                uploadedBy: lecturerId,
            },
        });

        // Trigger AI Engine ingestion (async, don't wait)
        this.sendToAIEngine(knowledgeBase.id, filePath, courseId, file.originalname).catch((err) => {
            logger.error('Failed to send file to AI Engine:', err);
        });

        return {
            id: knowledgeBase.id,
            fileName: knowledgeBase.fileName,
            status: knowledgeBase.vectorStatus,
            uploadedAt: knowledgeBase.uploadedAt,
        };
    }

    /**
     * Get knowledge base files for a course
     */
    static async getCourseFiles(courseId: string, userId: string, role: string) {
        const course = await prisma.course.findUnique({
            where: { id: courseId },
        });

        if (!course) {
            throw ApiError.notFound('Course not found');
        }

        // Check access
        if (role === 'lecturer') {
            if (course.ownerId !== userId) {
                throw ApiError.forbidden('You do not own this course');
            }
        } else {
            const enrollment = await prisma.courseStudent.findUnique({
                where: {
                    courseId_userId: {
                        courseId,
                        userId,
                    },
                },
            });

            if (!enrollment) {
                throw ApiError.forbidden('You are not enrolled in this course');
            }
        }

        const files = await prisma.knowledgeBase.findMany({
            where: { courseId, deletedAt: null },
            select: {
                id: true,
                fileName: true,
                fileSize: true,
                mimeType: true,
                vectorStatus: true,
                uploadedAt: true,
                processedAt: true,
                errorMessage: true,
            },
            orderBy: { uploadedAt: 'desc' },
        });

        return files;
    }

    /**
     * Send file to AI Engine for vector processing
     */
    private static async sendToAIEngine(
        fileId: string,
        filePath: string,
        courseId: string,
        fileName: string
    ) {
        try {
            // Check if AI Engine is available
            const isAvailable = await aiEngineService.isAvailable();

            if (!isAvailable) {
                logger.warn('AI Engine not available, skipping ingestion');
                return;
            }

            // Update status to processing
            await prisma.knowledgeBase.update({
                where: { id: fileId },
                data: { vectorStatus: 'processing' },
            });

            // Use AI Engine service to ingest
            const result = await aiEngineService.ingestDocument(
                fileId,
                filePath,
                courseId,
                fileName
            );

            if (result.success) {
                // Update status to ready
                await prisma.knowledgeBase.update({
                    where: { id: fileId },
                    data: {
                        vectorStatus: 'ready',
                        processedAt: new Date(),
                    },
                });

                logger.info(`File ${fileName} processed successfully`, {
                    fileId,
                    chunksCreated: result.chunks_created,
                });
            } else {
                throw new Error(result.message || 'AI Engine processing failed');
            }
        } catch (error) {
            logger.error('AI Engine ingestion failed:', error);

            // Update status to failed
            await prisma.knowledgeBase.update({
                where: { id: fileId },
                data: {
                    vectorStatus: 'failed',
                    errorMessage: error instanceof Error ? error.message : 'Unknown error',
                },
            });
        }
    }

    /**
     * Delete a knowledge base file
     */
    static async deleteFile(fileId: string, lecturerId: string) {
        const file = await prisma.knowledgeBase.findUnique({
            where: { id: fileId },
            include: {
                course: {
                    select: { ownerId: true, id: true },
                },
            },
        });

        if (!file) {
            throw ApiError.notFound('File not found');
        }

        if (file.course.ownerId !== lecturerId) {
            throw ApiError.forbidden('You do not own this course');
        }

        // Delete from vector store
        try {
            await aiEngineService.deleteDocument(
                fileId,
                `course_${file.course.id}`
            );
        } catch {
            logger.warn(`Failed to delete document from vector store: ${fileId}`);
        }

        // Delete file from disk
        try {
            await fs.unlink(file.filePath);
        } catch {
            logger.warn(`Failed to delete file from disk: ${file.filePath}`);
        }

        await prisma.knowledgeBase.update({
            where: { id: fileId },
            data: { deletedAt: new Date() },
        });

        return { success: true };
    }

    /**
     * Upload multiple files or a ZIP file to knowledge base (batch upload)
     * Supports: PDF, DOCX, PPTX, TXT, MD, images, ZIP
     */
    static async uploadBatch(
        courseId: string, 
        files: UploadedFile[], 
        lecturerId: string,
        options?: BatchUploadOptions
    ) {
        // Verify course ownership
        const course = await prisma.course.findUnique({
            where: { id: courseId },
        });

        if (!course) {
            throw ApiError.notFound('Course not found');
        }

        if (course.ownerId !== lecturerId) {
            throw ApiError.forbidden('You do not own this course');
        }

        // Validate and filter files
        const validFiles: Array<{ file: UploadedFile; type: string }> = [];
        const rejectedFiles: Array<{ name: string; reason: string }> = [];

        for (const file of files) {
            const fileType = SUPPORTED_MIMETYPES[file.mimetype];
            
            if (!fileType) {
                rejectedFiles.push({ 
                    name: file.originalname, 
                    reason: `Unsupported file type: ${file.mimetype}` 
                });
                continue;
            }

            // Validate file size (50MB for ZIP, 10MB for others)
            const maxSize = fileType === 'zip' 
                ? 50 * 1024 * 1024 
                : (Number(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024;
                
            if (file.size > maxSize) {
                rejectedFiles.push({ 
                    name: file.originalname, 
                    reason: `File too large (max ${maxSize / 1024 / 1024}MB)` 
                });
                continue;
            }

            validFiles.push({ file, type: fileType });
        }

        if (validFiles.length === 0) {
            throw ApiError.badRequest('No valid files to upload', { 
                rejected: rejectedFiles 
            });
        }

        // Create upload directory
        const uploadDir = process.env.UPLOAD_DIR || './uploads';
        const courseDir = path.join(uploadDir, courseId);
        await fs.mkdir(courseDir, { recursive: true });

        // Save files to disk and create DB records
        const savedFiles: Array<{ 
            id: string; 
            path: string; 
            name: string; 
            type: string;
        }> = [];

        const timestamp = Date.now();
        for (const { file, type } of validFiles) {
            const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
            const fileName = `${timestamp}_${sanitizedName}`;
            const filePath = path.join(courseDir, fileName);

            await fs.writeFile(filePath, file.buffer);

            // Create database record
            const knowledgeBase = await prisma.knowledgeBase.create({
                data: {
                    fileName: file.originalname,
                    filePath,
                    fileSize: file.size,
                    mimeType: file.mimetype,
                    vectorStatus: 'pending',
                    courseId,
                    uploadedBy: lecturerId,
                },
            });

            savedFiles.push({
                id: knowledgeBase.id,
                path: filePath,
                name: file.originalname,
                type,
            });
        }

        // Send to AI Engine for batch processing (async)
        this.sendBatchToAIEngine(savedFiles, courseId, options).catch((err) => {
            logger.error('Failed to send batch to AI Engine:', err);
        });

        return {
            uploaded: savedFiles.map(f => ({
                id: f.id,
                fileName: f.name,
                type: f.type,
                status: 'pending',
            })),
            rejected: rejectedFiles,
            stats: {
                totalUploaded: savedFiles.length,
                totalRejected: rejectedFiles.length,
            },
        };
    }

    /**
     * Send batch of files to AI Engine for processing
     */
    private static async sendBatchToAIEngine(
        files: Array<{ id: string; path: string; name: string; type: string }>,
        courseId: string,
        options?: BatchUploadOptions
    ) {
        try {
            // Check if AI Engine is available
            const isAvailable = await aiEngineService.isAvailable();

            if (!isAvailable) {
                logger.warn('AI Engine not available, skipping batch ingestion');
                // Mark all as failed
                for (const file of files) {
                    await prisma.knowledgeBase.update({
                        where: { id: file.id },
                        data: { 
                            vectorStatus: 'failed',
                            errorMessage: 'AI Engine not available',
                        },
                    });
                }
                return;
            }

            // Update status to processing
            for (const file of files) {
                await prisma.knowledgeBase.update({
                    where: { id: file.id },
                    data: { vectorStatus: 'processing' },
                });
            }

            // Use AI Engine batch service
            const result = await aiEngineService.ingestBatch(
                files.map(f => ({ path: f.path, name: f.name })),
                courseId,
                {
                    extractImages: options?.extractImages ?? true,
                    performOcr: options?.performOcr ?? true,
                }
            );

            if (!result.success) {
                throw new Error(result.message || 'AI Engine batch processing failed');
            }

            // Update each file status based on result documents
            for (const file of files) {
                const fileResult = result.results.find((doc) => doc.filename === file.name);

                if (fileResult?.status === 'success') {
                    await prisma.knowledgeBase.update({
                        where: { id: file.id },
                        data: {
                            vectorStatus: 'ready',
                            processedAt: new Date(),
                        },
                    });
                } else {
                    await prisma.knowledgeBase.update({
                        where: { id: file.id },
                        data: {
                            vectorStatus: 'failed',
                            errorMessage: fileResult?.error || 'AI Engine gagal memproses dokumen',
                        },
                    });
                }
            }

            logger.info('Batch processed successfully', {
                courseId,
                stats: {
                    totalFiles: result.stats.total_files,
                    successful: result.stats.successful,
                    failed: result.stats.failed,
                    totalChunks: result.stats.total_chunks,
                },
            });
        } catch (error) {
            logger.error('AI Engine batch ingestion failed:', error);

            // Update status to failed for all
            for (const file of files) {
                await prisma.knowledgeBase.update({
                    where: { id: file.id },
                    data: {
                        vectorStatus: 'failed',
                        errorMessage: error instanceof Error ? error.message : 'Unknown error',
                    },
                });
            }
        }
    }
}
