import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import app from '../app.js';
import { enableRealRateLimitForSuite } from './helpers/rateLimitTestEnv.js';

const prisma = new PrismaClient();

// Probe Postgres once at collection so this suite reports SKIP (not fail)
// when the local database is not running.
let databaseReady = false;
try {
    await prisma.$queryRaw`SELECT 1`;
    databaseReady = true;
} catch {
    databaseReady = false;
}

describe.skipIf(!databaseReady)('Password Reset Flow Integration Tests', () => {
    let adminToken: string;
    let testUserId: string;
    const testUser = {
        email: 'resettest@example.com',
        password: 'OldPassword123!',
        name: 'Reset Test User',
        role: 'student' as const,
    };

    const adminUser = {
        email: 'admin-reset@example.com',
        password: 'AdminPass123!',
        name: 'Admin Reset Test',
        role: 'admin' as const,
    };

    beforeAll(async () => {
        await prisma.user.deleteMany({
            where: {
                email: {
                    in: [testUser.email, adminUser.email],
                },
            },
        });

        const hashedPassword = await bcrypt.hash(testUser.password, 10);
        const createdUser = await prisma.user.create({
            data: {
                email: testUser.email,
                password: hashedPassword,
                name: testUser.name,
                role: testUser.role,
                emailVerifiedAt: new Date(),
            },
        });
        testUserId = createdUser.id;

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

        const loginResponse = await request(app)
            .post('/api/auth/login')
            .send({
                email: adminUser.email,
                password: adminUser.password,
            });

        adminToken = loginResponse.body.data.accessToken;
    });

    afterAll(async () => {
        await prisma.user.deleteMany({
            where: {
                email: {
                    in: [testUser.email, adminUser.email],
                },
            },
        });
        await prisma.$disconnect();
    });

    beforeEach(async () => {
        const hashed = await bcrypt.hash(testUser.password, 10);
        await prisma.user.update({
            where: { id: testUserId },
            data: { password: hashed, deletedAt: null, isActive: true },
        });
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    describe('Admin Password Reset', () => {
        it('should allow admin to reset user password', async () => {
            const newPassword = 'NewPassword123!';

            const response = await request(app)
                .post(`/api/admin/users/${testUserId}/reset-password`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    newPassword,
                })
                .expect(200);

            expect(response.body.meta.message).toMatch(/password.*reset/i);

            const loginResponse = await request(app)
                .post('/api/auth/login')
                .send({
                    email: testUser.email,
                    password: newPassword,
                })
                .expect(200);

            expect(loginResponse.body.data).toHaveProperty('accessToken');
        });

        it('should reject password reset with invalid user ID', async () => {
            const response = await request(app)
                .post('/api/admin/users/invalid-uuid/reset-password')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    newPassword: 'NewPassword123!',
                })
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });

        it('should reject password reset with non-existent user', async () => {
            const fakeUuid = '00000000-0000-0000-0000-000000000000';
            const response = await request(app)
                .post(`/api/admin/users/${fakeUuid}/reset-password`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    newPassword: 'NewPassword123!',
                })
                .expect(404);

            expect(response.body).toHaveProperty('error');
        });

        it('should reject password reset without admin token', async () => {
            const response = await request(app)
                .post(`/api/admin/users/${testUserId}/reset-password`)
                .send({
                    newPassword: 'NewPassword123!',
                })
                .expect(401);

            expect(response.body).toHaveProperty('error');
        });

        it('should reject password reset with student token', async () => {
            const studentLoginResponse = await request(app)
                .post('/api/auth/login')
                .send({
                    email: testUser.email,
                    password: testUser.password,
                });

            const studentToken = studentLoginResponse.body.data.accessToken;

            const response = await request(app)
                .post(`/api/admin/users/${testUserId}/reset-password`)
                .set('Authorization', `Bearer ${studentToken}`)
                .send({
                    newPassword: 'NewPassword123!',
                })
                .expect(403);

            expect(response.body).toHaveProperty('error');
        });

        it('should validate new password meets requirements', async () => {
            const response = await request(app)
                .post(`/api/admin/users/${testUserId}/reset-password`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    newPassword: 'short',
                })
                .expect(400);

            expect(response.body).toHaveProperty('error');
            const msg = response.body.error?.message ?? response.body.message ?? '';
            expect(String(msg)).toMatch(/password|Validation|8 characters/i);
        });

        it('should reject empty password', async () => {
            const response = await request(app)
                .post(`/api/admin/users/${testUserId}/reset-password`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    newPassword: '',
                })
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });

        it('should reject missing password field', async () => {
            const response = await request(app)
                .post(`/api/admin/users/${testUserId}/reset-password`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({})
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });
    });

    describe('Password Reset Security', () => {
        it('should hash new password in database', async () => {
            const newPassword = 'HashedPassword123!';

            await request(app)
                .post(`/api/admin/users/${testUserId}/reset-password`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    newPassword,
                })
                .expect(200);

            const user = await prisma.user.findUnique({
                where: { id: testUserId },
            });

            expect(user).not.toBeNull();
            expect(user?.password).not.toBe(newPassword);
            expect(user?.password.length).toBeGreaterThan(newPassword.length);
        });

        it('should invalidate old password after reset', async () => {
            const newPassword = 'InvalidateOld123!';

            await request(app)
                .post(`/api/admin/users/${testUserId}/reset-password`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    newPassword,
                })
                .expect(200);

            const loginResponse = await request(app)
                .post('/api/auth/login')
                .send({
                    email: testUser.email,
                    password: testUser.password,
                })
                .expect(401);

            expect(loginResponse.body).toHaveProperty('error');
        });

        it('should allow login with new password immediately', async () => {
            const newPassword = 'ImmediateLogin123!';

            await request(app)
                .post(`/api/admin/users/${testUserId}/reset-password`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    newPassword,
                })
                .expect(200);

            const loginResponse = await request(app)
                .post('/api/auth/login')
                .send({
                    email: testUser.email,
                    password: newPassword,
                })
                .expect(200);

            expect(loginResponse.body.data).toHaveProperty('accessToken');
        });
    });

    describe('Password Reset Rate Limiting', () => {
        enableRealRateLimitForSuite({ maxRequests: 10 });

        it('should enforce rate limiting on password reset endpoint', async () => {
            let rateLimited = false;
            for (let i = 0; i < 15; i++) {
                const res = await request(app)
                    .post(`/api/admin/users/${testUserId}/reset-password`)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({
                        newPassword: `RateLimit${i}123!`,
                    });
                if (res.status === 429) {
                    rateLimited = true;
                    break;
                }
            }
            expect(rateLimited).toBe(true);
        });
    });
});
