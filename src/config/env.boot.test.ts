import { describe, expect, it } from 'vitest';
import { formatEnvError, parseEnv } from './env.js';

describe('server boot env validation', () => {
    it('reports missing CORE_API_SECRET when absent from env', () => {
        const result = parseEnv({
            NODE_ENV: 'test',
            DATABASE_URL: 'postgresql://x:x@localhost:5432/x',
            MONGODB_URL: 'mongodb://localhost:27017/x',
            JWT_SECRET: 'a'.repeat(32),
            AI_ENGINE_URL: 'http://localhost:8001',
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(formatEnvError(result.error)).toContain('CORE_API_SECRET');
        }
    });
});
