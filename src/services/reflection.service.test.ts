import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, invalidateDashboardCacheMock } = vi.hoisted(() => ({
    prismaMock: {
        learningGoal: { findUnique: vi.fn() },
        reflection: { create: vi.fn(), findMany: vi.fn() },
        courseStudent: { findFirst: vi.fn() },
    },
    invalidateDashboardCacheMock: vi.fn(),
}));

vi.mock('../config/database.js', () => ({
    default: prismaMock,
}));

vi.mock('./dashboard.service.js', () => ({
    invalidateDashboardCache: invalidateDashboardCacheMock,
}));

import { ReflectionService } from './reflection.service.js';

describe('ReflectionService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('creates a reflection when the user belongs to the goal group', async () => {
        const createdAt = new Date('2026-05-01T00:00:00.000Z');
        prismaMock.learningGoal.findUnique.mockResolvedValue({
            id: 'goal-1',
            chatSpace: {
                group: {
                    members: [{ userId: 'student-1' }],
                },
            },
        });
        prismaMock.reflection.create.mockResolvedValue({
            id: 'reflection-1',
            content: 'I synthesized multiple viewpoints.',
            type: 'session',
            goal: { id: 'goal-1', content: 'Synthesize arguments' },
            user: { id: 'student-1', name: 'Alya' },
            createdAt,
        });

        const result = await ReflectionService.createReflection({ goalId: 'goal-1', content: 'I synthesized multiple viewpoints.' }, 'student-1');

        expect(prismaMock.reflection.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: {
                    content: 'I synthesized multiple viewpoints.',
                    type: 'session',
                    goalId: 'goal-1',
                    userId: 'student-1',
                },
            })
        );
        expect(result).toEqual({
            id: 'reflection-1',
            content: 'I synthesized multiple viewpoints.',
            type: 'session',
            goal: { id: 'goal-1', content: 'Synthesize arguments' },
            createdBy: { id: 'student-1', name: 'Alya' },
            createdAt,
        });
        expect(invalidateDashboardCacheMock).toHaveBeenCalledTimes(1);
    });

    it('rejects reflection creation for users outside the group', async () => {
        prismaMock.learningGoal.findUnique.mockResolvedValue({
            id: 'goal-1',
            chatSpace: {
                group: {
                    members: [{ userId: 'student-2' }],
                },
            },
        });

        await expect(ReflectionService.createReflection({ goalId: 'goal-1', content: 'Reflection' }, 'student-1')).rejects.toMatchObject({
            statusCode: 403,
            message: 'You are not a member of this group',
        });
    });

    it('creates a weekly reflection when the user is enrolled in the course', async () => {
        const createdAt = new Date('2026-05-02T00:00:00.000Z');
        prismaMock.courseStudent.findFirst.mockResolvedValue({ id: 'enroll-1', courseId: 'course-1', userId: 'student-1' });
        prismaMock.reflection.create.mockResolvedValue({
            id: 'reflection-2',
            content: 'This week I learned a lot about RAG.',
            type: 'weekly',
            course: { id: 'course-1', code: 'IF201', name: 'Web' },
            user: { id: 'student-1', name: 'Alya' },
            createdAt,
        });

        const result = await ReflectionService.createReflection(
            { courseId: 'course-1', type: 'weekly', content: 'This week I learned a lot about RAG.' },
            'student-1',
        );

        expect(prismaMock.learningGoal.findUnique).not.toHaveBeenCalled();
        expect(prismaMock.reflection.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: {
                    content: 'This week I learned a lot about RAG.',
                    type: 'weekly',
                    courseId: 'course-1',
                    userId: 'student-1',
                },
            })
        );
        expect(result).toMatchObject({
            id: 'reflection-2',
            type: 'weekly',
            course: { id: 'course-1', code: 'IF201', name: 'Web' },
        });
        expect(invalidateDashboardCacheMock).toHaveBeenCalledTimes(1);
    });

    it('rejects a weekly reflection when the user is not enrolled in the course', async () => {
        prismaMock.courseStudent.findFirst.mockResolvedValue(null);

        await expect(
            ReflectionService.createReflection({ courseId: 'course-1', type: 'weekly', content: 'Reflection content here.' }, 'student-1'),
        ).rejects.toMatchObject({
            statusCode: 403,
            message: 'You are not enrolled in this course',
        });
        expect(prismaMock.reflection.create).not.toHaveBeenCalled();
    });

    it('maps personal reflections using direct chat space data when available', async () => {
        const createdAt = new Date('2026-05-02T00:00:00.000Z');
        prismaMock.reflection.findMany.mockResolvedValue([
            {
                id: 'reflection-1',
                content: 'Session reflection',
                type: 'session',
                goal: null,
                chatSpace: {
                    id: 'chat-1',
                    name: 'General',
                    group: {
                        id: 'group-1',
                        name: 'Group 1',
                        course: { id: 'course-1', code: 'IF101', name: 'Intro AI' },
                    },
                },
                createdAt,
            },
        ]);

        const result = await ReflectionService.getMyReflections('student-1');

        expect(result).toEqual([
            {
                id: 'reflection-1',
                content: 'Session reflection',
                type: 'session',
                goal: null,
                chatSpace: { id: 'chat-1', name: 'General' },
                course: { id: 'course-1', code: 'IF101', name: 'Intro AI' },
                group: { id: 'group-1', name: 'Group 1' },
                createdAt,
                created_at: createdAt,
            },
        ]);
    });

    it('returns goal reflections for the course owner', async () => {
        const createdAt = new Date('2026-05-03T00:00:00.000Z');
        prismaMock.learningGoal.findUnique.mockResolvedValue({
            id: 'goal-1',
            chatSpace: {
                group: {
                    course: { ownerId: 'lecturer-1' },
                    members: [{ userId: 'student-1' }],
                },
            },
        });
        prismaMock.reflection.findMany.mockResolvedValue([
            { id: 'reflection-1', content: 'Great progress', user: { id: 'student-1', name: 'Alya' }, createdAt },
        ]);

        const result = await ReflectionService.getGoalReflections('goal-1', 'lecturer-1', 'lecturer');

        expect(result).toEqual([
            {
                id: 'reflection-1',
                content: 'Great progress',
                createdBy: { id: 'student-1', name: 'Alya' },
                createdAt,
            },
        ]);
    });

    it('rejects lecturers who do not own the course when reading goal reflections', async () => {
        prismaMock.learningGoal.findUnique.mockResolvedValue({
            id: 'goal-1',
            chatSpace: {
                group: {
                    course: { ownerId: 'lecturer-1' },
                    members: [{ userId: 'student-1' }],
                },
            },
        });

        await expect(ReflectionService.getGoalReflections('goal-1', 'lecturer-2', 'lecturer')).rejects.toMatchObject({
            statusCode: 403,
            message: 'You do not own this course',
        });
    });
});
