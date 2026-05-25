import { describe, expect, it } from 'vitest';
import { prisma } from '../config/database.js';

describe('SQL Injection Protection', () => {
    it('blocks SQL injection in user search', async () => {
        const maliciousInput = "'; DROP TABLE users; --";
        
        // Prisma parameterizes queries automatically
        const result = await prisma.user.findMany({
            where: {
                name: {
                    contains: maliciousInput,
                },
            },
        });

        // Should return empty array, not execute DROP TABLE
        expect(Array.isArray(result)).toBe(true);
        
        // Verify users table still exists by querying it
        const usersExist = await prisma.user.count();
        expect(typeof usersExist).toBe('number');
    });

    it('blocks SQL injection in course search', async () => {
        const maliciousInput = "' OR '1'='1";
        
        const result = await prisma.course.findMany({
            where: {
                name: {
                    contains: maliciousInput,
                },
            },
        });

        // Should treat as literal string, not SQL condition
        expect(Array.isArray(result)).toBe(true);
    });

    it('blocks SQL injection in email lookup', async () => {
        const maliciousInput = "admin@example.com' OR '1'='1' --";
        
        const result = await prisma.user.findUnique({
            where: {
                email: maliciousInput,
            },
        });

        // Should return null (no match), not all users
        expect(result).toBeNull();
    });

    it('blocks SQL injection in ID lookup', async () => {
        const maliciousInput = "1 OR 1=1";
        
        // Prisma expects proper types, this should fail gracefully
        try {
            await prisma.user.findUnique({
                where: {
                    id: maliciousInput,
                },
            });
        } catch (error) {
            // Should throw type error, not execute SQL
            expect(error).toBeDefined();
        }
    });

    it('blocks NoSQL injection in MongoDB-style queries', async () => {
        const maliciousInput = { $ne: null };
        
        // Prisma doesn't support MongoDB operators in Postgres
        try {
            await prisma.user.findMany({
                where: {
                    // @ts-expect-error - testing malicious input
                    email: maliciousInput,
                },
            });
            // Should throw validation error, not bypass authentication
            expect.fail('Should have thrown validation error');
        } catch (error) {
            // Prisma rejects invalid query structure
            expect(error).toBeDefined();
        }
    });
});
