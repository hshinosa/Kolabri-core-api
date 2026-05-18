import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ApiError } from '../middleware/errorHandler.js';

export function validateBody<T>(schema: ZodSchema<T>) {
    return (req: Request, _res: Response, next: NextFunction): void => {
        try {
            req.body = schema.parse(req.body);
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                const details = error.errors.map(err => ({
                    field: err.path.join('.') || 'unknown',
                    message: err.message,
                }));
                next(ApiError.badRequest('Validation failed', details as unknown as Record<string, unknown>));
            } else {
                next(error);
            }
        }
    };
}

export function validateParams<T>(schema: ZodSchema<T>) {
    return (req: Request, _res: Response, next: NextFunction): void => {
        try {
            req.params = schema.parse(req.params) as Record<string, string>;
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                next(ApiError.badRequest('Invalid parameters'));
            } else {
                next(error);
            }
        }
    };
}

export function validateQuery<T>(schema: ZodSchema<T>) {
    return (req: Request, _res: Response, next: NextFunction): void => {
        try {
            req.query = schema.parse(req.query) as Record<string, string>;
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                next(ApiError.badRequest('Invalid query parameters'));
            } else {
                next(error);
            }
        }
    };
}
