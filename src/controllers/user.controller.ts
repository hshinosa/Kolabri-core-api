import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { UserService } from '../services/user.service.js';
import {
    BulkDeleteUsersInput,
    BulkRoleChangeInput,
    CreateUserInput,
    ListUsersQuery,
    ResetPasswordInput,
    UpdateUserInput,
} from '../validators/user.validator.js';

export class UserController {
    static async index(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const result = await UserService.getUsers(req.query as unknown as ListUsersQuery);

            res.json({
                data: result.data,
                meta: result.meta,
            });
        } catch (error) {
            next(error);
        }
    }

    static async show(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const user = await UserService.getUserById(req.params.id);

            res.json({
                data: user,
            });
        } catch (error) {
            next(error);
        }
    }

    static async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const user = await UserService.createUser(req.body as CreateUserInput, req.user!.userId);

            res.status(201).json({
                data: user,
                meta: {
                    message: 'User created successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    static async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const user = await UserService.updateUser(req.params.id, req.body as UpdateUserInput, req.user!.userId);

            res.json({
                data: user,
                meta: {
                    message: 'User updated successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    static async delete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            await UserService.deleteUser(req.params.id, req.user!.userId, req.user!.userId);

            res.json({
                meta: {
                    message: 'User deleted successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    static async resetPassword(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            await UserService.resetPassword(
                req.params.id,
                (req.body as ResetPasswordInput).newPassword
            );

            res.json({
                meta: {
                    message: 'Password reset successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    static async bulkDelete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const result = await UserService.bulkDeleteUsers(
                (req.body as BulkDeleteUsersInput).userIds,
                req.user!.userId
            );

            res.json({
                data: result,
                meta: {
                    message: 'Users deleted successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    static async bulkRoleChange(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const payload = req.body as BulkRoleChangeInput;
            const result = await UserService.bulkUpdateUserRole(payload.userIds, payload.role);

            res.json({
                data: result,
                meta: {
                    message: 'User roles updated successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    static async bulkImport(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const file = req.file;

            if (!file) {
                throw new Error('CSV file is required');
            }

            const result = await UserService.bulkImportUsersFromCsv(file.buffer);

            res.status(201).json({
                data: result,
                meta: {
                    message: 'Users imported successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }
}
