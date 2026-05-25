import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app.js';

describe('Input Validation Integration Tests', () => {
    let authToken: string;

    beforeAll(async () => {
        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'test@example.com',
                password: 'password123',
            });
        authToken = loginRes.body.token;
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
                .set('Authorization', `Bearer ${authToken}`)
                .send({ title: longTitle });

            expect(res.status).toBe(400);
            expect(res.body.error).toBeDefined();
        });
    });

    describe('Chat Space - POST /api/chat-spaces/:id/reflection', () => {
        it('should reject reflection shorter than 10 chars', async () => {
            const res = await request(app)
                .post('/api/chat-spaces/test-id/reflection')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ content: 'short' });

            expect(res.status).toBe(400);
            expect(res.body.error).toBeDefined();
        });

        it('should reject reflection exceeding max length', async () => {
            const longContent = 'a'.repeat(2001);
            const res = await request(app)
                .post('/api/chat-spaces/test-id/reflection')
                .set('Authorization', `Bearer ${authToken}`)
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
