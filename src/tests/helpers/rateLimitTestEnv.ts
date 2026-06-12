import { afterAll, beforeAll } from 'vitest';

/** Enable real rate limiters for tests in this suite (vitest.setup reads env per request). */
export function enableRealRateLimitForSuite(options?: { maxRequests?: number }): void {
    beforeAll(() => {
        process.env.VITEST_RATE_LIMIT_REAL = '1';
        if (options?.maxRequests !== undefined) {
            process.env.RATE_LIMIT_MAX_REQUESTS = String(options.maxRequests);
            process.env.AUTH_RATE_LIMIT_MAX = String(options.maxRequests);
        }
    });
    afterAll(() => {
        delete process.env.VITEST_RATE_LIMIT_REAL;
        if (options?.maxRequests !== undefined) {
            delete process.env.RATE_LIMIT_MAX_REQUESTS;
            delete process.env.AUTH_RATE_LIMIT_MAX;
        }
    });
}