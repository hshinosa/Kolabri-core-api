import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import app from '../app.js';

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
                .get('/api/dashboard/stats')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('data');
            expect(response.body.data).toHaveProperty('totalUsers');
            expect(response.body.data).toHaveProperty('totalCourses');
            expect(response.body.data).toHaveProperty('totalMessages');
        });

        it('should return correct user role aggregation', async () => {
            const response = await request(app)
                .get('/api/dashboard/stats')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            const { data } = response.body;

            expect(data).toHaveProperty('studentUsers');
            expect(data).toHaveProperty('lecturerUsers');
            expect(data).toHaveProperty('adminUsers');

            expect(typeof data.studentUsers).toBe('number');
            expect(typeof data.lecturerUsers).toBe('number');
            expect(typeof data.adminUsers).toBe('number');

            expect(data.studentUsers).toBeGreaterThanOrEqual(1);
            expect(data.lecturerUsers).toBeGreaterThanOrEqual(1);
            expect(data.adminUsers).toBeGreaterThanOrEqual(1);
        });

        it('should return activity metrics', async () => {
            const response = await request(app)
                .get('/api/dashboard/stats')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            const { data } = response.body;

            expect(data).toHaveProperty('messagesToday');
            expect(data).toHaveProperty('activeUsers');
            expect(data).toHaveProperty('newUsersThisWeek');

            expect(typeof data.messagesToday).toBe('number');
            expect(typeof data.activeUsers).toBe('number');
            expect(typeof data.newUsersThisWeek).toBe('number');
        });

        it('should return AI interaction metrics', async () => {
            const response = await request(app)
                .get('/api/dashboard/stats')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            const { data } = response.body;

            expect(data).toHaveProperty('aiInteractions');
            expect(data).toHaveProperty('hotQuestions');

            expect(typeof data.aiInteractions).toBe('number');
            expect(typeof data.hotQuestions).toBe('number');
        });
    });

    describe('Role-Based Access Control', () => {
        it('should deny lecturer access to dashboard stats', async () => {
            const response = await request(app)
                .get('/api/dashboard/stats')
                .set('Authorization', `Bearer ${lecturerToken}`)
                .expect(403);

            expect(response.body).toHaveProperty('error');
        });

        it('should deny student access to dashboard stats', async () => {
            const response = await request(app)
                .get('/api/dashboard/stats')
                .set('Authorization', `Bearer ${studentToken}`)
                .expect(403);

            expect(response.body).toHaveProperty('error');
        });

        it('should deny unauthenticated access to dashboard stats', async () => {
            const response = await request(app)
                .get('/api/dashboard/stats')
                .expect(401);

            expect(response.body).toHaveProperty('error');
        });
    });

    describe('Date Range Filtering', () => {
        it('should accept date range query parameters', async () => {
            const startDate = new Date('2024-01-01').toISOString();
            const endDate = new Date('2024-12-31').toISOString();

            const response = await request(app)
                .get('/api/dashboard/stats')
                .query({ startDate, endDate })
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('data');
        });

        it('should accept preset period parameter', async () => {
            const response = await request(app)
                .get('/api/dashboard/stats')
                .query({ period: '7d' })
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('data');
        });

        it('should accept 30d preset', async () => {
            const response = await request(app)
                .get('/api/dashboard/stats')
                .query({ period: '30d' })
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('data');
        });

        it('should accept 90d preset', async () => {
            const response = await request(app)
                .get('/api/dashboard/stats')
                .query({ period: '90d' })
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('data');
        });

        it('should reject invalid period preset', async () => {
            const response = await request(app)
                .get('/api/dashboard/stats')
                .query({ period: 'invalid' })
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });

        it('should reject invalid date format', async () => {
            const response = await request(app)
                .get('/api/dashboard/stats')
                .query({ startDate: 'not-a-date', endDate: 'also-not-a-date' })
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });
    });

    describe('Activity Feed', () => {
        it('should return activity feed for admin', async () => {
            const response = await request(app)
                .get('/api/dashboard/activity')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('data');
            expect(response.body).toHaveProperty('meta');
            expect(Array.isArray(response.body.data)).toBe(true);
        });

        it('should support pagination in activity feed', async () => {
            const response = await request(app)
                .get('/api/dashboard/activity')
                .query({ page: 1, limit: 10 })
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.meta).toHaveProperty('page');
            expect(response.body.meta).toHaveProperty('limit');
            expect(response.body.meta).toHaveProperty('total');
        });

        it('should deny non-admin access to activity feed', async () => {
            const response = await request(app)
                .get('/api/dashboard/activity')
                .set('Authorization', `Bearer ${studentToken}`)
                .expect(403);

            expect(response.body).toHaveProperty('error');
        });
    });

    describe('Chart Data', () => {
        it('should return user growth chart data', async () => {
            const response = await request(app)
                .get('/api/dashboard/charts/user-growth')
                .query({ period: '7d' })
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('data');
            expect(Array.isArray(response.body.data)).toBe(true);
        });

        it('should return message activity chart data', async () => {
            const response = await request(app)
                .get('/api/dashboard/charts/message-activity')
                .query({ period: '7d' })
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('data');
            expect(Array.isArray(response.body.data)).toBe(true);
        });

        it('should deny non-admin access to chart data', async () => {
            const response = await request(app)
                .get('/api/dashboard/charts/user-growth')
                .query({ period: '7d' })
                .set('Authorization', `Bearer ${lecturerToken}`)
                .expect(403);

            expect(response.body).toHaveProperty('error');
        });

        it('should require period parameter for charts', async () => {
            const response = await request(app)
                .get('/api/dashboard/charts/user-growth')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });
    });

    describe('Rate Limiting', () => {
        it('should enforce rate limiting on dashboard endpoints', async () => {
            const attempts = [];
            for (let i = 0; i < 12; i++) {
                attempts.push(
                    request(app)
                        .get('/api/dashboard/stats')
                        .set('Authorization', `Bearer ${adminToken}`)
                );
            }

            const responses = await Promise.all(attempts);

            const rateLimited = responses.some(r => r.status === 429);
            expect(rateLimited).toBe(true);
        });
    });

    describe('Data Consistency', () => {
        it('should return consistent total user count', async () => {
            const response = await request(app)
                .get('/api/dashboard/stats')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            const { data } = response.body;

            const calculatedTotal = data.studentUsers + data.lecturerUsers + data.adminUsers;
            expect(data.totalUsers).toBeGreaterThanOrEqual(calculatedTotal);
        });

        it('should return non-negative counts', async () => {
            const response = await request(app)
                .get('/api/dashboard/stats')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            const { data } = response.body;

            expect(data.totalUsers).toBeGreaterThanOrEqual(0);
            expect(data.totalCourses).toBeGreaterThanOrEqual(0);
            expect(data.totalMessages).toBeGreaterThanOrEqual(0);
            expect(data.studentUsers).toBeGreaterThanOrEqual(0);
            expect(data.lecturerUsers).toBeGreaterThanOrEqual(0);
            expect(data.adminUsers).toBeGreaterThanOrEqual(0);
        });
    });
});
