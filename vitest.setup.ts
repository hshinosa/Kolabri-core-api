import 'dotenv/config';

import { vi } from 'vitest';

// Tests import app.ts (not server.ts, the only entry that loads dotenv), so
// load .env here the same way server.ts does — JWT_SECRET & friends must be
// present for auth integration tests. dotenv never overrides vars already in
// process.env (e.g. DATABASE_URL passed by CI/container).

const passThrough = (_req: unknown, _res: unknown, next: () => void) => next();

function useRealRateLimiters(): boolean {
    return process.env.VITEST_RATE_LIMIT_REAL === '1';
}

vi.mock('./src/middleware/rateLimiter.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./src/middleware/rateLimiter.js')>();
    type Limiter = (typeof actual)['rateLimiter'];

    const wrap = (name: keyof typeof actual): Limiter => {
        const real = actual[name] as Limiter;
        return ((req, res, next) => {
            if (useRealRateLimiters()) {
                return real(req, res, next);
            }
            return passThrough(req, res, next);
        }) as Limiter;
    };

    return {
        ...actual,
        rateLimiter: wrap('rateLimiter'),
        authRateLimiter: wrap('authRateLimiter'),
        loginRateLimiter: wrap('loginRateLimiter'),
        registerRateLimiter: wrap('registerRateLimiter'),
        aiRateLimiter: wrap('aiRateLimiter'),
        previewRateLimiter: wrap('previewRateLimiter'),
        testConnectionLimiter: wrap('testConnectionLimiter'),
        exportRateLimiter: wrap('exportRateLimiter'),
    };
});