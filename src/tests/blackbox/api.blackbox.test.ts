import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import app from '../../app.js';

type TestRole = 'student' | 'lecturer' | 'admin';

function createToken(role: TestRole) {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
        throw new Error('JWT_SECRET must be configured for black-box tests');
    }

    return jwt.sign(
        {
            userId: `${role}-user-id`,
            email: `${role}@example.com`,
            role,
        },
        secret,
        { expiresIn: '1h' }
    );
}

describe('Black-box API Tests', () => {
    let lecturerToken: string;
    let studentToken: string;

    beforeAll(() => {
        process.env.JWT_SECRET = process.env.JWT_SECRET || 'blackbox-test-secret';
        lecturerToken = createToken('lecturer');
        studentToken = createToken('student');
    });

    afterAll(() => {
        if (process.env.JWT_SECRET === 'blackbox-test-secret') {
            delete process.env.JWT_SECRET;
        }
    });

    describe('Health', () => {
        it('GET /api/health returns 200 with status', async () => {
            const res = await request(app).get('/api/health');

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('status');
            expect(typeof res.body.status).toBe('string');
            expect(res.body).toHaveProperty('services');
        });

        it('GET /health returns 200 with status', async () => {
            const res = await request(app).get('/health');

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('status');
        });
    });

    describe('Auth rejection', () => {
        it('GET /api/courses without token returns 401', async () => {
            const res = await request(app).get('/api/courses');

            expect(res.status).toBe(401);
            expect(res.body.error?.code).toBe('UNAUTHORIZED');
        });

        it('POST /api/courses without token returns 401', async () => {
            const res = await request(app).post('/api/courses').send({});

            expect(res.status).toBe(401);
        });

        it('GET /api/groups without token returns 401', async () => {
            const res = await request(app).get('/api/groups');

            expect(res.status).toBe(401);
        });

        it('POST /api/groups without token returns 401', async () => {
            const res = await request(app).post('/api/groups').send({});

            expect(res.status).toBe(401);
        });

        it('POST /api/ai-chat without token returns 401', async () => {
            const res = await request(app).post('/api/ai-chat').send({});

            expect(res.status).toBe(401);
        });

        it('GET /api/analytics/dashboard without token returns 401', async () => {
            const res = await request(app).get('/api/analytics/dashboard');

            expect(res.status).toBe(401);
        });

        it('GET /api/goals without token returns 401', async () => {
            const res = await request(app).get('/api/goals');

            expect(res.status).toBe(401);
        });

        it('GET /api/auth/me without token returns 401', async () => {
            const res = await request(app).get('/api/auth/me');

            expect(res.status).toBe(401);
        });
    });

    describe('Auth endpoints', () => {
        it('POST /api/auth/login with empty body returns validation error', async () => {
            const res = await request(app).post('/api/auth/login').send({});

            expect([400, 422]).toContain(res.status);
            expect(res.body.error?.code).toBe('BAD_REQUEST');
        });

        it('POST /api/auth/register with empty body returns validation error', async () => {
            const res = await request(app).post('/api/auth/register').send({});

            expect([400, 422]).toContain(res.status);
            expect(res.body.error?.code).toBe('BAD_REQUEST');
        });

        it('POST /api/auth/login with malformed email returns validation error', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'not-an-email', password: 'secret123' });

            expect([400, 422]).toContain(res.status);
        });

        it('POST /api/auth/register with malformed email returns validation error', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({ name: 'Test User', email: 'bad-email', password: 'secret123', role: 'student' });

            expect([400, 422]).toContain(res.status);
        });

        it('POST /api/auth/login with invalid credentials returns handled error response', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: 'missing@example.com', password: 'wrong-password' });

            expect([400, 401, 500]).toContain(res.status);
            expect(res.body).not.toBeNull();
        });

        it('POST /api/auth/refresh without refresh token returns 400', async () => {
            const res = await request(app).post('/api/auth/refresh').send({});

            expect(res.status).toBe(400);
            expect(res.body.error?.code).toBe('BAD_REQUEST');
        });

        it('POST /api/auth/logout without refresh token returns 400', async () => {
            const res = await request(app).post('/api/auth/logout').send({});

            expect(res.status).toBe(400);
            expect(res.body.error?.code).toBe('BAD_REQUEST');
        });
    });

    describe('Request validation with valid JWT', () => {
        it('POST /api/courses with empty body returns 400', async () => {
            const res = await request(app)
                .post('/api/courses')
                .set('Authorization', `Bearer ${lecturerToken}`)
                .send({});

            expect(res.status).toBe(400);
            expect(res.body.error?.code).toBe('BAD_REQUEST');
        });

        it('POST /api/courses with invalid payload returns 400', async () => {
            const res = await request(app)
                .post('/api/courses')
                .set('Authorization', `Bearer ${lecturerToken}`)
                .send({ code: 'A', name: 'Hi' });

            expect(res.status).toBe(400);
        });

        it('POST /api/courses with student token returns 403 before controller work', async () => {
            const res = await request(app)
                .post('/api/courses')
                .set('Authorization', `Bearer ${studentToken}`)
                .send({});

            expect(res.status).toBe(403);
            expect(res.body.error?.code).toBe('FORBIDDEN');
        });

        it('POST /api/groups with empty body returns 400', async () => {
            const res = await request(app)
                .post('/api/groups')
                .set('Authorization', `Bearer ${studentToken}`)
                .send({});

            expect(res.status).toBe(400);
        });

        it('POST /api/groups with invalid payload returns 400', async () => {
            const res = await request(app)
                .post('/api/groups')
                .set('Authorization', `Bearer ${studentToken}`)
                .send({ courseId: 'not-a-uuid', name: 'A' });

            expect(res.status).toBe(400);
        });

        it('POST /api/groups/join with empty body returns 400', async () => {
            const res = await request(app)
                .post('/api/groups/join')
                .set('Authorization', `Bearer ${studentToken}`)
                .send({});

            expect(res.status).toBe(400);
        });

        it('POST /api/goals with empty body returns 400', async () => {
            const res = await request(app)
                .post('/api/goals')
                .set('Authorization', `Bearer ${studentToken}`)
                .send({});

            expect(res.status).toBe(400);
        });

        it('POST /api/goals with invalid payload returns 400', async () => {
            const res = await request(app)
                .post('/api/goals')
                .set('Authorization', `Bearer ${studentToken}`)
                .send({ chat_space_id: 'not-a-uuid', content: 'short goal' });

            expect(res.status).toBe(400);
        });

        it('POST /api/goals with lecturer token returns 403 before validation', async () => {
            const res = await request(app)
                .post('/api/goals')
                .set('Authorization', `Bearer ${lecturerToken}`)
                .send({});

            expect(res.status).toBe(403);
            expect(res.body.error?.code).toBe('FORBIDDEN');
        });
    });

    describe('Rate limiting', () => {
        it('rapid auth requests eventually get 429', async () => {
            const statuses: number[] = [];

            for (let attempt = 0; attempt < 60; attempt += 1) {
                const res = await request(app).post('/api/auth/login').send({});
                statuses.push(res.status);
            }

            expect(statuses).toContain(429);
        });

        it('rapid general requests eventually get 429', async () => {
            const statuses: number[] = [];

            for (let attempt = 0; attempt < 110; attempt += 1) {
                const res = await request(app).get('/api/health');
                statuses.push(res.status);
            }

            expect(statuses).toContain(429);
        });
    });
});
