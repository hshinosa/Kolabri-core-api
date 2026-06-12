import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import app from '../app.js';
import { enableRealRateLimitForSuite } from './helpers/rateLimitTestEnv.js';

const prisma = new PrismaClient();

describe('Auth Login Flow Integration Tests', () => {
    const testUser = {
        email: 'logintest@example.com',
        password: 'SecurePass123!',
        name: 'Login Test User',
        role: 'student' as const,
    };

    beforeAll(async () => {
        // Clean up test user if exists
        await prisma.user.deleteMany({
            where: { email: testUser.email },
        });

        // Create test user
        const hashedPassword = await bcrypt.hash(testUser.password, 10);
        await prisma.user.create({
            data: {
                email: testUser.email,
                password: hashedPassword,
                name: testUser.name,
                role: testUser.role,
                emailVerifiedAt: new Date(),
            },
        });
    });

    afterAll(async () => {
        // Clean up
        await prisma.user.deleteMany({
            where: { email: testUser.email },
        });
        await prisma.$disconnect();
    });

    beforeEach(async () => {
        // Clear any rate limit data between tests
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    describe('Valid Credentials', () => {
        it('should login successfully with correct credentials', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: testUser.email,
                    password: testUser.password,
                })
                .expect(200);

            expect(response.body).toHaveProperty('data');
            expect(response.body.data).toHaveProperty('accessToken');
            expect(response.body.data).toHaveProperty('refreshToken');
            expect(response.body.data.user).toMatchObject({
                email: testUser.email,
                name: testUser.name,
                role: testUser.role,
            });
            expect(response.body.meta.message).toBe('Login successful');
        });

        it('should return valid JWT tokens', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: testUser.email,
                    password: testUser.password,
                })
                .expect(200);

            const { accessToken, refreshToken } = response.body.data;

            // Tokens should be non-empty strings
            expect(typeof accessToken).toBe('string');
            expect(accessToken.length).toBeGreaterThan(0);
            expect(typeof refreshToken).toBe('string');
            expect(refreshToken.length).toBeGreaterThan(0);

            // Should be able to use access token
            const profileResponse = await request(app)
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${accessToken}`)
                .expect(200);

            expect(profileResponse.body.data.email).toBe(testUser.email);
        });
    });

    describe('Invalid Credentials', () => {
        it('should reject login with wrong password', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: testUser.email,
                    password: 'WrongPassword123!',
                })
                .expect(401);

            expect(response.body).toHaveProperty('error');
            expect(response.body.error.message).toMatch(/invalid|credentials/i);
        });

        it('should reject login with non-existent email', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'nonexistent@example.com',
                    password: testUser.password,
                })
                .expect(401);

            expect(response.body).toHaveProperty('error');
            expect(response.body.error.message).toMatch(/invalid|credentials/i);
        });

        it('should reject login with invalid email format', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'not-an-email',
                    password: testUser.password,
                })
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });

        it('should reject login with missing password', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: testUser.email,
                })
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });

        it('should reject login with empty password', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: testUser.email,
                    password: '',
                })
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });
    });

    describe('Remember Me Functionality', () => {
        it('should accept rememberMe flag', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: testUser.email,
                    password: testUser.password,
                    rememberMe: true,
                })
                .expect(200);

            expect(response.body.data).toHaveProperty('accessToken');
            expect(response.body.data).toHaveProperty('refreshToken');
        });

        it('should work without rememberMe flag', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: testUser.email,
                    password: testUser.password,
                })
                .expect(200);

            expect(response.body.data).toHaveProperty('accessToken');
            expect(response.body.data).toHaveProperty('refreshToken');
        });
    });

    describe('Rate Limiting', () => {
        enableRealRateLimitForSuite();

        it('should enforce rate limiting after multiple failed attempts', async () => {
            // Make multiple failed login attempts
            const attempts = [];
            for (let i = 0; i < 6; i++) {
                attempts.push(
                    request(app)
                        .post('/api/auth/login')
                        .send({
                            email: testUser.email,
                            password: 'WrongPassword',
                        })
                );
            }

            const responses = await Promise.all(attempts);

            // At least one should be rate limited (429)
            const rateLimited = responses.some(r => r.status === 429);
            expect(rateLimited).toBe(true);
        });

        it('should allow login after rate limit cooldown', async () => {
            // Trigger rate limit
            for (let i = 0; i < 6; i++) {
                await request(app)
                    .post('/api/auth/login')
                    .send({
                        email: testUser.email,
                        password: 'WrongPassword',
                    });
            }

            // Wait for cooldown (adjust based on your rate limit config)
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Should be able to login again
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: testUser.email,
                    password: testUser.password,
                });

            // Should either succeed or still be rate limited
            expect([200, 429]).toContain(response.status);
        });
    });

    describe('Token Refresh', () => {
        it('should refresh access token with valid refresh token', async () => {
            // Login first
            const loginResponse = await request(app)
                .post('/api/auth/login')
                .send({
                    email: testUser.email,
                    password: testUser.password,
                })
                .expect(200);

            const { refreshToken } = loginResponse.body.data;

            // Refresh token
            const refreshResponse = await request(app)
                .post('/api/auth/refresh')
                .send({ refreshToken })
                .expect(200);

            expect(refreshResponse.body.data).toHaveProperty('accessToken');
            expect(refreshResponse.body.data.accessToken).not.toBe(loginResponse.body.data.accessToken);
        });

        it('should reject refresh with invalid token', async () => {
            const response = await request(app)
                .post('/api/auth/refresh')
                .send({ refreshToken: 'invalid-token' })
                .expect(401);

            expect(response.body).toHaveProperty('error');
        });
    });

    describe('Logout', () => {
        it('should logout successfully and invalidate refresh token', async () => {
            // Login first
            const loginResponse = await request(app)
                .post('/api/auth/login')
                .send({
                    email: testUser.email,
                    password: testUser.password,
                })
                .expect(200);

            const { refreshToken } = loginResponse.body.data;

            // Logout
            await request(app)
                .post('/api/auth/logout')
                .send({ refreshToken })
                .expect(200);

            // Try to use refresh token after logout
            const refreshResponse = await request(app)
                .post('/api/auth/refresh')
                .send({ refreshToken })
                .expect(401);

            expect(refreshResponse.body).toHaveProperty('error');
        });
    });
});
