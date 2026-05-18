import { describe, expect, it } from 'vitest';
import { formatEnvError, parseEnv } from './env.js';

const validBase: NodeJS.ProcessEnv = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    MONGODB_URL: 'mongodb://localhost:27017/db',
    JWT_SECRET: 'a'.repeat(32),
    AI_ENGINE_URL: 'http://localhost:8001',
    CORE_API_SECRET: 'shared-secret-key-min-16',
};

describe('parseEnv', () => {
    it('accepts a valid minimal env', () => {
        const result = parseEnv(validBase);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.PORT).toBe(3000);
            expect(result.data.NODE_ENV).toBe('development');
            expect(result.data.AUTH_RATE_LIMIT_MAX).toBe(5);
        }
    });

    it('coerces numeric strings into numbers', () => {
        const result = parseEnv({
            ...validBase,
            PORT: '4000',
            RATE_LIMIT_MAX_REQUESTS: '50',
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.PORT).toBe(4000);
            expect(result.data.RATE_LIMIT_MAX_REQUESTS).toBe(50);
        }
    });

    it('rejects missing CORE_API_SECRET', () => {
        const env = { ...validBase };
        delete env.CORE_API_SECRET;
        const result = parseEnv(env);
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some((i) => i.path.includes('CORE_API_SECRET'))).toBe(true);
        }
    });

    it('rejects short JWT_SECRET (< 32 chars)', () => {
        const result = parseEnv({ ...validBase, JWT_SECRET: 'short' });
        expect(result.success).toBe(false);
        if (!result.success) {
            const msg = formatEnvError(result.error);
            expect(msg).toContain('JWT_SECRET');
        }
    });

    it('rejects malformed AI_ENGINE_URL', () => {
        const result = parseEnv({ ...validBase, AI_ENGINE_URL: 'not-a-url' });
        expect(result.success).toBe(false);
    });

    it('rejects ENCRYPTION_KEY of wrong length when provided', () => {
        const result = parseEnv({ ...validBase, ENCRYPTION_KEY: 'too-short' });
        expect(result.success).toBe(false);
    });

    it('accepts ENCRYPTION_KEY of exactly 32 chars', () => {
        const result = parseEnv({ ...validBase, ENCRYPTION_KEY: 'a'.repeat(32) });
        expect(result.success).toBe(true);
    });

    it('rejects non-numeric PORT', () => {
        const result = parseEnv({ ...validBase, PORT: 'abc' });
        expect(result.success).toBe(false);
    });

    it('rejects invalid NODE_ENV', () => {
        const result = parseEnv({ ...validBase, NODE_ENV: 'staging' });
        expect(result.success).toBe(false);
    });
});

describe('formatEnvError', () => {
    it('returns multi-line indented output naming each invalid field', () => {
        const result = parseEnv({});
        expect(result.success).toBe(false);
        if (!result.success) {
            const msg = formatEnvError(result.error);
            expect(msg.startsWith('Invalid environment configuration:')).toBe(true);
            expect(msg).toContain('DATABASE_URL');
            expect(msg).toContain('JWT_SECRET');
        }
    });
});
