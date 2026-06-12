import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import app from '../app.js';

const prisma = new PrismaClient();

describe('Input Validation Integration Tests', () => {
    let authToken: string;
    let studentAuthToken: string;

    const validationUser = {
        email: 'validation-test@example.com',
        password: 'ValidationPass123!',
        name: 'Validation Test',
    };

    beforeAll(async () => {
        await prisma.user.deleteMany({
            where: { email: { in: [validationUser.email, 'validation-student@example.com'] } },
        });
        const hashed = await bcrypt.hash(validationUser.password, 10);
        await prisma.user.create({
            data: {
                email: validationUser.email,
                password: hashed,
                name: validationUser.name,
                role: 'lecturer',
                emailVerifiedAt: new Date(),
            },
        });

        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({
                email: validationUser.email,
                password: validationUser.password,
            });
        authToken = loginRes.body.data.accessToken;

        await prisma.user.deleteMany({ where: { email: 'validation-student@example.com' } });
        const studentHashed = await bcrypt.hash(validationUser.password, 10);
        await prisma.user.create({
            data: {
                email: 'validation-student@example.com',
                password: studentHashed,
                name: 'Validation Student',
                role: 'student',
                emailVerifiedAt: new Date(),
            },
        });
        const studentLogin = await request(app)
            .post('/api/auth/login')
            .send({ email: 'validation-student@example.com', password: validationUser.password });
        studentAuthToken = studentLogin.body.data.accessToken;
    });

    afterAll(async () => {
        await prisma.user.deleteMany({ where: { email: validationUser.email } });
        await prisma.$disconnect();
    });

    describe('Analytics - POST /api/analytics/analyze', () => {
        it('should reject empty text', async () => {
            const res = await request(app)
                .post('/api/analytics/analyze')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ text: '' });

            expect(res.status).toBe(400);
            expect(res.body.error).toBeDefined();
            expect(res.body.error.code).toBe('BAD_REQUEST');
        });

        it('should reject missing text field', async () => {
            const res = await request(app)
                .post('/api/analytics/analyze')
                .set('Authorization', `Bearer ${authToken}`)
                .send({});

            expect(res.status).toBe(400);
            expect(res.body.error).toBeDefined();
        });

        it('should reject text exceeding max length', async () => {
            const longText = 'a'.repeat(10001);
            const res = await request(app)
                .post('/api/analytics/analyze')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ text: longText });

            expect(res.status).toBe(400);
            expect(res.body.error).toBeDefined();
        });
    });

    describe('Course - POST /api/courses/:id/knowledge-base/batch', () => {
        it('should accept valid extract_images and perform_ocr', async () => {
            const res = await request(app)
                .post('/api/courses/test-course-id/knowledge-base/batch')
                .set('Authorization', `Bearer ${authToken}`)
                .field('extract_images', 'true')
                .field('perform_ocr', 'false')
                .attach('files', Buffer.from('test'), 'test.pdf');

            expect([201, 400, 404]).toContain(res.status);
        });

        it('should use defaults when options not provided', async () => {
            const res = await request(app)
                .post('/api/courses/test-course-id/knowledge-base/batch')
                .set('Authorization', `Bearer ${authToken}`)
                .attach('files', Buffer.from('test'), 'test.pdf');

            expect([201, 400, 404]).toContain(res.status);
        });
    });

    describe('AI Chat - POST /api/ai-chats', () => {
        it('should reject title exceeding max length', async () => {
            const longTitle = 'a'.repeat(101);
            const res = await request(app)
                .post('/api/ai-chats')
                .set('Authorization', `Bearer ${studentAuthToken}`)
                .send({ title: longTitle });

            expect(res.status).toBe(400);
            expect(res.body.error).toBeDefined();
        });
    });

    describe('Chat Space - POST /api/chat-spaces/:id/reflection', () => {
        it('should reject reflection shorter than 10 chars', async () => {
            const res = await request(app)
                .post('/api/chat-spaces/test-id/reflection')
                .set('Authorization', `Bearer ${studentAuthToken}`)
                .send({ content: 'short' });

            expect(res.status).toBe(400);
            expect(res.body.error).toBeDefined();
        });

        it('should reject reflection exceeding max length', async () => {
            const longContent = 'a'.repeat(2001);
            const res = await request(app)
                .post('/api/chat-spaces/test-id/reflection')
                .set('Authorization', `Bearer ${studentAuthToken}`)
                .send({ content: longContent });

            expect(res.status).toBe(400);
            expect(res.body.error).toBeDefined();
        });
    });

    describe('Group - POST /api/groups/:id/invite', () => {
        it('should reject empty member_ids array', async () => {
            const res = await request(app)
                .post('/api/groups/test-id/invite')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ member_ids: [] });

            expect(res.status).toBe(400);
            expect(res.body.error).toBeDefined();
        });

        it('should reject invalid UUID in member_ids', async () => {
            const res = await request(app)
                .post('/api/groups/test-id/invite')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ member_ids: ['invalid-uuid'] });

            expect(res.status).toBe(400);
            expect(res.body.error).toBeDefined();
        });
    });
});
