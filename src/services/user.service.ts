import bcrypt from 'bcrypt';
import prisma from '../config/database.js';
import { ApiError } from '../middleware/errorHandler.js';
import { AuditLogService } from './audit-log.service.js';
import { broadcastAdminEvent } from '../websocket/server.js';
import { userActiveCache } from '../utils/userActiveCache.js';
import {
    CreateUserInput,
    ListUsersQuery,
    UserRole,
    UpdateUserInput,
} from '../validators/user.validator.js';

const SALT_ROUNDS = 10;
const DEFAULT_IMPORTED_USER_PASSWORD = 'TempPass123!';

const userSelect = {
    id: true,
    name: true,
    email: true,
    role: true,
    googleId: true,
    avatarUrl: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
} as const;

export class UserService {
    static async getUsers(query: ListUsersQuery) {
        const { page, limit, role, search, sortBy, sortOrder } = query;
        const skip = (page - 1) * limit;

        const where = {
            deletedAt: null,
            ...(role ? { role } : {}),
            ...(search
                ? {
                      OR: [
                          {
                              name: {
                                  contains: search,
                                  mode: 'insensitive' as const,
                              },
                          },
                          {
                              email: {
                                  contains: search,
                                  mode: 'insensitive' as const,
                              },
                          },
                      ],
                  }
                : {}),
        };

        const [data, total] = await Promise.all([
            prisma.user.findMany({
                where,
                select: userSelect,
                skip,
                take: limit,
                orderBy: {
                    [sortBy]: sortOrder,
                },
            }),
            prisma.user.count({ where }),
        ]);

        return {
            data,
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    static async getUserById(id: string) {
        const user = await prisma.user.findFirst({
            where: { id, deletedAt: null },
            select: userSelect,
        });

        if (!user) {
            throw ApiError.notFound('User not found');
        }

        return user;
    }

    static async createUser(data: CreateUserInput, actorUserId: string) {
        const existingUser = await prisma.user.findUnique({
            where: { email: data.email },
        });

        if (existingUser) {
            throw ApiError.conflict('Email already exists');
        }

        const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);

        const createdUser = await prisma.user.create({
            data: {
                name: data.name,
                email: data.email,
                password: hashedPassword,
                role: data.role,
            },
            select: userSelect,
        });

        const auditLog = await AuditLogService.logAction({
            action: 'CREATE',
            entityType: 'User',
            entityId: createdUser.id,
            userId: actorUserId,
            changes: {
                before: null,
                after: createdUser,
            },
            metadata: {
                source: 'admin.user.create',
            },
        });

        broadcastAdminEvent('users:created', {
            user: createdUser,
            actor: auditLog.user,
        });
        broadcastAdminEvent('dashboard:stats:update', {
            entity: 'user',
            action: 'CREATE',
            entityId: createdUser.id,
        });

        return createdUser;
    }

    static async updateUser(id: string, data: UpdateUserInput, actorUserId: string) {
        const user = await prisma.user.findUnique({
            where: { id },
            select: userSelect,
        });

        if (!user) {
            throw ApiError.notFound('User not found');
        }

        if (data.email && data.email !== user.email) {
            const existingUser = await prisma.user.findUnique({
                where: { email: data.email },
                select: { id: true },
            });

            if (existingUser) {
                throw ApiError.conflict('Email already exists');
            }
        }

        const updatedUser = await prisma.user.update({
            where: { id },
            data,
            select: userSelect,
        });

        if (data.isActive !== undefined && data.isActive !== user.isActive) {
            userActiveCache.invalidate(id);
        }

        const action = data.role !== undefined && data.role !== user.role
            ? 'ROLE_CHANGE'
            : data.isActive !== undefined && data.isActive !== user.isActive
                ? data.isActive
                    ? 'ACTIVATE'
                    : 'DEACTIVATE'
                : 'UPDATE';

        const auditLog = await AuditLogService.logAction({
            action,
            entityType: 'User',
            entityId: updatedUser.id,
            userId: actorUserId,
            changes: {
                before: user,
                after: updatedUser,
            },
            metadata: {
                source: 'admin.user.update',
            },
        });

        broadcastAdminEvent('users:updated', {
            user: updatedUser,
            actor: auditLog.user,
            action,
        });
        broadcastAdminEvent('dashboard:stats:update', {
            entity: 'user',
            action,
            entityId: updatedUser.id,
        });

        return updatedUser;
    }

    static async hardDeleteUser(id: string, currentUserId: string) {
        if (id === currentUserId) {
            throw ApiError.forbidden('Cannot delete your own account');
        }

        const user = await prisma.user.findUnique({
            where: { id },
            select: userSelect,
        });

        if (!user) {
            throw ApiError.notFound('User not found');
        }

        await prisma.user.delete({ where: { id } });
        return { success: true };
    }

    static async deleteUser(id: string, currentUserId: string, actorUserId: string) {
        if (id === currentUserId) {
            throw ApiError.forbidden('Cannot delete your own account');
        }

        const user = await prisma.user.findUnique({
            where: { id },
            select: userSelect,
        });

        if (!user) {
            throw ApiError.notFound('User not found');
        }

        await prisma.user.update({
            where: { id },
            data: { deletedAt: new Date() },
        });

        userActiveCache.invalidate(id);

        const auditLog = await AuditLogService.logAction({
            action: 'DELETE',
            entityType: 'User',
            entityId: id,
            userId: actorUserId,
            changes: {
                before: user,
                after: null,
            },
            metadata: {
                source: 'admin.user.delete',
            },
        });

        broadcastAdminEvent('users:deleted', {
            user,
            actor: auditLog.user,
        });
        broadcastAdminEvent('dashboard:stats:update', {
            entity: 'user',
            action: 'DELETE',
            entityId: id,
        });
    }

    static async resetPassword(id: string, newPassword: string) {
        const user = await prisma.user.findUnique({
            where: { id },
            select: { id: true },
        });

        if (!user) {
            throw ApiError.notFound('User not found');
        }

        const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

        await prisma.user.update({
            where: { id },
            data: {
                password: hashedPassword,
            },
        });
    }

    static async bulkDeleteUsers(userIds: string[], currentUserId: string) {
        const uniqueUserIds = [...new Set(userIds)];

        if (uniqueUserIds.length === 0) {
            throw ApiError.badRequest('At least one user must be selected');
        }

        if (uniqueUserIds.includes(currentUserId)) {
            throw ApiError.forbidden('Cannot delete your own account');
        }

        const existingUsers = await prisma.user.findMany({
            where: { id: { in: uniqueUserIds } },
            select: { id: true },
        });

        if (existingUsers.length !== uniqueUserIds.length) {
            throw ApiError.notFound('One or more users were not found');
        }

        const result = await prisma.user.updateMany({
            where: { id: { in: uniqueUserIds }, deletedAt: null },
            data: { deletedAt: new Date() },
        });

        return {
            deletedCount: result.count,
        };
    }

    static async bulkUpdateUserRole(userIds: string[], role: UserRole) {
        const uniqueUserIds = [...new Set(userIds)];

        if (uniqueUserIds.length === 0) {
            throw ApiError.badRequest('At least one user must be selected');
        }

        const existingUsers = await prisma.user.findMany({
            where: { id: { in: uniqueUserIds } },
            select: { id: true },
        });

        if (existingUsers.length !== uniqueUserIds.length) {
            throw ApiError.notFound('One or more users were not found');
        }

        const result = await prisma.user.updateMany({
            where: { id: { in: uniqueUserIds } },
            data: { role },
        });

        return {
            updatedCount: result.count,
            role,
        };
    }

    static async bulkImportUsersFromCsv(fileBuffer: Buffer) {
        const rows = parseCsvBuffer(fileBuffer);

        if (rows.length === 0) {
            throw ApiError.badRequest('CSV file is empty');
        }

        const requiredColumns = ['name', 'email', 'role'];
        const missingColumns = requiredColumns.filter((column) => !(column in rows[0]));

        if (missingColumns.length > 0) {
            throw ApiError.badRequest('Missing required CSV columns', { missingColumns });
        }

        const normalizedRows = rows.map((row, index) => {
            const name = (row.name ?? '').trim();
            const email = (row.email ?? '').trim().toLowerCase();
            const role = (row.role ?? '').trim().toLowerCase() as UserRole;

            if (!name || !email || !role) {
                throw ApiError.badRequest(`Invalid data at row ${index + 2}`);
            }

            if (!['student', 'lecturer', 'admin'].includes(role)) {
                throw ApiError.badRequest(`Invalid role at row ${index + 2}`);
            }

            return { name, email, role };
        });

        const duplicateEmailsInFile = normalizedRows.filter(
            (row, index, list) => list.findIndex((item) => item.email === row.email) !== index
        );

        if (duplicateEmailsInFile.length > 0) {
            throw ApiError.conflict(`Duplicate email in CSV: ${duplicateEmailsInFile[0].email}`);
        }

        const existingUsers = await prisma.user.findMany({
            where: {
                email: {
                    in: normalizedRows.map((row) => row.email),
                },
            },
            select: { email: true },
        });

        if (existingUsers.length > 0) {
            throw ApiError.conflict(`Email already exists: ${existingUsers[0].email}`);
        }

        const hashedPassword = await bcrypt.hash(DEFAULT_IMPORTED_USER_PASSWORD, SALT_ROUNDS);

        const result = await prisma.user.createMany({
            data: normalizedRows.map((row) => ({
                ...row,
                password: hashedPassword,
            })),
        });

        return {
            createdCount: result.count,
            temporaryPassword: DEFAULT_IMPORTED_USER_PASSWORD,
        };
    }
}

function parseCsvBuffer(fileBuffer: Buffer) {
    const content = fileBuffer.toString('utf-8').replace(/^\uFEFF/, '');
    const rows: string[] = [];
    let currentRow = '';
    let inQuotes = false;

    for (let index = 0; index < content.length; index += 1) {
        const character = content[index];
        const nextCharacter = content[index + 1];

        if (character === '"') {
            if (inQuotes && nextCharacter === '"') {
                currentRow += '"';
                index += 1;
                continue;
            }

            inQuotes = !inQuotes;
            continue;
        }

        if ((character === '\n' || character === '\r') && !inQuotes) {
            if (character === '\r' && nextCharacter === '\n') {
                index += 1;
            }

            if (currentRow.trim().length > 0) {
                rows.push(currentRow);
            }
            currentRow = '';
            continue;
        }

        currentRow += character;
    }

    if (currentRow.trim().length > 0) {
        rows.push(currentRow);
    }

    if (rows.length === 0) {
        return [] as Record<string, string>[];
    }

    const headers = splitCsvRow(rows[0]);

    return rows.slice(1).map((row) => {
        const values = splitCsvRow(row);

        return headers.reduce<Record<string, string>>((record, header, index) => {
            record[header] = values[index] ?? '';
            return record;
        }, {});
    });
}

function splitCsvRow(row: string) {
    const values: string[] = [];
    let currentValue = '';
    let inQuotes = false;

    for (let index = 0; index < row.length; index += 1) {
        const character = row[index];
        const nextCharacter = row[index + 1];

        if (character === '"') {
            if (inQuotes && nextCharacter === '"') {
                currentValue += '"';
                index += 1;
                continue;
            }

            inQuotes = !inQuotes;
            continue;
        }

        if (character === ',' && !inQuotes) {
            values.push(currentValue.trim());
            currentValue = '';
            continue;
        }

        currentValue += character;
    }

    values.push(currentValue.trim());

    return values.map((value) => value.trim());
}
