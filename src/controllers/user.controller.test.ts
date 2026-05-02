import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockUserService } = vi.hoisted(() => ({
    mockUserService: {
        getUsers: vi.fn(),
        getUserById: vi.fn(),
        createUser: vi.fn(),
        updateUser: vi.fn(),
        deleteUser: vi.fn(),
        resetPassword: vi.fn(),
        bulkDeleteUsers: vi.fn(),
        bulkUpdateUserRole: vi.fn(),
        bulkImportUsersFromCsv: vi.fn(),
    },
}));

vi.mock('../services/user.service.js', () => ({
    UserService: mockUserService,
}));

import { UserController } from './user.controller.js';

function mockReq(overrides: Partial<Request> = {}) {
    return {
        body: {},
        params: {},
        query: {},
        user: {
            userId: 'user-1',
            role: 'admin',
            email: 'admin@example.com',
        },
        ...overrides,
    } as Partial<Request>;
}

function mockRes(): Partial<Response> {
    const res: Partial<Response> & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } = {
        status: vi.fn(),
        json: vi.fn(),
    };
    res.status.mockReturnValue(res as Response);
    res.json.mockReturnValue(res as Response);
    return res;
}

function mockNext(): NextFunction {
    return vi.fn() as unknown as NextFunction;
}

describe('UserController', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns paginated users', async () => {
        const result = { data: [{ id: 'user-1' }], meta: { total: 1 } };
        mockUserService.getUsers.mockResolvedValue(result);
        const req = mockReq({ query: { search: 'alice' } });
        const res = mockRes();
        const next = mockNext();

        await UserController.index(req as Request, res as Response, next);

        expect(mockUserService.getUsers).toHaveBeenCalledWith(req.query);
        expect(res.json).toHaveBeenCalledWith({ data: result.data, meta: result.meta });
        expect(next).not.toHaveBeenCalled();
    });

    it('creates a user and returns 201', async () => {
        const user = { id: 'user-2', email: 'new@example.com' };
        mockUserService.createUser.mockResolvedValue(user);
        const req = mockReq({ body: { email: 'new@example.com' } });
        const res = mockRes();
        const next = mockNext();

        await UserController.create(req as Request, res as Response, next);

        expect(mockUserService.createUser).toHaveBeenCalledWith(req.body, 'user-1');
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
            data: user,
            meta: { message: 'User created successfully' },
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('deletes a user using the authenticated actor id for both service actor arguments', async () => {
        mockUserService.deleteUser.mockResolvedValue(undefined);
        const req = mockReq({ params: { id: 'user-2' } });
        const res = mockRes();
        const next = mockNext();

        await UserController.delete(req as Request, res as Response, next);

        expect(mockUserService.deleteUser).toHaveBeenCalledWith('user-2', 'user-1', 'user-1');
        expect(res.json).toHaveBeenCalledWith({
            meta: { message: 'User deleted successfully' },
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('imports users from CSV and returns 201', async () => {
        const file = { buffer: Buffer.from('email,name\na@example.com,Alice') } as Express.Multer.File;
        const result = { created: 1 };
        mockUserService.bulkImportUsersFromCsv.mockResolvedValue(result);
        const req = mockReq({ file });
        const res = mockRes();
        const next = mockNext();

        await UserController.bulkImport(req as Request, res as Response, next);

        expect(mockUserService.bulkImportUsersFromCsv).toHaveBeenCalledWith(file.buffer);
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
            data: result,
            meta: { message: 'Users imported successfully' },
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('forwards an error when bulk import is called without a CSV file', async () => {
        const req = mockReq({ file: undefined as Request['file'] });
        const res = mockRes();
        const next = mockNext();

        await UserController.bulkImport(req as Request, res as Response, next);

        expect(mockUserService.bulkImportUsersFromCsv).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith(expect.any(Error));
        expect((next as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({
            message: 'CSV file is required',
        });
    });
});
