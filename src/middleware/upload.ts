import multer from 'multer';
import type { Request } from 'express';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_BATCH_FILE_SIZE = 50 * 1024 * 1024; // 50MB per file
const MAX_FILES = 50;

const SUPPORTED_MIMETYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint',
    'text/plain',
    'text/markdown',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/webp',
    'application/zip',
    'application/x-zip-compressed',
];

/**
 * Single file upload middleware (max 10MB)
 * Supports PDF only
 */
export const uploadSingle = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_FILE_SIZE,
    },
    fileFilter: (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'));
        }
    },
});

/**
 * Batch file upload middleware (max 50MB per file, max 50 files)
 * Supports multiple file types
 */
export const uploadBatch = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_BATCH_FILE_SIZE,
        files: MAX_FILES,
    },
    fileFilter: (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
        if (SUPPORTED_MIMETYPES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Unsupported file type: ${file.mimetype}`));
        }
    },
});

/**
 * Generic file upload middleware with custom limits
 */
export const createUploadMiddleware = (options: {
    maxFileSize?: number;
    maxFiles?: number;
    allowedMimetypes?: string[];
}) => {
    const {
        maxFileSize = MAX_FILE_SIZE,
        maxFiles = 1,
        allowedMimetypes = SUPPORTED_MIMETYPES,
    } = options;

    return multer({
        storage: multer.memoryStorage(),
        limits: {
            fileSize: maxFileSize,
            files: maxFiles,
        },
        fileFilter: (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
            if (allowedMimetypes.includes(file.mimetype)) {
                cb(null, true);
            } else {
                cb(new Error(`Unsupported file type: ${file.mimetype}`));
            }
        },
    });
};
