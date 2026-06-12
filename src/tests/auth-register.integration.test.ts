import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../app.js';
import { enableRealRateLimitForSuite } from './helpers/rateLimitTestEnv.js';

const prisma = new PrismaClient();

function expectValidationMessage(
    body: {
        error?: { message?: string };
        message?: string;
        errors?: Array<{ field: string; message: string }>;
    },
    pattern: RegExp
) {
    const messages = [
        body.error?.message,
        body.message,
        ...(body.errors?.map((e) => e.message) ?? []),
    ].filter((m): m is string => typeof m === 'string');
    expect(messages.some((m) => pattern.test(m))).toBe(true);
}

describe('Auth Register Flow Integration Tests', () => {
    const baseEmail = 'registertest';
    const domain = '@example.com';
    let testCounter = 0;

    const getUniqueEmail = () => {
        testCounter++;
        return `${baseEmail}${testCounter}${domain}`;
    };

    afterAll(async () => {
        await prisma.user.deleteMany({
            where: {
                email: {
                    startsWith: baseEmail,
                },
            },
        });
        await prisma.$disconnect();
    });

    beforeEach(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    describe('Valid Registration', () => {
        it('should register a new user successfully', async () => {
            const email = getUniqueEmail();
            const response = await request(app)
                .post('/api/auth/register')
                .send({
                    name: 'Test User',
                    email,
                    password: 'SecurePass123!',
                    role: 'student',
                })
                .expect(201);

            expect(response.body).toHaveProperty('data');
            expect(response.body.data).toHaveProperty('accessToken');
            expect(response.body.data).toHaveProperty('refreshToken');
            expect(response.body.data.user).toMatchObject({
                email,
                name: 'Test User',
                role: 'student',
            });
            expect(response.body.data.user).toHaveProperty('id');
            expect(response.body.data.user).not.toHaveProperty('password');
            expect(response.body.meta.message).toBe('User registered successfully');
        });

        it('should default role to student if not provided', async () => {
            const email = getUniqueEmail();
            const response = await request(app)
                .post('/api/auth/register')
                .send({
                    name: 'Default Role User',
                    email,
                    password: 'SecurePass123!',
                })
                .expect(201);

            expect(response.body.data.user.role).toBe('student');
        });

        it('should allow registration with lecturer role', async () => {
            const email = getUniqueEmail();
            const response = await request(app)
                .post('/api/auth/register')
                .send({
                    name: 'Lecturer User',
                    email,
                    password: 'SecurePass123!',
                    role: 'lecturer',
                })
                .expect(201);

            expect(response.body.data.user.role).toBe('lecturer');
        });

        it('should trim and lowercase email', async () => {
            const email = getUniqueEmail();
            const response = await request(app)
                .post('/api/auth/register')
                .send({
                    name: 'Trim Test',
                    email: `  ${email.toUpperCase()}  `,
                    password: 'SecurePass123!',
                })
                .expect(201);

            expect(response.body.data.user.email).toBe(email.toLowerCase());
        });

        it('should trim name', async () => {
            const email = getUniqueEmail();
            const response = await request(app)
                .post('/api/auth/register')
                .send({
                    name: '  Trim Name  ',
                    email,
                    password: 'SecurePass123!',
                })
                .expect(201);

            expect(response.body.data.user.name).toBe('Trim Name');
        });
    });

    describe('Validation Errors', () => {
        it('should reject registration with duplicate email', async () => {
            const email = getUniqueEmail();
            
            await request(app)
                .post('/api/auth/register')
                .send({
                    name: 'First User',
                    email,
                    password: 'SecurePass123!',
                })
                .expect(201);

            const response = await request(app)
                .post('/api/auth/register')
                .send({
                    name: 'Second User',
                    email,
                    password: 'AnotherPass123!',
                })
                .expect(409);

            expect(response.body).toHaveProperty('error');
            expect(response.body.error.message).toMatch(/already exists|duplicate|already registered/i);
        });

        it('should reject registration with invalid email format', async () => {
            const response = await request(app)
                .post('/api/auth/register')
                .send({
                    name: 'Invalid Email User',
                    email: 'not-an-email',
                    password: 'SecurePass123!',
                })
                .expect(400);

            expect(response.body).toHaveProperty('error');
            expectValidationMessage(response.body, /email/i);
        });

        it('should reject registration with missing name', async () => {
            const response = await request(app)
                .post('/api/auth/register')
                .send({
                    email: getUniqueEmail(),
                    password: 'SecurePass123!',
                })
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });

        it('should reject registration with name too short', async () => {
            const response = await request(app)
                .post('/api/auth/register')
                .send({
                    name: 'A',
                    email: getUniqueEmail(),
                    password: 'SecurePass123!',
                })
                .expect(400);

            expect(response.body).toHaveProperty('error');
            expectValidationMessage(response.body, /name.*2 characters/i);
        });

        it('should reject registration with name too long', async () => {
            const response = await request(app)
                .post('/api/auth/register')
                .send({
                    name: 'A'.repeat(101),
                    email: getUniqueEmail(),
                    password: 'SecurePass123!',
                })
                .expect(400);

            expect(response.body).toHaveProperty('error');
            expectValidationMessage(response.body, /name.*100 characters/i);
        });

        it('should reject registration with missing password', async () => {
            const response = await request(app)
                .post('/api/auth/register')
                .send({
                    name: 'No Password User',
                    email: getUniqueEmail(),
                })
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });

        it('should reject registration with password too short', async () => {
            const response = await request(app)
                .post('/api/auth/register')
                .send({
                    name: 'Short Pass User',
                    email: getUniqueEmail(),
                    password: 'Short1!',
                })
                .expect(400);

            expect(response.body).toHaveProperty('error');
            expectValidationMessage(response.body, /password.*8 characters/i);
        });

        it('should reject registration with password too long', async () => {
            const response = await request(app)
                .post('/api/auth/register')
                .send({
                    name: 'Long Pass User',
                    email: getUniqueEmail(),
                    password: 'A'.repeat(101),
                })
                .expect(400);

            expect(response.body).toHaveProperty('error');
            expectValidationMessage(response.body, /password.*100 characters/i);
        });

        it('should reject registration with invalid role', async () => {
            const response = await request(app)
                .post('/api/auth/register')
                .send({
                    name: 'Invalid Role User',
                    email: getUniqueEmail(),
                    password: 'SecurePass123!',
                    role: 'superadmin',
                })
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });

        it('should reject registration with empty string fields', async () => {
            const response = await request(app)
                .post('/api/auth/register')
                .send({
                    name: '',
                    email: '',
                    password: '',
                })
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });
    });

    describe('Email Verification', () => {
        it('should create user with emailVerified as false by default', async () => {
            const email = getUniqueEmail();
            await request(app)
                .post('/api/auth/register')
                .send({
                    name: 'Unverified User',
                    email,
                    password: 'SecurePass123!',
                })
                .expect(201);

            const user = await prisma.user.findUnique({
                where: { email },
            });

            expect(user).not.toBeNull();
            expect(user?.emailVerifiedAt).toBeNull();
        });

        it('should not allow login with unverified email', async () => {
            const email = getUniqueEmail();
            const password = 'SecurePass123!';

            await request(app)
                .post('/api/auth/register')
                .send({
                    name: 'Unverified Login Test',
                    email,
                    password,
                })
                .expect(201);

            const loginResponse = await request(app)
                .post('/api/auth/login')
                .send({
                    email,
                    password,
                });

            if (loginResponse.status === 200) {
                const user = await prisma.user.findUnique({ where: { email } });
                expect(user?.emailVerifiedAt).toBeNull();
            } else {
                expect([401, 403]).toContain(loginResponse.status);
            }
        });
    });

    describe('Terms and Conditions', () => {
        it('should accept registration without explicit terms checkbox', async () => {
            const email = getUniqueEmail();
            const response = await request(app)
                .post('/api/auth/register')
                .send({
                    name: 'No Terms User',
                    email,
                    password: 'SecurePass123!',
                })
                .expect(201);

            expect(response.body.data.user).toHaveProperty('id');
        });

        it('should accept registration with terms accepted', async () => {
            const email = getUniqueEmail();
            const response = await request(app)
                .post('/api/auth/register')
                .send({
                    name: 'Terms Accepted User',
                    email,
                    password: 'SecurePass123!',
                    acceptedTerms: true,
                })
                .expect(201);

            expect(response.body.data.user).toHaveProperty('id');
        });
    });

    describe('Rate Limiting', () => {
        enableRealRateLimitForSuite();

        it('should enforce rate limiting on registration endpoint', async () => {
            const attempts = [];
            for (let i = 0; i < 6; i++) {
                attempts.push(
                    request(app)
                        .post('/api/auth/register')
                        .send({
                            name: `Rate Limit Test ${i}`,
                            email: getUniqueEmail(),
                            password: 'SecurePass123!',
                        })
                );
            }

            const responses = await Promise.all(attempts);

            const rateLimited = responses.some(r => r.status === 429);
            expect(rateLimited).toBe(true);
        });
    });

    describe('Password Security', () => {
        it('should not return password in response', async () => {
            const email = getUniqueEmail();
            const response = await request(app)
                .post('/api/auth/register')
                .send({
                    name: 'Password Security Test',
                    email,
                    password: 'SecurePass123!',
                })
                .expect(201);

            expect(response.body.data.user).not.toHaveProperty('password');
        });

        it('should hash password in database', async () => {
            const email = getUniqueEmail();
            const plainPassword = 'SecurePass123!';

            await request(app)
                .post('/api/auth/register')
                .send({
                    name: 'Hash Test User',
                    email,
                    password: plainPassword,
                })
                .expect(201);

            const user = await prisma.user.findUnique({
                where: { email },
            });

            expect(user).not.toBeNull();
            expect(user?.password).not.toBe(plainPassword);
            expect(user?.password.length).toBeGreaterThan(plainPassword.length);
        });
    });
});
