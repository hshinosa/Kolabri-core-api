import { Request, Response, NextFunction } from 'express';
import { ApiError } from './errorHandler.js';

/**
 * Shared secret between Laravel BFF and core-api for internal hooks.
 */
export function verifyInternalSecret(req: Request, _res: Response, next: NextFunction) {
    const expected = process.env.CORE_API_INTERNAL_SECRET || process.env.AI_ENGINE_SECRET || '';
    if (!expected) {
        return next(ApiError.forbidden('Internal API not configured'));
    }
    const header = req.header('X-Internal-Secret') || req.header('Authorization')?.replace(/^Bearer\s+/i, '');
    if (header !== expected) {
        return next(ApiError.forbidden('Invalid internal secret'));
    }
    return next();
}