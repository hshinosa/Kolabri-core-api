import rateLimit, { type Options } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { AuthenticatedRequest } from './auth.js';
import { getRedis } from '../config/redis.js';

function buildStore(prefix: string): Options['store'] | undefined {
    const redis = getRedis();
    if (!redis) return undefined;
    return new RedisStore({
        prefix: `rl:${prefix}:`,
        // ioredis's `call(...)` accepts variadic args; cast at the boundary because
        // RedisStore expects an opaque RedisReply.
        sendCommand: (command: string, ...args: string[]) =>
            (redis.call(command, ...args) as unknown) as Promise<unknown>,
    } as unknown as ConstructorParameters<typeof RedisStore>[0]) as unknown as Options['store'];
}

// Matikan sementara (env RATE_LIMIT_DISABLED=1): semua request dilewati tanpa
// dibatasi — rate limit global dimatikan sementara untuk penggunaan internal.
const RATE_LIMIT_DISABLED = process.env.RATE_LIMIT_DISABLED === "1";

export const rateLimiter = rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: () => Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    store: buildStore('general'),
    skip: () => RATE_LIMIT_DISABLED,
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
    max: () => Number(process.env.AUTH_RATE_LIMIT_MAX) || 50,
    store: buildStore('auth'),
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

// Strict per-IP login limiter: 5 failed attempts per 15 min, successful logins
// don't count so legit users staying logged-in/refreshing don't hit it.
export const loginRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    store: buildStore('login'),
    keyGenerator: (req) => req.ip || 'anonymous',
    skipSuccessfulRequests: true,
    message: {
        error: {
            code: 'AUTH_RATE_LIMIT_EXCEEDED',
            message: 'Too many login attempts, please try again later',
        },
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Registration is rarer and abuse-prone; tighter window.
export const registerRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    store: buildStore('register'),
    keyGenerator: (req) => req.ip || 'anonymous',
    message: {
        error: {
            code: 'AUTH_RATE_LIMIT_EXCEEDED',
            message: 'Too many registrations, please try again later',
        },
    },
    standardHeaders: true,
    legacyHeaders: false,
});

export const aiRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    store: buildStore('ai'),
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

export const previewRateLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: Number(process.env.PREVIEW_RATE_LIMIT_MAX) || 10,
    store: buildStore('preview'),
    keyGenerator: (req) => {
        const authReq = req as AuthenticatedRequest;
        return authReq.user?.userId || req.ip || 'anonymous';
    },
    message: {
        error: {
            code: 'PREVIEW_RATE_LIMIT_EXCEEDED',
            message: 'Too many preview requests. Please wait before testing again.',
        },
    },
    standardHeaders: true,
    legacyHeaders: false,
});

export const testConnectionLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    store: buildStore('test-connection'),
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

export const exportRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    store: buildStore('export'),
    keyGenerator: (req) => {
        const authReq = req as AuthenticatedRequest;
        return authReq.user?.userId || req.ip || 'anonymous';
    },
    message: {
        error: {
            code: 'EXPORT_RATE_LIMIT_EXCEEDED',
            message: 'Too many export requests, please try again later',
        },
    },
    standardHeaders: true,
    legacyHeaders: false,
});
