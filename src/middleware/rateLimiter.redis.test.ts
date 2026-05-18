import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { _resetRedisForTests, initRedis, getRedis } from '../config/redis.js';

describe('rateLimiter Redis store integration', () => {
    beforeEach(() => {
        vi.resetModules();
        _resetRedisForTests();
    });

    afterEach(() => {
        _resetRedisForTests();
    });

    it('falls back to in-memory store when Redis is not configured', async () => {
        initRedis(undefined);
        expect(getRedis()).toBeNull();

        const { rateLimiter, authRateLimiter, loginRateLimiter, registerRateLimiter, aiRateLimiter, testConnectionLimiter } =
            await import('./rateLimiter.js');

        for (const limiter of [rateLimiter, authRateLimiter, loginRateLimiter, registerRateLimiter, aiRateLimiter, testConnectionLimiter]) {
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

        const { rateLimiter } = await import('./rateLimiter.js');
        expect(typeof rateLimiter).toBe('function');
        expect(fakeRedis.call).toHaveBeenCalled();

        vi.doUnmock('../config/redis.js');
    });
});
