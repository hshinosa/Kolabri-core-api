import { afterEach, describe, expect, it } from 'vitest';
import { _resetRedisForTests, getRedis, initRedis } from './redis.js';

describe('redis client', () => {
    afterEach(() => {
        _resetRedisForTests();
    });

    it('returns null when REDIS_URL is undefined (Redis disabled)', () => {
        const client = initRedis(undefined);
        expect(client).toBeNull();
        expect(getRedis()).toBeNull();
    });

    it('memoizes initialization', () => {
        const first = initRedis(undefined);
        const second = initRedis(undefined);
        expect(first).toBe(second);
        expect(first).toBeNull();
    });
});
