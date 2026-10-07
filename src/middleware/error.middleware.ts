import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * M10: a malformed JSON body used to surface as400 `INTERNAL_ERROR` with the
 * raw `JSON.parse` message. Map body-parser parse failures to a clean
 * `VALIDATION_ERROR` instead of leaking the parser internals.
 */
function normalizeBodyParseError(err: AppError): AppError | null {
    const bodyParserErr = err as AppError & { type?: string };
    const isParseFailure =
        bodyParserErr.type === 'entity.parse.failed' ||
        (err instanceof SyntaxError &&
            ((bodyParserErr as AppError & { status?: number }).status === 400 ||
                (bodyParserErr as AppError & { statusCode?: number }).statusCode === 400));

    if (isParseFailure) {
        return new ApiError(400, 'VALIDATION_ERROR', 'Request body is not valid JSON');
    }

    return null;
}

function normalizeUploadError(err: AppError): AppError {
    if (err.statusCode) {
        return err;
    }

    const message = err.message || '';
    const code = err.code || '';

    if (
        code === 'LIMIT_FILE_SIZE' ||
        code === 'LIMIT_UNEXPECTED_FILE' ||
        message.startsWith('Unsupported file type:') ||
        message === 'Only PDF files are allowed'
    ) {
        return ApiError.badRequest(message);
    }

    return err;
}

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

    static internal(message = 'Internal server error') {
        return new ApiError(500, 'INTERNAL_ERROR', message);
    }
}

// Middleware to attach requestId to all requests
export function requestIdMiddleware(req: Request, _res: Response, next: NextFunction): void {
    // Use existing header or generate new
    const requestId = (req.headers['x-request-id'] as string) || uuidv4();
    (req as any).requestId = requestId;
    next();
}

// Sanitize error message to remove sensitive info
function sanitizeErrorMessage(message: string): string {
    // Remove file paths
    let sanitized = message.replace(/\/[^\s]+\.(ts|js|json)/gi, '[file]');
    // Remove SQL-like patterns
    sanitized = sanitized.replace(/SELECT .* FROM/gi, '[SQL query]');
    sanitized = sanitized.replace(/INSERT INTO .* VALUES/gi, '[SQL query]');
    sanitized = sanitized.replace(/UPDATE .* SET/gi, '[SQL query]');
    sanitized = sanitized.replace(/DELETE FROM .*/gi, '[SQL query]');
    // Remove connection strings
    sanitized = sanitized.replace(/mongodb:\/\/[^\s]+/gi, '[connection string]');
    sanitized = sanitized.replace(/postgres:\/\/[^\s]+/gi, '[connection string]');
    sanitized = sanitized.replace(/mysql:\/\/[^\s]+/gi, '[connection string]');
    return sanitized;
}

// Check if error contains sensitive information
function hasSensitiveInfo(err: Error): boolean {
    const message = err.message || '';
    const stack = err.stack || '';
    const combined = message + stack;
    
    // Check for file paths
    if (/\/[^\s]+\.(ts|js|json)/i.test(combined)) return true;
    // Check for SQL
    if (/(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN)/i.test(combined)) return true;
    // Check for connection strings
    if (/(mongodb|postgres|mysql):\/\//i.test(combined)) return true;
    // Check for env vars
    if (/process\.env\./i.test(combined)) return true;
    
    return false;
}

export function errorHandler(
    err: AppError,
    req: Request,
    res: Response,
    _next: NextFunction
): void {
    const normalizedError = normalizeBodyParseError(err) ?? normalizeUploadError(err);
    const statusCode = normalizedError.statusCode || 500;
    const code = normalizedError.code || 'INTERNAL_ERROR';
    const requestId = (req as any).requestId || 'unknown';
    const userId = (req as any).user?.userId || 'anonymous';
    const method = req.method;
    const path = req.path;

    // Log error with full context (server-side only)
    const logContext = {
        requestId,
        userId,
        method,
        path,
        statusCode,
        code,
        message: normalizedError.message,
        stack: normalizedError.stack,
        details: normalizedError.details,
    };

    if (statusCode >= 500) {
        logger.error('Server error:', logContext);
    } else {
        logger.warn('Client error:', logContext);
    }

    // Prepare client response
    let clientMessage = normalizedError.message || 'An unexpected error occurred';
    
    // In production, sanitize error messages for 5xx errors
    if (process.env.NODE_ENV === 'production' && statusCode >= 500) {
        // Check if message contains sensitive info
        if (hasSensitiveInfo(normalizedError)) {
            clientMessage = 'An internal server error occurred';
        } else {
            clientMessage = sanitizeErrorMessage(clientMessage);
        }
    }

    // Build response per design.md format
    const response: {
        status: number;
        message: string;
        error: { code: string; message: string };
        errors?: Array<{ field: string; message: string }>;
        requestId?: string;
    } = {
        status: statusCode,
        message: clientMessage,
        error: { code, message: clientMessage },
    };

    if (normalizedError.details && typeof normalizedError.details === 'object') {
        const errors: Array<{ field: string; message: string }> = [];
        if (Array.isArray(normalizedError.details)) {
            for (const item of normalizedError.details) {
                if (
                    item &&
                    typeof item === 'object' &&
                    'field' in item &&
                    'message' in item &&
                    typeof (item as { field: unknown }).field === 'string' &&
                    typeof (item as { message: unknown }).message === 'string'
                ) {
                    errors.push({
                        field: (item as { field: string }).field,
                        message: (item as { message: string }).message,
                    });
                }
            }
        } else {
            for (const [field, message] of Object.entries(normalizedError.details)) {
                if (typeof message === 'string') {
                    errors.push({ field, message });
                }
            }
        }
        if (errors.length > 0) {
            response.errors = errors;
        }
    }

    // Add requestId for server errors (5xx)
    if (statusCode >= 500) {
        response.requestId = requestId;
    }

    // Never include stack traces in client response
    res.status(statusCode).json(response);
}
