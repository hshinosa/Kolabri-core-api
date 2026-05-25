import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../app.js';

const prisma = new PrismaClient();

describe('E2E Auth Flow Integration Tests', () => {
    const testEmail = 'e2e-auth@example.com';
    const testPassword = 'E2EPassword123!';
    const testName = 'E2E Test User';
    let userId: string;

    afterAll(async () => {
        await prisma.user.deleteMany({
            where: { email: testEmail },
        });
        await prisma.$disconnect();
    });

    describe('Complete Auth Flow: Register → Verify → Login → Dashboard', () => {
        let accessToken: string;
        let refreshToken: string;

        it('Step 1: Register new user', async () => {
            const response = await request(app)
                .post('/api/auth/register')
                .send({
                    name: testName,
                    email: testEmail,
                    password: testPassword,
                    role: 'student',
                })
                .expect(201);

            expect(response.body.data).toHaveProperty('id');
            expect(response.body.data.email).toBe(testEmail);
            expect(response.body.data.name).toBe(testName);
            expect(response.body.data.role).toBe('student');
            expect(response.body.data).not.toHaveProperty('password');

            userId = response.body.data.id;
        });

        it('Step 2: Verify user cannot login without email verification', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: testEmail,
                    password: testPassword,
                });

            expect([401, 403]).toContain(response.status);
        });

        it('Step 3: Manually verify email (simulating email verification)', async () => {
            await prisma.user.update({
                where: { id: userId },
                data: { emailVerifiedAt: new Date() },
            });

            const user = await prisma.user.findUnique({
                where: { id: userId },
            });

            expect(user?.emailVerifiedAt).toBe(true);
        });

        it('Step 4: Login with verified account', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: testEmail,
                    password: testPassword,
                })
                .expect(200);

            expect(response.body.data).toHaveProperty('accessToken');
            expect(response.body.data).toHaveProperty('refreshToken');
            expect(response.body.data.user.email).toBe(testEmail);

            accessToken = response.body.data.accessToken;
            refreshToken = response.body.data.refreshToken;
        });

        it('Step 5: Access protected profile endpoint', async () => {
            const response = await request(app)
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);

            expect(response.body.data.email).toBe(testEmail);
            expect(response.body.data.name).toBe(testName);
            expect(response.body.data.role).toBe('student');
        });

        it('Step 6: Verify student cannot access admin dashboard', async () => {
            const response = await request(app)
                .get('/api/dashboard/stats')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(403);

            expect(response.body).toHaveProperty('error');
        });

        it('Step 7: Refresh access token', async () => {
            const response = await request(app)
                .post('/api/auth/refresh')
                .send({ refreshToken })
                .expect(200);

            expect(response.body.data).toHaveProperty('accessToken');
            expect(response.body.data.accessToken).not.toBe(accessToken);

            accessToken = response.body.data.accessToken;
        });

        it('Step 8: Use new access token to access profile', async () => {
            const response = await request(app)
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);

            expect(response.body.data.email).toBe(testEmail);
        });

        it('Step 9: Logout and invalidate refresh token', async () => {
            await request(app)
                .post('/api/auth/logout')
                .send({ refreshToken })
                .expect(200);

            const refreshResponse = await request(app)
                .post('/api/auth/refresh')
                .send({ refreshToken })
                .expect(401);

            expect(refreshResponse.body).toHaveProperty('error');
        });

        it('Step 10: Access token still works until expiry', async () => {
            const response = await request(app)
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);

            expect(response.body.data.email).toBe(testEmail);
        });
    });

    describe('Complete Admin Flow: Register → Verify → Login → Dashboard Access', () => {
        const adminEmail = 'e2e-admin@example.com';
        const adminPassword = 'AdminE2E123!';
        const adminName = 'E2E Admin User';
        let adminId: string;
        let adminToken: string;

        afterAll(async () => {
            await prisma.user.deleteMany({
                where: { email: adminEmail },
            });
        });

        it('Step 1: Create admin user', async () => {
            const response = await request(app)
                .post('/api/auth/register')
                .send({
                    name: adminName,
                    email: adminEmail,
                    password: adminPassword,
                    role: 'admin',
                })
                .expect(201);

            adminId = response.body.data.id;
        });

        it('Step 2: Verify admin email', async () => {
            await prisma.user.update({
                where: { id: adminId },
                data: { emailVerifiedAt: new Date() },
            });
        });

        it('Step 3: Login as admin', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: adminEmail,
                    password: adminPassword,
                })
                .expect(200);

            adminToken = response.body.data.accessToken;
        });

        it('Step 4: Access admin dashboard', async () => {
            const response = await request(app)
                .get('/api/dashboard/stats')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.data).toHaveProperty('totalUsers');
            expect(response.body.data).toHaveProperty('totalCourses');
            expect(response.body.data).toHaveProperty('totalMessages');
        });

        it('Step 5: Access user management endpoints', async () => {
            const response = await request(app)
                .get('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('data');
            expect(Array.isArray(response.body.data)).toBe(true);
        });

        it('Step 6: Admin can view other user profiles', async () => {
            const response = await request(app)
                .get(`/api/users/${userId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.data.email).toBe(testEmail);
        });
    });

    describe('Complete Lecturer Flow: Register → Verify → Login', () => {
        const lecturerEmail = 'e2e-lecturer@example.com';
        const lecturerPassword = 'LecturerE2E123!';
        const lecturerName = 'E2E Lecturer User';
        let lecturerId: string;
        let lecturerToken: string;

        afterAll(async () => {
            await prisma.user.deleteMany({
                where: { email: lecturerEmail },
            });
        });

        it('Step 1: Register as lecturer', async () => {
            const response = await request(app)
                .post('/api/auth/register')
                .send({
                    name: lecturerName,
                    email: lecturerEmail,
                    password: lecturerPassword,
                    role: 'lecturer',
                })
                .expect(201);

            expect(response.body.data.role).toBe('lecturer');
            lecturerId = response.body.data.id;
        });

        it('Step 2: Verify lecturer email', async () => {
            await prisma.user.update({
                where: { id: lecturerId },
                data: { emailVerifiedAt: new Date() },
            });
        });

        it('Step 3: Login as lecturer', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: lecturerEmail,
                    password: lecturerPassword,
                })
                .expect(200);

            lecturerToken = response.body.data.accessToken;
        });

        it('Step 4: Lecturer can access own profile', async () => {
            const response = await request(app)
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${lecturerToken}`)
                .expect(200);

            expect(response.body.data.email).toBe(lecturerEmail);
            expect(response.body.data.role).toBe('lecturer');
        });

        it('Step 5: Lecturer cannot access admin dashboard', async () => {
            const response = await request(app)
                .get('/api/dashboard/stats')
                .set('Authorization', `Bearer ${lecturerToken}`)
                .expect(403);

            expect(response.body).toHaveProperty('error');
        });

        it('Step 6: Lecturer cannot access user management', async () => {
            const response = await request(app)
                .get('/api/users')
                .set('Authorization', `Bearer ${lecturerToken}`)
                .expect(403);

            expect(response.body).toHaveProperty('error');
        });
    });

    describe('Error Recovery Flows', () => {
        it('Should handle login with wrong password gracefully', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: testEmail,
                    password: 'WrongPassword123!',
                })
                .expect(401);

            expect(response.body).toHaveProperty('error');
        });

        it('Should handle registration with existing email', async () => {
            const response = await request(app)
                .post('/api/auth/register')
                .send({
                    name: 'Duplicate User',
                    email: testEmail,
                    password: 'AnotherPass123!',
                })
                .expect(409);

            expect(response.body).toHaveProperty('error');
        });

        it('Should handle invalid token gracefully', async () => {
            const response = await request(app)
                .get('/api/auth/me')
                .set('Authorization', 'Bearer invalid-token')
                .expect(401);

            expect(response.body).toHaveProperty('error');
        });

        it('Should handle missing token gracefully', async () => {
            const response = await request(app)
                .get('/api/auth/me')
                .expect(401);

            expect(response.body).toHaveProperty('error');
        });
    });
});
