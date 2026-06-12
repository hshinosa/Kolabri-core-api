import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../models/ChatLog.js', () => ({
    ChatLog: {
        updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
        deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    },
}));
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import app from '../app.js';
import { enableRealRateLimitForSuite } from './helpers/rateLimitTestEnv.js';

const prisma = new PrismaClient();

describe('User Settings Integration Tests', () => {
    let adminToken: string;
    let userToken: string;
    let userId: string;
    let adminId: string;

    const adminUser = {
        email: 'admin-settings@example.com',
        password: 'AdminPass123!',
        name: 'Admin Settings',
        role: 'admin' as const,
    };

    const testUser = {
        email: 'user-settings@example.com',
        password: 'UserPass123!',
        name: 'User Settings',
        role: 'student' as const,
    };

    beforeAll(async () => {
        await prisma.user.deleteMany({
            where: {
                email: {
                    in: [adminUser.email, testUser.email],
                },
            },
        });

        const hashedAdminPassword = await bcrypt.hash(adminUser.password, 10);
        const createdAdmin = await prisma.user.create({
            data: {
                email: adminUser.email,
                password: hashedAdminPassword,
                name: adminUser.name,
                role: adminUser.role,
                emailVerifiedAt: new Date(),
            },
        });
        adminId = createdAdmin.id;

        const hashedUserPassword = await bcrypt.hash(testUser.password, 10);
        const createdUser = await prisma.user.create({
            data: {
                email: testUser.email,
                password: hashedUserPassword,
                name: testUser.name,
                role: testUser.role,
                emailVerifiedAt: new Date(),
            },
        });
        userId = createdUser.id;

        const adminLoginResponse = await request(app)
            .post('/api/auth/login')
            .send({
                email: adminUser.email,
                password: adminUser.password,
            });
        adminToken = adminLoginResponse.body.data.accessToken;

        const userLoginResponse = await request(app)
            .post('/api/auth/login')
            .send({
                email: testUser.email,
                password: testUser.password,
            });
        userToken = userLoginResponse.body.data.accessToken;
    });

    afterAll(async () => {
        await prisma.user.deleteMany({
            where: {
                email: {
                    in: [adminUser.email, testUser.email],
                },
            },
        });
        await prisma.$disconnect();
    });

    beforeEach(async () => {
        await prisma.user.deleteMany({
            where: {
                email: {
                    in: [
                        'temp-delete@example.com',
                        'temp-hard-delete@example.com',
                        'temp-login-delete@example.com',
                        'bulk1@example.com',
                        'bulk2@example.com',
                        'bulk-role@example.com',
                        'bulkrole1@example.com',
                    ],
                },
            },
        });
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    describe('Profile Update', () => {
        it('should allow admin to update user profile', async () => {
            const response = await request(app)
                .put(`/api/admin/users/${userId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    name: 'Updated Name',
                })
                .expect(200);

            expect(response.body.data.name).toBe('Updated Name');
            expect(response.body.meta.message).toMatch(/updated/i);
        });

        it('should allow admin to update user email', async () => {
            const newEmail = 'newemail-settings@example.com';

            const response = await request(app)
                .put(`/api/admin/users/${userId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    email: newEmail,
                })
                .expect(200);

            expect(response.body.data.email).toBe(newEmail);

            await request(app)
                .put(`/api/admin/users/${userId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    email: testUser.email,
                });
        });

        it('should allow admin to update user role', async () => {
            const response = await request(app)
                .put(`/api/admin/users/${userId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    role: 'lecturer',
                })
                .expect(200);

            expect(response.body.data.role).toBe('lecturer');

            await request(app)
                .put(`/api/admin/users/${userId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    role: testUser.role,
                });
        });

        it('should reject profile update with invalid email', async () => {
            const response = await request(app)
                .put(`/api/admin/users/${userId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    email: 'not-an-email',
                })
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });

        it('should reject profile update with duplicate email', async () => {
            const response = await request(app)
                .put(`/api/admin/users/${userId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    email: adminUser.email,
                })
                .expect(409);

            expect(response.body).toHaveProperty('error');
        });

        it('should reject profile update with invalid role', async () => {
            const response = await request(app)
                .put(`/api/admin/users/${userId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    role: 'superadmin',
                })
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });

        it('should reject profile update without admin token', async () => {
            const response = await request(app)
                .put(`/api/admin/users/${userId}`)
                .set('Authorization', `Bearer ${userToken}`)
                .send({
                    name: 'Unauthorized Update',
                })
                .expect(403);

            expect(response.body).toHaveProperty('error');
        });

        it('should reject profile update with non-existent user', async () => {
            const fakeUuid = '00000000-0000-0000-0000-000000000000';
            const response = await request(app)
                .put(`/api/admin/users/${fakeUuid}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    name: 'Non-existent User',
                })
                .expect(404);

            expect(response.body).toHaveProperty('error');
        });

        it('should trim and validate name', async () => {
            const response = await request(app)
                .put(`/api/admin/users/${userId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    name: '  Trimmed Name  ',
                })
                .expect(200);

            expect(response.body.data.name).toBe('Trimmed Name');
        });

        it('should reject name that is too short', async () => {
            const response = await request(app)
                .put(`/api/admin/users/${userId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    name: 'A',
                })
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });

        it('should reject name that is too long', async () => {
            const response = await request(app)
                .put(`/api/admin/users/${userId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    name: 'A'.repeat(256),
                })
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });
    });

    describe('Profile Retrieval', () => {
        it('should allow user to get own profile via /me endpoint', async () => {
            const response = await request(app)
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${userToken}`)
                .expect(200);

            expect(response.body.data.email).toBe(testUser.email);
            expect(response.body.data.name).toBeDefined();
            expect(response.body.data.role).toBe(testUser.role);
        });

        it('should not return password in profile', async () => {
            const response = await request(app)
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${userToken}`)
                .expect(200);

            expect(response.body.data).not.toHaveProperty('password');
        });

        it('should allow admin to get any user profile', async () => {
            const response = await request(app)
                .get(`/api/admin/users/${userId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.data.email).toBe(testUser.email);
        });

        it('should deny non-admin from getting other user profiles', async () => {
            const response = await request(app)
                .get(`/api/admin/users/${adminId}`)
                .set('Authorization', `Bearer ${userToken}`)
                .expect(403);

            expect(response.body).toHaveProperty('error');
        });
    });

    describe('Account Deletion', () => {
        it('should allow admin to soft delete user account', async () => {
            const tempUser = await prisma.user.create({
                data: {
                    email: 'temp-delete@example.com',
                    password: await bcrypt.hash('TempPass123!', 10),
                    name: 'Temp Delete User',
                    role: 'student',
                    emailVerifiedAt: new Date(),
                },
            });

            const response = await request(app)
                .delete(`/api/admin/users/${tempUser.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.meta.message).toMatch(/deleted/i);

            const deletedUser = await prisma.user.findUnique({
                where: { id: tempUser.id },
            });

            expect(deletedUser).not.toBeNull();
            expect(deletedUser?.deletedAt).not.toBeNull();
        });

        it('should allow admin to hard delete user account', async () => {
            const tempUser = await prisma.user.create({
                data: {
                    email: 'temp-hard-delete@example.com',
                    password: await bcrypt.hash('TempPass123!', 10),
                    name: 'Temp Hard Delete User',
                    role: 'student',
                    emailVerifiedAt: new Date(),
                },
            });

            const response = await request(app)
                .delete(`/api/admin/users/${tempUser.id}/hard`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.meta.message).toMatch(/deleted/i);

            const deletedUser = await prisma.user.findUnique({
                where: { id: tempUser.id },
            });

            expect(deletedUser).toBeNull();
        });

        it('should reject account deletion without admin token', async () => {
            const response = await request(app)
                .delete(`/api/admin/users/${userId}`)
                .set('Authorization', `Bearer ${userToken}`)
                .expect(403);

            expect(response.body).toHaveProperty('error');
        });

        it('should reject deletion of non-existent user', async () => {
            const fakeUuid = '00000000-0000-0000-0000-000000000000';
            const response = await request(app)
                .delete(`/api/admin/users/${fakeUuid}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(404);

            expect(response.body).toHaveProperty('error');
        });

        it('should prevent login after soft delete', async () => {
            const tempUser = await prisma.user.create({
                data: {
                    email: 'temp-login-delete@example.com',
                    password: await bcrypt.hash('TempPass123!', 10),
                    name: 'Temp Login Delete User',
                    role: 'student',
                    emailVerifiedAt: new Date(),
                },
            });

            await request(app)
                .delete(`/api/admin/users/${tempUser.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            const loginResponse = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'temp-login-delete@example.com',
                    password: 'TempPass123!',
                })
                .expect(401);

            expect(loginResponse.body).toHaveProperty('error');
        });
    });

    describe('Bulk Operations', () => {
        it('should allow admin to bulk delete users', async () => {
            const user1 = await prisma.user.create({
                data: {
                    email: 'bulk1@example.com',
                    password: await bcrypt.hash('Pass123!', 10),
                    name: 'Bulk User 1',
                    role: 'student',
                    emailVerifiedAt: new Date(),
                },
            });

            const user2 = await prisma.user.create({
                data: {
                    email: 'bulk2@example.com',
                    password: await bcrypt.hash('Pass123!', 10),
                    name: 'Bulk User 2',
                    role: 'student',
                    emailVerifiedAt: new Date(),
                },
            });

            const response = await request(app)
                .post('/api/admin/users/bulk-delete')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    userIds: [user1.id, user2.id],
                })
                .expect(200);

            expect(response.body.meta.message).toMatch(/deleted/i);
        });

        it('should allow admin to bulk change user roles', async () => {
            const user1 = await prisma.user.create({
                data: {
                    email: 'bulkrole1@example.com',
                    password: await bcrypt.hash('Pass123!', 10),
                    name: 'Bulk Role User 1',
                    role: 'student',
                    emailVerifiedAt: new Date(),
                },
            });

            const response = await request(app)
                .post('/api/admin/users/bulk-role-change')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    userIds: [user1.id],
                    role: 'lecturer',
                })
                .expect(200);

            expect(response.body.meta.message).toMatch(/updated/i);

            await prisma.user.delete({ where: { id: user1.id } });
        });
    });

    describe('Rate Limiting', () => {
        enableRealRateLimitForSuite({ maxRequests: 10 });

        it('should enforce rate limiting on user endpoints', async () => {
            let rateLimited = false;
            for (let i = 0; i < 15; i++) {
                const res = await request(app)
                    .get(`/api/admin/users/${userId}`)
                    .set('Authorization', `Bearer ${adminToken}`);
                if (res.status === 429) {
                    rateLimited = true;
                    break;
                }
            }
            expect(rateLimited).toBe(true);
        });
    });
});
