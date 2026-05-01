import rateLimit from 'express-rate-limit';
import { AuthenticatedRequest } from './auth.js';

export const rateLimiter = rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    keyGenerator: (req) => {
        const authReq = req as AuthenticatedRequest;
        return authReq.user?.userId || req.ip || 'anonymous';
    },
    message: {
        error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests, please try again later',
        },
    },
    standardHeaders: true,
    legacyHeaders: false,
});

export const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 50,
    keyGenerator: (req) => {
        const authReq = req as AuthenticatedRequest;
        return authReq.user?.userId || req.ip || 'anonymous';
    },
    message: {
        error: {
            code: 'AUTH_RATE_LIMIT_EXCEEDED',
            message: 'Too many login attempts, please try again later',
        },
    },
    standardHeaders: true,
    legacyHeaders: false,
});

export const aiRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    keyGenerator: (req) => {
        const authReq = req as AuthenticatedRequest;
        return authReq.user?.userId || req.ip || 'anonymous';
    },
    message: {
        error: {
            code: 'AI_RATE_LIMIT_EXCEEDED',
            message: 'Too many AI requests, please slow down',
        },
    },
    standardHeaders: true,
    legacyHeaders: false,
});

export const testConnectionLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    keyGenerator: (req) => {
        const authReq = req as AuthenticatedRequest;
        return authReq.user?.userId || req.ip || 'anonymous';
    },
    message: {
        error: {
            code: 'TEST_CONNECTION_RATE_LIMIT_EXCEEDED',
            message: 'Too many test connection attempts, please try again later',
        },
    },
    standardHeaders: true,
    legacyHeaders: false,
});
