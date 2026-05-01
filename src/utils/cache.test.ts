import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cache } from './cache.js';

describe('cache', () => {
    beforeEach(() => {
        cache.clear();
        vi.restoreAllMocks();
    });

    it('stores and retrieves cached values', () => {
        cache.set('course:list', { id: 'course-1', name: 'AI' });

        expect(cache.get('course:list')).toEqual({ id: 'course-1', name: 'AI' });
    });

    it('returns null for unknown keys', () => {
        expect(cache.get('missing:key')).toBeNull();
    });

    it('expires entries when ttl has elapsed', () => {
        vi.spyOn(Date, 'now')
            .mockReturnValueOnce(1_000)
            .mockReturnValueOnce(1_200)
            .mockReturnValueOnce(2_100);

        cache.set('short-lived', 'value', 500);

        expect(cache.get('short-lived')).toBe('value');
        expect(cache.get('short-lived')).toBeNull();
    });

    it('uses the default ttl when no ttl is provided', () => {
        vi.spyOn(Date, 'now')
            .mockReturnValueOnce(10_000)
            .mockReturnValueOnce(10_100)
            .mockReturnValueOnce(310_001);

        cache.set('default-ttl', 'value');

        expect(cache.get('default-ttl')).toBe('value');
        expect(cache.get('default-ttl')).toBeNull();
    });

    it('invalidates a single cache entry', () => {
        cache.set('courses:lecturer:1', ['a']);
        cache.invalidate('courses:lecturer:1');

        expect(cache.get('courses:lecturer:1')).toBeNull();
    });

    it('invalidates keys matching a regex pattern', () => {
        cache.set('courses:user-1:lecturer', ['course-1']);
        cache.set('courses:user-1:student', ['course-2']);
        cache.set('profile:user-1', { id: 'user-1' });

        cache.invalidatePattern('^courses:user-1:');

        expect(cache.get('courses:user-1:lecturer')).toBeNull();
        expect(cache.get('courses:user-1:student')).toBeNull();
        expect(cache.get('profile:user-1')).toEqual({ id: 'user-1' });
    });

    it('clears all cached entries', () => {
        cache.set('one', 1);
        cache.set('two', 2);

        cache.clear();

        expect(cache.get('one')).toBeNull();
        expect(cache.get('two')).toBeNull();
    });
});
