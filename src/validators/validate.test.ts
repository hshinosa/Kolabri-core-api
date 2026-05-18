import http from 'node:http';
import express from 'express';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { validateBody } from './validate.js';
import { errorHandler } from '../middleware/errorHandler.js';

const testSchema = z.object({
    email: z.string().email('Invalid email'),
    name: z.string().min(2, 'Name too short'),
});

async function post(body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
    const app = express();
    app.use(express.json());
    app.post('/test', validateBody(testSchema), (_req, res) => res.json({ ok: true }));
    app.use(errorHandler);

    const server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as { port: number };

    const res = await fetch(`http://127.0.0.1:${addr.port}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const json = await res.json() as Record<string, unknown>;
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    return { status: res.status, body: json };
}

describe('validateBody', () => {
    it('passes valid body to handler', async () => {
        const { status, body } = await post({ email: 'user@example.com', name: 'Alice' });
        expect(status).toBe(200);
        expect(body).toEqual({ ok: true });
    });

    it('returns 400 with standardized details array for invalid body', async () => {
        const { status, body } = await post({ email: 'not-an-email', name: 'A' });
        expect(status).toBe(400);
        const error = body.error as Record<string, unknown>;
        expect(error.code).toBe('BAD_REQUEST');
        expect(error.message).toBe('Validation failed');
        expect(Array.isArray(error.details)).toBe(true);
    });

    it('returns field name in details for missing required field', async () => {
        const { status, body } = await post({ name: 'Alice' });
        expect(status).toBe(400);
        const error = body.error as Record<string, unknown>;
        const details = error.details as Array<{ field: string; message: string }>;
        expect(details.some(d => d.field === 'email')).toBe(true);
    });

    it('returns 400 for empty body', async () => {
        const { status } = await post({});
        expect(status).toBe(400);
    });
});
