import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = path.resolve(__dirname, '..', '..');

function runServerWith(env: NodeJS.ProcessEnv): { status: number | null; stderr: string; stdout: string } {
    const result = spawnSync(
        'npx',
        ['tsx', '--no-warnings', 'src/server.ts'],
        {
            cwd: projectRoot,
            env: { PATH: process.env.PATH, ...env },
            encoding: 'utf-8',
            timeout: 8000,
        },
    );
    return { status: result.status, stderr: result.stderr ?? '', stdout: result.stdout ?? '' };
}

describe('server boot env validation', () => {
    it.skipIf(!process.env.RUN_BOOT_TESTS)(
        'exits with code 1 and prints the missing var when CORE_API_SECRET is absent',
        () => {
            const { status, stderr } = runServerWith({
                NODE_ENV: 'test',
                DATABASE_URL: 'postgresql://x:x@localhost:5432/x',
                MONGODB_URL: 'mongodb://localhost:27017/x',
                JWT_SECRET: 'a'.repeat(32),
                AI_ENGINE_URL: 'http://localhost:8001',
            });
            expect(status).toBe(1);
            expect(stderr).toContain('CORE_API_SECRET');
        },
    );
});
