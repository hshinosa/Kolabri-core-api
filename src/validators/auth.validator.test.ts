import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { loginSchema } from './auth.validator.js';

describe('loginSchema', () => {
    it('passes valid login data', () => {
        const result = loginSchema.parse({
            email: 'USER@Example.com',
            password: 'secret123',
        });

        expect(result).toEqual({
            email: 'user@example.com',
            password: 'secret123',
        });
    });

    it('fails when email is missing', () => {
        expect(() => {
            loginSchema.parse({
                password: 'secret123',
            });
        }).toThrow(ZodError);
    });

    it('fails when email format is invalid', () => {
        expect(() => {
            loginSchema.parse({
                email: 'not-an-email',
                password: 'secret123',
            });
        }).toThrow('Invalid email address');
    });

    it('fails when password is empty', () => {
        expect(() => {
            loginSchema.parse({
                email: 'user@example.com',
                password: '',
            });
        }).toThrow('Password is required');
    });
});
