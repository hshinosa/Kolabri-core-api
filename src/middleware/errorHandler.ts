import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { AuditLogService } from '../services/audit-log.service.js';
import { sanitizeErrorForLog } from '../utils/sensitiveData.js';

export interface AppError extends Error {
    statusCode?: number;
    code?: string;
    details?: Record<string, unknown>;
}

export class ApiError extends Error implements AppError {
    statusCode: number;
    code: string;
    details?: Record<string, unknown>;

    constructor(statusCode: number, code: string, message: string, details?: Record<string, unknown>) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.name = 'ApiError';
    }

    static badRequest(message: string, details?: Record<string, unknown>) {
        return new ApiError(400, 'BAD_REQUEST', message, details);
    }

    static unauthorized(message = 'Unauthorized') {
        return new ApiError(401, 'UNAUTHORIZED', message);
    }

    static forbidden(message = 'Access denied') {
        return new ApiError(403, 'FORBIDDEN', message);
    }

    static notFound(message = 'Resource not found') {
        return new ApiError(404, 'NOT_FOUND', message);
    }

    static conflict(message: string) {
        return new ApiError(409, 'CONFLICT', message);
    }

    static gone(message: string) {
        return new ApiError(410, 'GONE', message);
    }

    static tooManyRequests(message: string) {
        return new ApiError(429, 'TOO_MANY_REQUESTS', message);
    }

    static internal(message = 'Internal server error') {
        return new ApiError(500, 'INTERNAL_ERROR', message);
    }
}

export function errorHandler(
    err: AppError,
    _req: Request,
    res: Response,
    _next: NextFunction
): void {
    const statusCode = err.statusCode || 500;
    const code = err.code || 'INTERNAL_ERROR';
    const message = err.message || 'An unexpected error occurred';

    if (process.env.NODE_ENV !== 'production') {
        logger.error(`Request error [${code} ${statusCode}]:`, {
            name: err.name,
            message: sanitizeErrorForLog(err),
            details: err.details ? AuditLogService.sanitizePayload(err.details) : undefined,
        });
    }

    res.status(statusCode).json({
        error: {
            code,
            message,
            ...(err.details && { details: AuditLogService.sanitizePayload(err.details) }),
        },
    });
}
