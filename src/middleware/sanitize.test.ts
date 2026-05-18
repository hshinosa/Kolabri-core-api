import { describe, expect, it } from 'vitest';
import { sanitizeBody } from './sanitize.js';
import type { Request, Response, NextFunction } from 'express';

function makeReq(body: unknown, contentType = 'application/json'): Request {
    return {
        headers: { 'content-type': contentType },
        body,
    } as unknown as Request;
}

function run(body: unknown, contentType?: string): unknown {
    const req = makeReq(body, contentType);
    sanitizeBody(req, {} as Response, (() => {}) as NextFunction);
    return req.body;
}

describe('sanitizeBody', () => {
    it('strips HTML tags from string fields', () => {
        const result = run({ name: '<script>alert("xss")</script>Hello' }) as Record<string, unknown>;
        expect(result.name).toBe('Hello');
    });

    it('leaves plain text unchanged', () => {
        const result = run({ name: 'Hello World' }) as Record<string, unknown>;
        expect(result.name).toBe('Hello World');
    });

    it('sanitizes nested objects recursively', () => {
        const result = run({
            user: { bio: '<b>bold</b>', age: 25 },
        }) as Record<string, Record<string, unknown>>;
        expect(result.user.bio).toBe('bold');
        expect(result.user.age).toBe(25);
    });

    it('leaves numbers, booleans, and null unchanged', () => {
        const result = run({ count: 42, active: true, data: null }) as Record<string, unknown>;
        expect(result.count).toBe(42);
        expect(result.active).toBe(true);
        expect(result.data).toBeNull();
    });

    it('sanitizes all elements in an array of strings', () => {
        const result = run({ tags: ['<b>one</b>', 'two', '<i>three</i>'] }) as Record<string, unknown[]>;
        expect(result.tags).toEqual(['one', 'two', 'three']);
    });

    it('skips sanitization for multipart/form-data', () => {
        const body = { file: '<script>bad</script>' };
        const result = run(body, 'multipart/form-data; boundary=xxx');
        expect((result as Record<string, unknown>).file).toBe('<script>bad</script>');
    });
});
