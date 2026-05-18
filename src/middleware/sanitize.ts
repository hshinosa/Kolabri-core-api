import { Request, Response, NextFunction } from 'express';
import xss from 'xss';

const xssOptions = {
    whiteList: {} as Record<string, string[]>,
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script', 'style'],
};

function sanitizeValue(value: unknown): unknown {
    if (typeof value === 'string') {
        return xss(value, xssOptions);
    }
    if (Array.isArray(value)) {
        return value.map(sanitizeValue);
    }
    if (value !== null && typeof value === 'object') {
        const sanitized: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            sanitized[k] = sanitizeValue(v);
        }
        return sanitized;
    }
    return value;
}

export function sanitizeBody(req: Request, _res: Response, next: NextFunction): void {
    const contentType = req.headers['content-type'] ?? '';
    if (!contentType.includes('multipart/form-data') && req.body) {
        req.body = sanitizeValue(req.body);
    }
    next();
}
