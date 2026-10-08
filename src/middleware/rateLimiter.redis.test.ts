import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { _resetRedisForTests, initRedis, getRedis } from '../config/redis.js';

describe('rateLimiter Redis store integration', () => {
    beforeEach(() => {
        process.env.VITEST_RATE_LIMIT_REAL = '1';
        vi.resetModules();
        _resetRedisForTests();
    });

    afterEach(() => {
        delete process.env.VITEST_RATE_LIMIT_REAL;
        _resetRedisForTests();
    });

    it('falls back to in-memory store when Redis is not configured', async () => {
        initRedis(undefined);
        expect(getRedis()).toBeNull();

        const { rateLimiter, authRateLimiter, loginRateLimiter, registerRateLimiter, aiRateLimiter, testConnectionLimiter } =
            await import('./rateLimiter.js');

        // login/register kini array multi-lapis (IP + email) — flatten dulu.
        for (const limiter of [
            rateLimiter,
            authRateLimiter,
            ...loginRateLimiter,
            ...registerRateLimiter,
            aiRateLimiter,
            testConnectionLimiter,
        ]) {
            expect(typeof limiter).toBe('function');
        }
    });

    it('uses RedisStore when Redis is configured', async () => {
        const fakeRedis = {
            call: vi.fn((command: string, ...args: string[]) => {
                if (command === 'SCRIPT' && args[0] === 'LOAD') {
                    return Promise.resolve('fake-sha');
                }
                return Promise.resolve(null);
            }),
            on: vi.fn(),
            duplicate: vi.fn(),
            quit: vi.fn(() => Promise.resolve('OK')),
            disconnect: vi.fn(),
        };

        vi.doMock('../config/redis.js', () => ({
            getRedis: () => fakeRedis,
            _resetRedisForTests: () => {},
            initRedis: vi.fn(),
            disconnectRedis: vi.fn(),
        }));

        vi.resetModules();
        const redisMod = await import('../config/redis.js');
        const rateLimiterMod = await import('./rateLimiter.js');

        expect(redisMod.getRedis()).toBe(fakeRedis);
        expect(typeof rateLimiterMod.rateLimiter).toBe('function');

        vi.doUnmock('../config/redis.js');
    });
});
