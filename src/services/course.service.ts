import prisma from '../config/database.js';
import { ApiError } from '../middleware/errorHandler.js';
import { CreateCourseInput, JoinCourseInput } from '../validators/course.validator.js';
import { generateJoinCode } from '../utils/helpers.js';
import { cache } from '../utils/cache.js';

export class CourseService {
    /**
     * Create a new course (lecturer only)
     */
    static async createCourse(data: CreateCourseInput, lecturerId: string) {
        const existingCourse = await prisma.course.findUnique({
            where: { code: data.code },
        });

        if (existingCourse) {
            throw ApiError.conflict('Course code already exists');
        }

        let joinCode = generateJoinCode();
        let attempts = 0;
        const maxAttempts = 10;

        while (attempts < maxAttempts) {
            const existingJoinCode = await prisma.course.findUnique({
                where: { joinCode },
            });

            if (!existingJoinCode) break;

            joinCode = generateJoinCode();
            attempts++;
        }

        if (attempts >= maxAttempts) {
            throw ApiError.internal('Failed to generate unique join code');
        }

        const course = await prisma.course.create({
            data: {
                code: data.code,
                name: data.name,
                description: data.description,
                joinCode,
                minMembersPerGroup: data.min_members_per_group,
                maxMembersPerGroup: data.max_members_per_group,
                aiGuardrailConfig: {
                    preset: data.ai_guardrail_preset ?? 'balanced',
                    allowRewrite: data.ai_guardrail_allow_rewrite ?? true,
                    allowFlagOnly: data.ai_guardrail_allow_flag_only ?? false,
                },
                aiScaffoldingConfig: {
                    scaffoldingLevel: data.ai_scaffolding_level ?? 'auto',
                    enabled: data.ai_scaffolding_enabled ?? true,
                },
                semester: data.semester,
                academicYear: data.academic_year,
                ownerId: lecturerId,
            },
            include: {
                owner: {
                    select: { id: true, name: true, email: true },
                },
            },
        });

        cache.invalidatePattern(`courses:${lecturerId}:`);
        return course;
    }

    /**
     * Join a course with join code (student only)
     */
    static async joinCourse(data: JoinCourseInput, studentId: string) {
        // Find course by join code (data.join_code from Laravel)
        const joinCode = data.join_code;
        const course = await prisma.course.findFirst({
            where: { joinCode, deletedAt: null },
        });

        if (!course) {
            throw ApiError.notFound('Invalid join code');
        }

        if (course.isArchived) {
            throw ApiError.forbidden('This course is archived');
        }

        if (!course.isActive) {
            throw ApiError.forbidden('This course is no longer active');
        }

        // Check if already enrolled
        const existingEnrollment = await prisma.courseStudent.findUnique({
            where: {
                courseId_userId: {
                    courseId: course.id,
                    userId: studentId,
                },
            },
        });

        if (existingEnrollment) {
            throw ApiError.conflict('Already enrolled in this course');
        }

        // Enroll student
        await prisma.courseStudent.create({
            data: {
                courseId: course.id,
                userId: studentId,
            },
        });

        // Invalidate student's course cache so the new course appears immediately
        cache.invalidatePattern(`courses:${studentId}:`);

        return {
            id: course.id,
            code: course.code,
            name: course.name,
            description: course.description,
        };
    }

    /**
     * Get all courses for a user (owned or enrolled)
     */
    static async getMyCourses(userId: string, role: string) {
        const cacheKey = `courses:${userId}:${role}`;
        const cached = cache.get(cacheKey);
        if (cached) return cached;

        let result;
        if (role === 'lecturer') {
            const courses = await prisma.course.findMany({
                where: { ownerId: userId, isArchived: false, deletedAt: null },
                include: {
                    owner: {
                        select: { id: true, name: true, email: true },
                    },
                    _count: {
                        select: {
                            students: true,
                            groups: true,
                            aiUsages: true,
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
            });

            result = courses.map((course: typeof courses[number]) => ({
                id: course.id,
                code: course.code,
                name: course.name,
                description: course.description,
                joinCode: course.joinCode,
                semester: course.semester,
                academic_year: course.academicYear,
                owner: course.owner,
                students_count: course._count.students,
                groups_count: course._count.groups,
                engagement_count: course._count.aiUsages,
                createdAt: course.createdAt,
            }));
        } else {
            const enrollments = await prisma.courseStudent.findMany({
                where: { userId },
                include: {
                    course: {
                        include: {
                            owner: {
                                select: { id: true, name: true },
                            },
                            _count: {
                                select: { students: true },
                            },
                        },
                    },
                },
                orderBy: { enrolledAt: 'desc' },
            });

            result = enrollments
                .filter((enrollment: typeof enrollments[number]) => !enrollment.course.isArchived)
                .map((enrollment: typeof enrollments[number]) => ({
                id: enrollment.course.id,
                code: enrollment.course.code,
                name: enrollment.course.name,
                description: enrollment.course.description,
                ownerName: enrollment.course.owner.name,
                owner: enrollment.course.owner,
                students_count: enrollment.course._count.students,
                enrolledAt: enrollment.enrolledAt,
            }));
        }

        cache.set(cacheKey, result, 3 * 60 * 1000);
        return result;
    }

    /**
     * Get course details with groups and knowledge base
     */
    static async getCourseDetails(courseId: string, userId: string, role: string) {
        const course = await prisma.course.findUnique({
            where: { id: courseId },
            include: {
                owner: {
                    select: { id: true, name: true, email: true },
                },
                groups: {
                    include: {
                        members: {
                            include: {
                                user: {
                                    select: { id: true, name: true, email: true },
                                },
                            },
                        },
                        chatSpaces: {
                            include: {
                                _count: {
                                    select: { goals: true },
                                },
                            },
                        },
                        _count: {
                            select: { members: true, chatSpaces: true },
                        },
                    },
                },
                knowledgeBases: {
                    select: {
                        id: true,
                        fileName: true,
                        fileSize: true,
                        mimeType: true,
                        vectorStatus: true,
                        errorMessage: true,
                        uploadedAt: true,
                        processedAt: true,
                    },
                    orderBy: { uploadedAt: 'desc' },
                },
                _count: {
                    select: { students: true, groups: true },
                },
            },
        });

        if (!course) {
            throw ApiError.notFound('Course not found');
        }

        if (course.isArchived) {
            throw ApiError.forbidden('This course is archived');
        }

        // Check access: owner or enrolled student
        if (role === 'lecturer') {
            if (course.ownerId !== userId) {
                throw ApiError.forbidden('You do not own this course');
            }
        } else {
            const enrollment = await prisma.courseStudent.findUnique({
                where: {
                    courseId_userId: {
                        courseId,
                        userId,
                    },
                },
            });

            if (!enrollment) {
                throw ApiError.forbidden('You are not enrolled in this course');
            }
        }

        const courseRecord = course as unknown as Record<string, unknown>;
        const aiGuardrailConfig = (courseRecord.aiGuardrailConfig as Record<string, unknown> | null) ?? {};
        const aiScaffoldingConfig = (courseRecord.aiScaffoldingConfig as Record<string, unknown> | null) ?? {};

        return {
            id: course.id,
            code: course.code,
            name: course.name,
            description: course.description,
            join_code: role === 'lecturer' ? course.joinCode : undefined,
            min_members_per_group: (courseRecord.minMembersPerGroup as number | undefined) ?? 1,
            max_members_per_group: (courseRecord.maxMembersPerGroup as number | undefined) ?? 1000,
            ai_guardrail_preset: (aiGuardrailConfig.preset as string | undefined) ?? 'balanced',
            ai_guardrail_allow_rewrite: (aiGuardrailConfig.allowRewrite as boolean | undefined) ?? true,
            ai_guardrail_allow_flag_only: (aiGuardrailConfig.allowFlagOnly as boolean | undefined) ?? false,
            ai_scaffolding_level: (aiScaffoldingConfig.scaffoldingLevel as string | undefined) ?? 'auto',
            ai_scaffolding_enabled: (aiScaffoldingConfig.enabled as boolean | undefined) ?? true,
            owner: course.owner,
            groups: course.groups.map((group: typeof course.groups[number]) => {
                // Sum goals from all chatSpaces in this group
                const totalGoals = group.chatSpaces.reduce(
                    (sum: number, cs: typeof group.chatSpaces[number]) => sum + cs._count.goals, 
                    0
                );
                return {
                    id: group.id,
                    name: group.name,
                    members: group.members.map((m: typeof group.members[number]) => m.user),
                    goalsCount: totalGoals,
                    chatSpacesCount: group._count.chatSpaces,
                };
            }),
            knowledge_base: course.knowledgeBases.map((kb: typeof course.knowledgeBases[number]) => ({
                id: kb.id,
                file_name: kb.fileName,
                file_size: kb.fileSize,
                file_type: kb.mimeType,
                vector_status: kb.vectorStatus,
                uploaded_at: kb.uploadedAt,
                processed_at: kb.processedAt,
                error_message: kb.errorMessage,
            })),
            students_count: course._count.students,
            groups_count: course._count.groups,
            createdAt: course.createdAt,
        };
    }

    /**
     * Soft delete a course with cascade to groups and chat spaces
     */
    static async softDeleteCourse(courseId: string, lecturerId: string) {
        const course = await prisma.course.findFirst({
            where: { id: courseId, ownerId: lecturerId, deletedAt: null },
            include: {
                groups: {
                    where: { deletedAt: null },
                    select: { id: true },
                },
            },
        });

        if (!course) {
            throw ApiError.notFound('Course not found or access denied');
        }

        const now = new Date();
        const groupIds = course.groups.map((g: { id: string }) => g.id);

        await prisma.$transaction([
            prisma.chatSpace.updateMany({
                where: { groupId: { in: groupIds }, deletedAt: null },
                data: { deletedAt: now },
            }),
            prisma.group.updateMany({
                where: { courseId, deletedAt: null },
                data: { deletedAt: now },
            }),
            prisma.course.update({
                where: { id: courseId },
                data: { deletedAt: now },
            }),
        ]);

        cache.invalidatePattern(`courses:${lecturerId}:`);
        return { success: true };
    }

    /**
     * Update a course (lecturer only, must own course).
     * Supports partial updates: name, description, semester, academicYear, status.
     */
    static async updateCourse(courseId: string, lecturerId: string, data: Record<string, unknown>) {
        const course = await prisma.course.findFirst({
            where: { id: courseId, ownerId: lecturerId, deletedAt: null },
        });

        if (!course) {
            throw ApiError.notFound('Course not found or access denied');
        }

        const updateData: Record<string, unknown> = {};

        if (data.name !== undefined) updateData.name = data.name;
        if (data.description !== undefined) updateData.description = data.description;
        if (data.min_members_per_group !== undefined) updateData.minMembersPerGroup = data.min_members_per_group;
        if (data.max_members_per_group !== undefined) updateData.maxMembersPerGroup = data.max_members_per_group;
        if (
            data.ai_guardrail_preset !== undefined
            || data.ai_guardrail_allow_rewrite !== undefined
            || data.ai_guardrail_allow_flag_only !== undefined
        ) {
            const currentPolicy = (((course as unknown as Record<string, unknown>).aiGuardrailConfig) as Record<string, unknown> | null) ?? {};
            updateData.aiGuardrailConfig = {
                preset: data.ai_guardrail_preset ?? currentPolicy.preset ?? 'balanced',
                allowRewrite: data.ai_guardrail_allow_rewrite ?? currentPolicy.allowRewrite ?? true,
                allowFlagOnly: data.ai_guardrail_allow_flag_only ?? currentPolicy.allowFlagOnly ?? false,
            };
        }
        if (
            data.ai_scaffolding_level !== undefined
            || data.ai_scaffolding_enabled !== undefined
        ) {
            const currentScaffolding = (((course as unknown as Record<string, unknown>).aiScaffoldingConfig) as Record<string, unknown> | null) ?? {};
            updateData.aiScaffoldingConfig = {
                scaffoldingLevel: data.ai_scaffolding_level ?? currentScaffolding.scaffoldingLevel ?? 'auto',
                enabled: data.ai_scaffolding_enabled ?? currentScaffolding.enabled ?? true,
            };
        }
        if (data.semester !== undefined) updateData.semester = data.semester;
        if (data.academic_year !== undefined) updateData.academicYear = data.academic_year;

        if (data.status === 'selesai') {
            updateData.isActive = false;
            updateData.isArchived = true;
            updateData.archivedAt = new Date();
            updateData.archivedById = lecturerId;
        } else if (data.status === 'aktif') {
            updateData.isActive = true;
            updateData.isArchived = false;
            updateData.archivedAt = null;
            updateData.archivedById = null;
        }

        const updated = await prisma.course.update({
            where: { id: courseId },
            data: updateData,
        });

        cache.invalidatePattern(`courses:${lecturerId}:`);
        return updated;
    }

    static async getCourseStudents(courseId: string, userId: string) {
        // Verify course exists
        const course = await prisma.course.findUnique({
            where: { id: courseId },
        });

        if (!course) {
            throw ApiError.notFound('Course not found');
        }

        // Check if user is the course owner (lecturer)
        const isOwner = course.ownerId === userId;

        // Check if user is an enrolled student
        const isEnrolled = await prisma.courseStudent.findUnique({
            where: {
                courseId_userId: {
                    courseId,
                    userId,
                },
            },
        });

        if (!isOwner && !isEnrolled) {
            throw ApiError.forbidden('You must be the course owner or an enrolled student to view students');
        }

        const enrollments = await prisma.courseStudent.findMany({
            where: { courseId },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
            orderBy: { enrolledAt: 'desc' },
        });

        return enrollments.map((e: typeof enrollments[number]) => ({
            ...e.user,
            enrolledAt: e.enrolledAt,
        }));
    }
}
