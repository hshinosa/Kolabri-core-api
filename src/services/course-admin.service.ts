import prisma from '../config/database.js';
import { ApiError } from '../middleware/errorHandler.js';
import { AuditLogService } from './audit-log.service.js';
import { broadcastAdminEvent } from '../websocket/server.js';
import {
    BulkCourseSelectionInput,
    CreateCourseInput,
    ListCoursesQuery,
    UpdateCourseInput,
} from '../validators/course-admin.validator.js';
import {
    CreateCourseFromTemplateInput,
    CreateCourseTemplateInput,
} from '../validators/course-template.validator.js';
import { generateJoinCode } from '../utils/helpers.js';

const courseAdminInclude = {
    owner: {
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
        },
    },
    archivedBy: {
        select: {
            id: true,
            name: true,
            email: true,
        },
    },
    _count: {
        select: {
            students: true,
            groups: true,
        },
    },
} as const;

export class CourseAdminService {
    private static async logCourseAction(
        action: string,
        actorUserId: string,
        entityId: string,
        before: unknown,
        after: unknown,
        metadata?: Record<string, unknown>,
        event: 'courses:created' | 'courses:updated' | 'courses:deleted' = 'courses:updated'
    ) {
        const auditLog = await AuditLogService.logAction({
            action,
            entityType: 'Course',
            entityId,
            userId: actorUserId,
            changes: {
                before,
                after,
            },
            metadata: {
                source: 'admin.course',
                ...metadata,
            },
        });

        broadcastAdminEvent(event, {
            course: after ?? before,
            actor: auditLog.user,
            action,
        });
        broadcastAdminEvent('dashboard:stats:update', {
            entity: 'course',
            action,
            entityId,
        });
    }

    static async getCourses(query: ListCoursesQuery) {
        const { page, limit, search, ownerId, sortBy, sortOrder } = query;
        const skip = (page - 1) * limit;

        const where = {
            isArchived: false,
            deletedAt: null,
            ...(ownerId ? { ownerId } : {}),
            ...(search
                ? {
                      OR: [
                          {
                              code: {
                                  contains: search,
                                  mode: 'insensitive' as const,
                              },
                          },
                          {
                              name: {
                                  contains: search,
                                  mode: 'insensitive' as const,
                              },
                          },
                      ],
                  }
                : {}),
        };

        const [data, total] = await Promise.all([
            prisma.course.findMany({
                where,
                include: courseAdminInclude,
                skip,
                take: limit,
                orderBy: {
                    [sortBy]: sortOrder,
                },
            }),
            prisma.course.count({ where }),
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

    static async getCourseById(id: string) {
        const course = await prisma.course.findUnique({
            where: { id },
            include: {
                owner: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        role: true,
                        isActive: true,
                    },
                },
                groups: {
                    include: {
                        _count: {
                            select: {
                                members: true,
                                sessionDiscussions: true,
                            },
                        },
                    },
                    orderBy: {
                        createdAt: 'desc',
                    },
                },
                _count: {
                    select: {
                        students: true,
                        groups: true,
                    },
                },
            },
        });

        if (!course) {
            throw ApiError.notFound('Course not found');
        }

        return course;
    }

    static async createCourse(data: CreateCourseInput, actorUserId: string) {
        await this.ensureCourseCodeAvailable(data.code);
        await this.ensureLecturerOwner(data.ownerId);

        const joinCode = await this.generateUniqueJoinCode();

        const createdCourse = await prisma.course.create({
            data: {
                code: data.code,
                name: data.name,
                description: data.description,
                ownerId: data.ownerId,
                joinCode,
            },
            include: courseAdminInclude,
        });

        await this.logCourseAction('CREATE', actorUserId, createdCourse.id, null, createdCourse, undefined, 'courses:created');

        return createdCourse;
    }

    static async updateCourse(id: string, data: UpdateCourseInput, actorUserId: string) {
        const existingCourse = await prisma.course.findUnique({
            where: { id },
            include: courseAdminInclude,
        });

        if (!existingCourse) {
            throw ApiError.notFound('Course not found');
        }

        if (data.code && data.code !== existingCourse.code) {
            await this.ensureCourseCodeAvailable(data.code, id);
        }

        if (data.ownerId && data.ownerId !== existingCourse.ownerId) {
            await this.ensureLecturerOwner(data.ownerId);
        }

        const updatedCourse = await prisma.course.update({
            where: { id },
            data: {
                ...(data.code !== undefined ? { code: data.code } : {}),
                ...(data.name !== undefined ? { name: data.name } : {}),
                ...(data.description !== undefined ? { description: data.description } : {}),
                ...(data.ownerId !== undefined ? { ownerId: data.ownerId } : {}),
            },
            include: courseAdminInclude,
        });

        await this.logCourseAction('UPDATE', actorUserId, updatedCourse.id, existingCourse, updatedCourse, {
            source: 'admin.course.update',
        });

        return updatedCourse;
    }

    static async deleteCourse(id: string, actorUserId: string) {
        const course = await prisma.course.findUnique({
            where: { id },
            include: {
                ...courseAdminInclude,
                groups: {
                    select: { id: true },
                },
            },
        });

        if (!course) {
            throw ApiError.notFound('Course not found');
        }

        if (course.isArchived) {
            throw ApiError.badRequest('Archived course must be permanently deleted using the permanent delete endpoint');
        }

        const activeGroupsCount = await prisma.group.count({
            where: {
                courseId: id,
                isActive: true,
            },
        });

        if (activeGroupsCount > 0) {
            throw ApiError.badRequest('Cannot delete course with active groups', {
                activeGroupsCount,
                totalGroupsCount: course._count.groups,
                studentsCount: course._count.students,
            });
        }

        const groupIds = course.groups.map((g) => g.id);

        await prisma.$transaction(async (tx) => {
            if (groupIds.length > 0) {
                await tx.sessionDiscussion.updateMany({
                    where: { groupId: { in: groupIds } },
                    data: { deletedAt: new Date() },
                });
                await tx.group.updateMany({
                    where: { id: { in: groupIds } },
                    data: { deletedAt: new Date() },
                });
            }
            await tx.knowledgeBase.updateMany({
                where: { courseId: id },
                data: { deletedAt: new Date() },
            });
            await tx.course.update({
                where: { id },
                data: { deletedAt: new Date() },
            });
        });

        await this.logCourseAction('DELETE', actorUserId, id, course, null, {
            source: 'admin.course.delete',
        }, 'courses:deleted');
    }

    private static async ensureLecturerOwner(ownerId: string) {
        const owner = await prisma.user.findUnique({
            where: { id: ownerId },
            select: {
                id: true,
                role: true,
                isActive: true,
            },
        });

        if (!owner) {
            throw ApiError.notFound('Owner not found');
        }

        if (owner.role !== 'lecturer') {
            throw ApiError.badRequest('Owner must be a lecturer');
        }

        if (!owner.isActive) {
            throw ApiError.badRequest('Owner must be an active lecturer');
        }
    }

    private static async ensureCourseCodeAvailable(code: string, excludeId?: string) {
        const existingCourse = await prisma.course.findUnique({
            where: { code },
            select: { id: true },
        });

        if (existingCourse && existingCourse.id !== excludeId) {
            throw ApiError.conflict('Course code already exists');
        }
    }

    private static async generateUniqueJoinCode() {
        let joinCode = generateJoinCode();
        let attempts = 0;
        const maxAttempts = 10;

        while (attempts < maxAttempts) {
            const existingJoinCode = await prisma.course.findUnique({
                where: { joinCode },
                select: { id: true },
            });

            if (!existingJoinCode) {
                return joinCode;
            }

            joinCode = generateJoinCode();
            attempts++;
        }

        throw ApiError.internal('Failed to generate unique join code');
    }

    static async cloneCourse(id: string, data: { code: string; name: string }, actorUserId: string) {
        const sourceCourse = await prisma.course.findUnique({
            where: { id },
            select: {
                code: true,
                name: true,
                description: true,
                ownerId: true,
                isActive: true,
                isArchived: true,
            },
        });

        if (!sourceCourse) {
            throw ApiError.notFound('Course not found');
        }

        if (sourceCourse.isArchived) {
            throw ApiError.badRequest('Archived courses cannot be cloned');
        }

        await this.ensureCourseCodeAvailable(data.code);

        const joinCode = await this.generateUniqueJoinCode();

        const clonedCourse = await prisma.course.create({
            data: {
                code: data.code,
                name: data.name,
                description: sourceCourse.description,
                ownerId: sourceCourse.ownerId,
                joinCode,
                isActive: sourceCourse.isActive,
            },
            include: courseAdminInclude,
        });

        await this.logCourseAction('CLONE', actorUserId, clonedCourse.id, sourceCourse, clonedCourse, {
            source: 'admin.course.clone',
            sourceCourseId: id,
        }, 'courses:created');

        return clonedCourse;
    }

    static async createTemplate(data: CreateCourseTemplateInput, createdById: string) {
        await this.ensureAdminUser(createdById);

        let defaultGroups = data.defaultGroups;

        if (data.sourceCourseId) {
            const sourceCourse = await prisma.course.findUnique({
                where: { id: data.sourceCourseId },
                include: {
                    groups: {
                        select: {
                            name: true,
                        },
                        orderBy: {
                            createdAt: 'asc',
                        },
                    },
                },
            });

            if (!sourceCourse) {
                throw ApiError.notFound('Source course not found');
            }

            if (sourceCourse.isArchived) {
                throw ApiError.badRequest('Archived course cannot be used as template source');
            }

            defaultGroups = sourceCourse.groups.map((group) => ({
                name: group.name,
                description: undefined,
            }));
        }

        return prisma.courseTemplate.create({
            data: {
                name: data.name,
                description: data.description,
                namePattern: data.namePattern,
                descriptionTemplate: data.descriptionTemplate,
                defaultGroups,
                createdById,
            },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });
    }

    static async getTemplates() {
        return prisma.courseTemplate.findMany({
            include: {
                createdBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
    }

    static async getTemplateById(id: string) {
        const template = await prisma.courseTemplate.findUnique({
            where: { id },
            include: {
                createdBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });

        if (!template) {
            throw ApiError.notFound('Course template not found');
        }

        return template;
    }

    static async deleteTemplate(id: string) {
        const template = await prisma.courseTemplate.findUnique({
            where: { id },
            select: { id: true },
        });

        if (!template) {
            throw ApiError.notFound('Course template not found');
        }

        await prisma.courseTemplate.delete({
            where: { id },
        });
    }

    static async createCourseFromTemplate(templateId: string, data: CreateCourseFromTemplateInput) {
        const template = await prisma.courseTemplate.findUnique({
            where: { id: templateId },
            select: {
                id: true,
                descriptionTemplate: true,
                defaultGroups: true,
            },
        });

        if (!template) {
            throw ApiError.notFound('Course template not found');
        }

        await this.ensureCourseCodeAvailable(data.code);
        await this.ensureLecturerOwner(data.ownerId);

        const joinCode = await this.generateUniqueJoinCode();
        const defaultGroups = this.normalizeTemplateGroups(template.defaultGroups);

        return prisma.$transaction(async (tx) => {
            const course = await tx.course.create({
                data: {
                    code: data.code,
                    name: data.name,
                    description: data.description ?? template.descriptionTemplate,
                    ownerId: data.ownerId,
                    joinCode,
                },
                include: courseAdminInclude,
            });

            for (const group of defaultGroups) {
                await tx.group.create({
                    data: {
                        courseId: course.id,
                        name: group.name,
                        joinCode: await this.generateUniqueGroupJoinCode(tx),
                        createdBy: data.ownerId,
                    },
                });
            }

            return tx.course.findUnique({
                where: { id: course.id },
                include: courseAdminInclude,
            });
        });
    }

    static async archiveCourse(id: string, userId: string) {
        const course = await prisma.course.findUnique({
            where: { id },
            include: {
                ...courseAdminInclude,
                groups: {
                    select: {
                        id: true,
                        sessionDiscussions: {
                            where: {
                                closedAt: null,
                            },
                            select: {
                                id: true,
                            },
                        },
                    },
                },
            },
        });

        if (!course) {
            throw ApiError.notFound('Course not found');
        }

        if (course.isArchived) {
            throw ApiError.badRequest('Course is already archived');
        }

        await this.ensureAdminUser(userId);

        const activeSessionDiscussionsCount = course.groups.reduce((sum, group) => sum + group.sessionDiscussions.length, 0);

        if (activeSessionDiscussionsCount > 0) {
            throw ApiError.badRequest('Cannot archive course with active session discussions', {
                activeSessionDiscussionsCount,
                groupsCount: course._count.groups,
            });
        }

        const archivedCourse = await prisma.course.update({
            where: { id },
            data: {
                isArchived: true,
                archivedAt: new Date(),
                archivedById: userId,
            },
            include: courseAdminInclude,
        });

        await this.logCourseAction('ARCHIVE', userId, id, course, archivedCourse, {
            source: 'admin.course.archive',
        });

        return archivedCourse;
    }

    static async restoreCourse(id: string, actorUserId: string) {
        const course = await prisma.course.findUnique({
            where: { id },
            include: courseAdminInclude,
        });

        if (!course) {
            throw ApiError.notFound('Course not found');
        }

        if (!course.isArchived) {
            throw ApiError.badRequest('Course is not archived');
        }

        const restoredCourse = await prisma.course.update({
            where: { id },
            data: {
                isArchived: false,
                archivedAt: null,
                archivedById: null,
            },
            include: courseAdminInclude,
        });

        await this.logCourseAction('RESTORE', actorUserId, id, course, restoredCourse, {
            source: 'admin.course.restore',
        });

        return restoredCourse;
    }

    static async getArchivedCourses(query: ListCoursesQuery) {
        const { page, limit, search, ownerId, sortBy, sortOrder } = query;
        const skip = (page - 1) * limit;

        const where = {
            isArchived: true,
            ...(ownerId ? { ownerId } : {}),
            ...(search
                ? {
                      OR: [
                          {
                              code: {
                                  contains: search,
                                  mode: 'insensitive' as const,
                              },
                          },
                          {
                              name: {
                                  contains: search,
                                  mode: 'insensitive' as const,
                              },
                          },
                      ],
                  }
                : {}),
        };

        const [data, total] = await Promise.all([
            prisma.course.findMany({
                where,
                include: courseAdminInclude,
                skip,
                take: limit,
                orderBy: {
                    [sortBy]: sortOrder,
                },
            }),
            prisma.course.count({ where }),
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

    static async permanentlyDeleteCourse(id: string, actorUserId: string) {
        const course = await prisma.course.findUnique({
            where: { id },
            include: courseAdminInclude,
        });

        if (!course) {
            throw ApiError.notFound('Course not found');
        }

        if (!course.isArchived) {
            throw ApiError.badRequest('Only archived courses can be permanently deleted');
        }

        await prisma.course.delete({
            where: { id },
        });

        await this.logCourseAction('DELETE', actorUserId, id, course, null, {
            source: 'admin.course.permanent-delete',
            mode: 'permanent',
        }, 'courses:deleted');
    }

    static async bulkActivateCourses(courseIds: BulkCourseSelectionInput['courseIds'], actorUserId: string) {
        return this.bulkUpdateCourseActiveState(courseIds, true, actorUserId);
    }

    static async bulkDeactivateCourses(courseIds: BulkCourseSelectionInput['courseIds'], actorUserId: string) {
        return this.bulkUpdateCourseActiveState(courseIds, false, actorUserId);
    }

    static async bulkImportCoursesFromCsv(fileBuffer: Buffer) {
        const rows = parseCsvBuffer(fileBuffer);

        if (rows.length === 0) {
            throw ApiError.badRequest('CSV file is empty');
        }

        const requiredColumns = ['code', 'name', 'owner_id'];
        const missingColumns = requiredColumns.filter((column) => !(column in rows[0]));

        if (missingColumns.length > 0) {
            throw ApiError.badRequest('Missing required CSV columns', { missingColumns });
        }

        const normalizedRows = rows.map((row, index) => {
            const code = (row.code ?? '').trim().toUpperCase();
            const name = (row.name ?? '').trim();
            const description = (row.description ?? '').trim() || null;
            const ownerId = (row.owner_id ?? '').trim();

            if (!code || !name || !ownerId) {
                throw ApiError.badRequest(`Invalid data at row ${index + 2}`);
            }

            if (!/^[A-Z0-9]+$/.test(code)) {
                throw ApiError.badRequest(`Invalid course code at row ${index + 2}`);
            }

            return { code, name, description, ownerId };
        });

        const duplicateCodes = normalizedRows.filter(
            (row, index, list) => list.findIndex((item) => item.code === row.code) !== index
        );

        if (duplicateCodes.length > 0) {
            throw ApiError.conflict(`Duplicate course code in CSV: ${duplicateCodes[0].code}`);
        }

        const existingCourses = await prisma.course.findMany({
            where: {
                code: {
                    in: normalizedRows.map((row) => row.code),
                },
            },
            select: { code: true },
        });

        if (existingCourses.length > 0) {
            throw ApiError.conflict(`Course code already exists: ${existingCourses[0].code}`);
        }

        const ownerIds = [...new Set(normalizedRows.map((row) => row.ownerId))];
        const owners = await prisma.user.findMany({
            where: { id: { in: ownerIds } },
            select: { id: true, role: true, isActive: true },
        });

        if (owners.length !== ownerIds.length) {
            throw ApiError.badRequest('One or more owner_id values are invalid');
        }

        for (const owner of owners) {
            if (owner.role !== 'lecturer') {
                throw ApiError.badRequest(`Owner ${owner.id} must be a lecturer`);
            }

            if (!owner.isActive) {
                throw ApiError.badRequest(`Owner ${owner.id} must be active`);
            }
        }

        const data: Array<{
            code: string;
            name: string;
            description: string | null;
            ownerId: string;
            joinCode: string;
            isActive: boolean;
        }> = [];

        for (const row of normalizedRows) {
            data.push({
                code: row.code,
                name: row.name,
                description: row.description,
                ownerId: row.ownerId,
                joinCode: await this.generateUniqueJoinCode(),
                isActive: true,
            });
        }

        const result = await prisma.course.createMany({ data });

        return {
            createdCount: result.count,
        };
    }

    private static async ensureAdminUser(userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                role: true,
                isActive: true,
            },
        });

        if (!user) {
            throw ApiError.notFound('User not found');
        }

        if (user.role !== 'admin') {
            throw ApiError.badRequest('Action requires an admin user');
        }

        if (!user.isActive) {
            throw ApiError.badRequest('Admin user must be active');
        }
    }

    private static async bulkUpdateCourseActiveState(courseIds: string[], isActive: boolean, actorUserId: string) {
        const uniqueCourseIds = [...new Set(courseIds)];

        if (uniqueCourseIds.length === 0) {
            throw ApiError.badRequest('At least one course must be selected');
        }

        const existingCourses = await prisma.course.findMany({
            where: {
                id: { in: uniqueCourseIds },
                isArchived: false,
            },
            include: courseAdminInclude,
        });

        if (existingCourses.length !== uniqueCourseIds.length) {
            throw ApiError.notFound('One or more courses were not found');
        }

        const result = await prisma.course.updateMany({
            where: {
                id: { in: uniqueCourseIds },
                isArchived: false,
            },
            data: { isActive },
        });

        await Promise.all(
            existingCourses.map((course) =>
                AuditLogService.logAction({
                    action: isActive ? 'ACTIVATE' : 'DEACTIVATE',
                    entityType: 'Course',
                    entityId: course.id,
                    userId: actorUserId,
                    changes: {
                        before: course,
                        after: {
                            ...course,
                            isActive,
                        },
                    },
                    metadata: {
                        source: 'admin.course.bulk-active-state',
                    },
                })
            )
        );

        broadcastAdminEvent('courses:updated', {
            courseIds: uniqueCourseIds,
            isActive,
            action: isActive ? 'ACTIVATE' : 'DEACTIVATE',
        });
        broadcastAdminEvent('dashboard:stats:update', {
            entity: 'course',
            action: isActive ? 'ACTIVATE' : 'DEACTIVATE',
            entityIds: uniqueCourseIds,
        });

        return {
            updatedCount: result.count,
            isActive,
        };
    }

    private static normalizeTemplateGroups(defaultGroups: unknown): Array<{ name: string; description?: string }> {
        if (!Array.isArray(defaultGroups)) {
            return [];
        }

        return defaultGroups
            .filter((group): group is { name?: unknown; description?: unknown } => !!group && typeof group === 'object')
            .map((group) => ({
                name: typeof group.name === 'string' ? group.name.trim() : '',
                description: typeof group.description === 'string' ? group.description.trim() || undefined : undefined,
            }))
            .filter((group) => group.name.length > 0);
    }

    private static async generateUniqueGroupJoinCode(
        tx: Pick<typeof prisma, 'group'>
    ) {
        let joinCode = generateJoinCode();
        let attempts = 0;
        const maxAttempts = 10;

        while (attempts < maxAttempts) {
            const existingJoinCode = await tx.group.findUnique({
                where: { joinCode },
                select: { id: true },
            });

            if (!existingJoinCode) {
                return joinCode;
            }

            joinCode = generateJoinCode();
            attempts++;
        }

        throw ApiError.internal('Failed to generate unique group join code');
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
