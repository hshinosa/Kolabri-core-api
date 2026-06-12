import http from 'node:http';

import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { _resetRedisForTests } from '../config/redis.js';

type RateLimiterModule = typeof import('./rateLimiter.js');

async function createServer(rateLimiterModule: RateLimiterModule, isolateKey = false) {
    const app = express();

    if (isolateKey) {
        const bucket = `vitest-${Date.now()}-${Math.random()}`;
        app.set('trust proxy', false);
        app.use((req, _res, next) => {
            Object.defineProperty(req, 'ip', { value: bucket, configurable: true });
            next();
        });
    }

    app.use(rateLimiterModule.rateLimiter);
    app.get('/limited', (_req, res) => {
        res.status(200).json({ ok: true });
    });

    const server = http.createServer(app);

    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
        throw new Error('Failed to start test server');
    }

    return {
        server,
        url: `http://127.0.0.1:${address.port}/limited`,
    };
}

async function closeServer(server: http.Server): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        server.close((error) => {
            if (error) {
                reject(error);
                return;
            }

            resolve();
        });
    });
}

describe('rateLimiter', () => {
    beforeEach(() => {
        process.env.VITEST_RATE_LIMIT_REAL = '1';
        delete process.env.REDIS_URL;
        _resetRedisForTests();
        vi.resetModules();
    });

    afterEach(() => {
        vi.resetModules();
    });

    afterEach(() => {
        delete process.env.RATE_LIMIT_WINDOW_MS;
        delete process.env.RATE_LIMIT_MAX_REQUESTS;
        delete process.env.VITEST_RATE_LIMIT_REAL;
        delete process.env.REDIS_URL;
        _resetRedisForTests();
    });

    it('allows requests within the configured limit', async () => {
        process.env.RATE_LIMIT_WINDOW_MS = '60000';
        process.env.RATE_LIMIT_MAX_REQUESTS = '2';
        delete process.env.REDIS_URL;

        const rateLimiterModule = await import('./rateLimiter.js');
        const { server, url } = await createServer(rateLimiterModule);

        const first = await fetch(url);
        const second = await fetch(url);

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);

        await closeServer(server);
    });

    it('returns 429 after exceeding the configured limit', async () => {
        vi.resetModules();
        process.env.RATE_LIMIT_WINDOW_MS = '60000';
        process.env.RATE_LIMIT_MAX_REQUESTS = '1';
        delete process.env.REDIS_URL;

        const rateLimiterModule = await import('./rateLimiter.js');
        const { server, url } = await createServer(rateLimiterModule, true);

        const first = await fetch(url);
        const second = await fetch(url);

        expect(first.status).toBe(200);
        expect(second.status).toBe(429);
        expect(await second.json()).toEqual({
            error: {
                code: 'RATE_LIMIT_EXCEEDED',
                message: 'Too many requests, please try again later',
            },
        });

        await closeServer(server);
    });
});
