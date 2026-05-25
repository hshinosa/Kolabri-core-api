import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { errorHandler, requestIdMiddleware, ApiError } from './error.middleware.js';
import { logger } from '../utils/logger.js';

vi.mock('../utils/logger');

describe('Error Middleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;

    beforeEach(() => {
        mockReq = {
            method: 'GET',
            path: '/api/test',
            headers: {},
        };
        mockRes = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
        };
        mockNext = vi.fn();
        vi.clearAllMocks();
    });

    describe('requestIdMiddleware', () => {
        it('should generate requestId if not present', () => {
            requestIdMiddleware(mockReq as Request, mockRes as Response, mockNext);
            
            expect((mockReq as any).requestId).toBeDefined();
            expect(typeof (mockReq as any).requestId).toBe('string');
            expect(mockNext).toHaveBeenCalled();
        });

        it('should use existing x-request-id header', () => {
            const existingId = 'existing-request-id';
            mockReq.headers = { 'x-request-id': existingId };
            
            requestIdMiddleware(mockReq as Request, mockRes as Response, mockNext);
            
            expect((mockReq as any).requestId).toBe(existingId);
            expect(mockNext).toHaveBeenCalled();
        });
    });

    describe('errorHandler', () => {
        beforeEach(() => {
            (mockReq as any).requestId = 'test-request-id';
            (mockReq as any).user = { userId: 'test-user-id' };
        });

        it('should handle ApiError with proper format', () => {
            const error = ApiError.badRequest('Invalid input', { email: 'Invalid email format' });
            
            errorHandler(error, mockReq as Request, mockRes as Response, mockNext);
            
            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith({
                status: 400,
                message: 'Invalid input',
                errors: [{ field: 'email', message: 'Invalid email format' }],
            });
        });

        it('should log error with context', () => {
            const error = ApiError.internal('Database error');
            
            errorHandler(error, mockReq as Request, mockRes as Response, mockNext);
            
            expect(logger.error).toHaveBeenCalledWith('Server error:', expect.objectContaining({
                requestId: 'test-request-id',
                userId: 'test-user-id',
                method: 'GET',
                path: '/api/test',
                statusCode: 500,
                code: 'INTERNAL_ERROR',
            }));
        });

        it('should include requestId for 5xx errors', () => {
            const error = ApiError.internal('Server error');
            
            errorHandler(error, mockReq as Request, mockRes as Response, mockNext);
            
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                requestId: 'test-request-id',
            }));
        });

        it('should not include requestId for 4xx errors', () => {
            const error = ApiError.badRequest('Bad request');
            
            errorHandler(error, mockReq as Request, mockRes as Response, mockNext);
            
            const jsonCall = (mockRes.json as any).mock.calls[0][0];
            expect(jsonCall.requestId).toBeUndefined();
        });

        it('should use generic message for errors with file paths in production', () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'production';
            
            const error = new Error('Error in /Users/app/src/file.ts at line 42');
            (error as any).statusCode = 500;
            
            errorHandler(error as any, mockReq as Request, mockRes as Response, mockNext);
            
            const jsonCall = (mockRes.json as any).mock.calls[0][0];
            expect(jsonCall.message).not.toContain('/Users/app/src/file.ts');
            expect(jsonCall.message).toBe('An internal server error occurred');
            
            process.env.NODE_ENV = originalEnv;
        });

        it('should use generic message for errors with SQL in production', () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'production';
            
            const error = new Error('SELECT * FROM users WHERE id = 1');
            (error as any).statusCode = 500;
            
            errorHandler(error as any, mockReq as Request, mockRes as Response, mockNext);
            
            const jsonCall = (mockRes.json as any).mock.calls[0][0];
            expect(jsonCall.message).not.toContain('SELECT * FROM users');
            expect(jsonCall.message).toBe('An internal server error occurred');
            
            process.env.NODE_ENV = originalEnv;
        });

        it('should use generic message for errors with connection strings in production', () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'production';
            
            const error = new Error('Failed to connect to mongodb://user:pass@localhost:27017/db');
            (error as any).statusCode = 500;
            
            errorHandler(error as any, mockReq as Request, mockRes as Response, mockNext);
            
            const jsonCall = (mockRes.json as any).mock.calls[0][0];
            expect(jsonCall.message).not.toContain('mongodb://user:pass@localhost');
            expect(jsonCall.message).toBe('An internal server error occurred');
            
            process.env.NODE_ENV = originalEnv;
        });

        it('should use generic message for errors with sensitive info in production', () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'production';
            
            const error = new Error('Database query failed: SELECT password FROM users');
            (error as any).statusCode = 500;
            (error as any).stack = 'Error at /app/src/db/users.ts:42';
            
            errorHandler(error as any, mockReq as Request, mockRes as Response, mockNext);
            
            const jsonCall = (mockRes.json as any).mock.calls[0][0];
            expect(jsonCall.message).toBe('An internal server error occurred');
            
            process.env.NODE_ENV = originalEnv;
        });

        it('should handle errors without statusCode in production', () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'production';
            
            const error = new Error('Unexpected error');
            
            errorHandler(error as any, mockReq as Request, mockRes as Response, mockNext);
            
            expect(mockRes.status).toHaveBeenCalledWith(500);
            const jsonCall = (mockRes.json as any).mock.calls[0][0];
            expect(jsonCall.status).toBe(500);
            expect(jsonCall.message).toBe('An internal server error occurred');
            
            process.env.NODE_ENV = originalEnv;
        });

        it('should handle anonymous users', () => {
            delete (mockReq as any).user;
            const error = ApiError.internal('Server error');
            
            errorHandler(error, mockReq as Request, mockRes as Response, mockNext);
            
            expect(logger.error).toHaveBeenCalledWith('Server error:', expect.objectContaining({
                userId: 'anonymous',
            }));
        });

        it('should never include stack traces in response', () => {
            const error = new Error('Test error');
            error.stack = 'Error: Test error\n    at Object.<anonymous> (/app/test.ts:10:15)';
            (error as any).statusCode = 500;
            
            errorHandler(error as any, mockReq as Request, mockRes as Response, mockNext);
            
            const jsonCall = (mockRes.json as any).mock.calls[0][0];
            expect(JSON.stringify(jsonCall)).not.toContain('at Object.<anonymous>');
            expect(jsonCall.stack).toBeUndefined();
        });
    });
});
