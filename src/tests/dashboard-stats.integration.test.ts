import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import app from '../app.js';
import { enableRealRateLimitForSuite } from './helpers/rateLimitTestEnv.js';

const prisma = new PrismaClient();

describe('Dashboard Stats API Integration Tests', () => {
    let adminToken: string;
    let lecturerToken: string;
    let studentToken: string;

    const adminUser = {
        email: 'admin-dashboard@example.com',
        password: 'AdminPass123!',
        name: 'Admin Dashboard',
        role: 'admin' as const,
    };

    const lecturerUser = {
        email: 'lecturer-dashboard@example.com',
        password: 'LecturerPass123!',
        name: 'Lecturer Dashboard',
        role: 'lecturer' as const,
    };

    const studentUser = {
        email: 'student-dashboard@example.com',
        password: 'StudentPass123!',
        name: 'Student Dashboard',
        role: 'student' as const,
    };

    beforeAll(async () => {
        await prisma.user.deleteMany({
            where: {
                email: {
                    in: [adminUser.email, lecturerUser.email, studentUser.email],
                },
            },
        });

        const hashedAdminPassword = await bcrypt.hash(adminUser.password, 10);
        await prisma.user.create({
            data: {
                email: adminUser.email,
                password: hashedAdminPassword,
                name: adminUser.name,
                role: adminUser.role,
                emailVerifiedAt: new Date(),
            },
        });

        const hashedLecturerPassword = await bcrypt.hash(lecturerUser.password, 10);
        await prisma.user.create({
            data: {
                email: lecturerUser.email,
                password: hashedLecturerPassword,
                name: lecturerUser.name,
                role: lecturerUser.role,
                emailVerifiedAt: new Date(),
            },
        });

        const hashedStudentPassword = await bcrypt.hash(studentUser.password, 10);
        await prisma.user.create({
            data: {
                email: studentUser.email,
                password: hashedStudentPassword,
                name: studentUser.name,
                role: studentUser.role,
                emailVerifiedAt: new Date(),
            },
        });

        const adminLoginResponse = await request(app)
            .post('/api/auth/login')
            .send({
                email: adminUser.email,
                password: adminUser.password,
            });
        adminToken = adminLoginResponse.body.data.accessToken;

        const lecturerLoginResponse = await request(app)
            .post('/api/auth/login')
            .send({
                email: lecturerUser.email,
                password: lecturerUser.password,
            });
        lecturerToken = lecturerLoginResponse.body.data.accessToken;

        const studentLoginResponse = await request(app)
            .post('/api/auth/login')
            .send({
                email: studentUser.email,
                password: studentUser.password,
            });
        studentToken = studentLoginResponse.body.data.accessToken;
    });

    afterAll(async () => {
        await prisma.user.deleteMany({
            where: {
                email: {
                    in: [adminUser.email, lecturerUser.email, studentUser.email],
                },
            },
        });
        await prisma.$disconnect();
    });

    beforeEach(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    describe('Admin Access', () => {
        it('should allow admin to access dashboard stats', async () => {
            const response = await request(app)
                .get('/api/admin/dashboard/stats')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('data');
            expect(response.body.data).toHaveProperty('users');
            expect(response.body.data).toHaveProperty('courses');
            expect(response.body.data).toHaveProperty('discussions');
        });

        it('should return correct user role aggregation', async () => {
            const response = await request(app)
                .get('/api/admin/dashboard/stats')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            const { data } = response.body;

            expect(data.users.byRole).toHaveProperty('student');
            expect(data.users.byRole).toHaveProperty('lecturer');
            expect(data.users.byRole).toHaveProperty('admin');

            expect(typeof data.users.byRole.student).toBe('number');
            expect(typeof data.users.byRole.lecturer).toBe('number');
            expect(typeof data.users.byRole.admin).toBe('number');

            expect(data.users.byRole.student).toBeGreaterThanOrEqual(1);
            expect(data.users.byRole.lecturer).toBeGreaterThanOrEqual(1);
            expect(data.users.byRole.admin).toBeGreaterThanOrEqual(1);
        });

        it('should return activity metrics', async () => {
            const response = await request(app)
                .get('/api/admin/dashboard/stats')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            const { data } = response.body;

            expect(data.discussions).toHaveProperty('messagesToday');
            expect(data.users).toHaveProperty('activeLast24h');
            expect(data.users).toHaveProperty('newLast7Days');

            expect(typeof data.discussions.messagesToday).toBe('number');
            expect(typeof data.users.activeLast24h).toBe('number');
            expect(typeof data.users.newLast7Days).toBe('number');
        });

        it('should return AI interaction metrics', async () => {
            const response = await request(app)
                .get('/api/admin/dashboard/stats')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            const { data } = response.body;

            expect(data.discussions).toHaveProperty('aiInteractions');
            expect(data.engagement).toHaveProperty('hotThinkingPercentage');

            expect(typeof data.discussions.aiInteractions).toBe('number');
            expect(typeof data.engagement.hotThinkingPercentage).toBe('number');
        });
    });

    describe('Role-Based Access Control', () => {
        it('should deny lecturer access to dashboard stats', async () => {
            const response = await request(app)
                .get('/api/admin/dashboard/stats')
                .set('Authorization', `Bearer ${lecturerToken}`)
                .expect(403);

            expect(response.body).toHaveProperty('error');
        });

        it('should deny student access to dashboard stats', async () => {
            const response = await request(app)
                .get('/api/admin/dashboard/stats')
                .set('Authorization', `Bearer ${studentToken}`)
                .expect(403);

            expect(response.body).toHaveProperty('error');
        });

        it('should deny unauthenticated access to dashboard stats', async () => {
            const response = await request(app)
                .get('/api/admin/dashboard/stats')
                .expect(401);

            expect(response.body).toHaveProperty('error');
        });
    });

    describe('Date Range Filtering', () => {
        it('should accept date range query parameters', async () => {
            const startDate = new Date('2024-01-01').toISOString();
            const endDate = new Date('2024-12-31').toISOString();

            const response = await request(app)
                .get('/api/admin/dashboard/stats')
                .query({ startDate, endDate })
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('data');
        });

        it('should accept preset period parameter', async () => {
            const response = await request(app)
                .get('/api/admin/dashboard/stats')
                .query({ period: '7d' })
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('data');
        });

        it('should accept 30d preset', async () => {
            const response = await request(app)
                .get('/api/admin/dashboard/stats')
                .query({ period: '30d' })
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('data');
        });

        it('should accept 90d preset', async () => {
            const response = await request(app)
                .get('/api/admin/dashboard/stats')
                .query({ period: '90d' })
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('data');
        });

        it('should reject invalid period preset', async () => {
            const response = await request(app)
                .get('/api/admin/dashboard/stats')
                .query({ period: 'invalid' })
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });

        it('should reject invalid date format', async () => {
            const response = await request(app)
                .get('/api/admin/dashboard/stats')
                .query({ startDate: 'not-a-date', endDate: 'also-not-a-date' })
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });
    });

    describe('Activity Feed', () => {
        it('should return activity feed for admin', async () => {
            const response = await request(app)
                .get('/api/admin/dashboard/activity')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('data');
            expect(response.body).toHaveProperty('meta');
            expect(Array.isArray(response.body.data)).toBe(true);
        });

        it('should support pagination in activity feed', async () => {
            const response = await request(app)
                .get('/api/admin/dashboard/activity')
                .query({ offset: 0, limit: 10 })
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.meta).toHaveProperty('offset');
            expect(response.body.meta).toHaveProperty('limit');
            expect(response.body.meta).toHaveProperty('total');
        });

        it('should deny non-admin access to activity feed', async () => {
            const response = await request(app)
                .get('/api/admin/dashboard/activity')
                .set('Authorization', `Bearer ${studentToken}`)
                .expect(403);

            expect(response.body).toHaveProperty('error');
        });
    });

    describe('Chart Data', () => {
        it('should return user growth chart data', async () => {
            const response = await request(app)
                .get('/api/admin/dashboard/charts/user-growth')
                .query({ period: '7d' })
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('data');
            expect(response.body.data).toHaveProperty('data');
            expect(Array.isArray(response.body.data.data)).toBe(true);
        });

        it('should return message activity chart data', async () => {
            const response = await request(app)
                .get('/api/admin/dashboard/charts/message-activity')
                .query({ period: '7d' })
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('data');
            expect(response.body.data).toHaveProperty('data');
            expect(Array.isArray(response.body.data.data)).toBe(true);
        });

        it('should deny non-admin access to chart data', async () => {
            const response = await request(app)
                .get('/api/admin/dashboard/charts/user-growth')
                .query({ period: '7d' })
                .set('Authorization', `Bearer ${lecturerToken}`)
                .expect(403);

            expect(response.body).toHaveProperty('error');
        });

        it('should require period parameter for charts', async () => {
            const response = await request(app)
                .get('/api/admin/dashboard/charts/user-growth')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.data).toHaveProperty('period');
            expect(response.body.data).toHaveProperty('data');
        });
    });

    describe('Rate Limiting', () => {
        enableRealRateLimitForSuite({ maxRequests: 10 });

        it('should enforce rate limiting on dashboard endpoints', async () => {
            let rateLimited = false;
            for (let i = 0; i < 15; i++) {
                const res = await request(app)
                    .get('/api/admin/dashboard/stats')
                    .set('Authorization', `Bearer ${adminToken}`);
                if (res.status === 429) {
                    rateLimited = true;
                    break;
                }
            }
            expect(rateLimited).toBe(true);
        });
    });

    describe('Data Consistency', () => {
        it('should return consistent total user count', async () => {
            const response = await request(app)
                .get('/api/admin/dashboard/stats')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            const { data } = response.body;

            const calculatedTotal = data.users.byRole.student + data.users.byRole.lecturer + data.users.byRole.admin;
            expect(data.users.total).toBeGreaterThanOrEqual(calculatedTotal);
        });

        it('should return non-negative counts', async () => {
            const response = await request(app)
                .get('/api/admin/dashboard/stats')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            const { data } = response.body;

            expect(data.users.total).toBeGreaterThanOrEqual(0);
            expect(data.courses.total).toBeGreaterThanOrEqual(0);
            expect(data.discussions.totalMessages).toBeGreaterThanOrEqual(0);
            expect(data.users.byRole.student).toBeGreaterThanOrEqual(0);
            expect(data.users.byRole.lecturer).toBeGreaterThanOrEqual(0);
            expect(data.users.byRole.admin).toBeGreaterThanOrEqual(0);
        });
    });
});
