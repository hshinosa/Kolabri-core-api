import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, isGroupMemberMock, validateGoalContentMock } = vi.hoisted(() => ({
    prismaMock: {
        chatSpace: { findUnique: vi.fn(), findFirst: vi.fn() },
        learningGoal: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    },
    isGroupMemberMock: vi.fn(),
    validateGoalContentMock: vi.fn(),
}));

vi.mock('../config/database.js', () => ({
    default: prismaMock,
}));

vi.mock('../utils/helpers.js', () => ({
    validateGoalContent: validateGoalContentMock,
}));

vi.mock('./group.service.js', () => ({
    GroupService: {
        isGroupMember: isGroupMemberMock,
    },
}));

vi.mock('./aiEngine.service.js', () => ({
    aiEngineService: {
        validateGoal: vi.fn(() => Promise.resolve({
            success: true,
            is_valid: true,
            feedback: undefined,
            socratic_hint: undefined,
            missing_criteria: [],
        })),
        refineGoal: vi.fn(() => Promise.resolve({ success: true, refined_goal: null })),
    },
}));

import { GoalService } from './goal.service.js';

describe('GoalService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('creates a shared goal for a chat space when validation passes', async () => {
        prismaMock.chatSpace.findFirst.mockResolvedValue({
            id: 'chat-1',
            groupId: 'group-1',
            group: { id: 'group-1', name: 'Group 1' },
        });
        isGroupMemberMock.mockResolvedValue(true);
        prismaMock.learningGoal.findFirst.mockResolvedValue(null);
        validateGoalContentMock.mockReturnValue({ isValid: true, message: 'Tujuan valid' });
        prismaMock.learningGoal.create.mockResolvedValue({
            id: 'goal-1',
            content: 'Menganalisis data pembelajaran secara kolaboratif.',
            isValidated: true,
            createdAt: new Date('2026-05-01T00:00:00.000Z'),
            user: { id: 'user-1', name: 'Student One' },
            chatSpace: { id: 'chat-1', name: 'Chat 1', group: { id: 'group-1', name: 'Group 1' } },
        });

        const result = await GoalService.createGoal(
            {
                chat_space_id: 'chat-1',
                content: 'Menganalisis data pembelajaran secara kolaboratif.',
            },
            'user-1'
        );

        expect(validateGoalContentMock).toHaveBeenCalledWith('Menganalisis data pembelajaran secara kolaboratif.');
        expect(prismaMock.learningGoal.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: {
                    content: 'Menganalisis data pembelajaran secara kolaboratif.',
                    chatSpaceId: 'chat-1',
                    userId: 'user-1',
                    isValidated: true,
                },
            })
        );
        expect(result).toEqual({
            id: 'goal-1',
            content: 'Menganalisis data pembelajaran secara kolaboratif.',
            isValidated: true,
            chatSpace: { id: 'chat-1', name: 'Chat 1', group: { id: 'group-1', name: 'Group 1' } },
            createdBy: { id: 'user-1', name: 'Student One' },
            createdAt: new Date('2026-05-01T00:00:00.000Z'),
        });
    });

    it('returns the existing shared goal instead of creating a duplicate', async () => {
        prismaMock.chatSpace.findFirst.mockResolvedValue({ id: 'chat-1', groupId: 'group-1' });
        isGroupMemberMock.mockResolvedValue(true);
        prismaMock.learningGoal.findFirst.mockResolvedValue({
            id: 'goal-1',
            content: 'Existing goal',
            isValidated: true,
            createdAt: new Date('2026-05-01T00:00:00.000Z'),
            user: { id: 'user-1', name: 'Student One' },
            chatSpace: { id: 'chat-1', name: 'Chat 1', group: { id: 'group-1', name: 'Group 1' } },
        });

        const result = await GoalService.createGoal({ chat_space_id: 'chat-1', content: 'Existing goal' }, 'user-1');

        expect(prismaMock.learningGoal.create).not.toHaveBeenCalled();
        expect(result.id).toBe('goal-1');
    });

    it('rejects goal creation for unknown chat spaces', async () => {
        prismaMock.chatSpace.findFirst.mockResolvedValue(null);

        await expect(
            GoalService.createGoal({ chat_space_id: 'chat-1', content: 'Menganalisis topik pembelajaran bersama-sama.' }, 'user-1')
        ).rejects.toMatchObject({
            statusCode: 404,
            message: 'Chat space not found',
        });
    });

    it('rejects goal creation when the user is not a group member', async () => {
        prismaMock.chatSpace.findFirst.mockResolvedValue({ id: 'chat-1', groupId: 'group-1' });
        isGroupMemberMock.mockResolvedValue(false);

        await expect(
            GoalService.createGoal({ chat_space_id: 'chat-1', content: 'Menganalisis topik pembelajaran bersama-sama.' }, 'user-1')
        ).rejects.toMatchObject({
            statusCode: 403,
            message: 'You are not a member of this group',
        });
    });

    it('rejects goal creation when SMART/Bloom validation fails', async () => {
        prismaMock.chatSpace.findFirst.mockResolvedValue({ id: 'chat-1', groupId: 'group-1' });
        isGroupMemberMock.mockResolvedValue(true);
        prismaMock.learningGoal.findFirst.mockResolvedValue(null);
        validateGoalContentMock.mockReturnValue({
            isValid: false,
            message: 'Tujuan harus mengandung kata kerja aksi dari Taksonomi Bloom',
        });

        await expect(
            GoalService.createGoal({ chat_space_id: 'chat-1', content: 'Belajar lebih baik saja.' }, 'user-1')
        ).rejects.toMatchObject({
            statusCode: 400,
            message: 'Tujuan harus mengandung kata kerja aksi dari Taksonomi Bloom',
        });
    });

    it('returns empty goals for a chat space with no shared goal', async () => {
        prismaMock.chatSpace.findFirst.mockResolvedValue({
            id: 'chat-1',
            groupId: 'group-1',
            group: { course: { ownerId: 'lecturer-1' } },
        });
        isGroupMemberMock.mockResolvedValue(true);
        prismaMock.learningGoal.findFirst.mockResolvedValue(null);

        const result = await GoalService.getChatSpaceGoals('chat-1', 'user-1', 'student');

        expect(result).toEqual([]);
    });

    it('returns shared chat space goals for lecturers who own the course', async () => {
        prismaMock.chatSpace.findFirst.mockResolvedValue({
            id: 'chat-1',
            groupId: 'group-1',
            group: { course: { ownerId: 'lecturer-1' } },
        });
        prismaMock.learningGoal.findFirst.mockResolvedValue({
            id: 'goal-1',
            content: 'Analyze the discussion quality in depth.',
            isValidated: true,
            createdAt: new Date('2026-05-01T00:00:00.000Z'),
            user: { id: 'user-1', name: 'Student One' },
            _count: { reflections: 2 },
        });

        const result = await GoalService.getChatSpaceGoals('chat-1', 'lecturer-1', 'lecturer');

        expect(result).toEqual([
            {
                id: 'goal-1',
                content: 'Analyze the discussion quality in depth.',
                isValidated: true,
                createdBy: { id: 'user-1', name: 'Student One' },
                reflectionsCount: 2,
                createdAt: new Date('2026-05-01T00:00:00.000Z'),
            },
        ]);
    });

    it('rejects lecturers who do not own the course when viewing chat space goals', async () => {
        prismaMock.chatSpace.findFirst.mockResolvedValue({
            id: 'chat-1',
            groupId: 'group-1',
            group: { course: { ownerId: 'lecturer-1' } },
        });

        await expect(GoalService.getChatSpaceGoals('chat-1', 'lecturer-2', 'lecturer')).rejects.toMatchObject({
            statusCode: 403,
            message: 'You do not own this course',
        });
    });

    it('maps the current user goals across chat spaces', async () => {
        prismaMock.learningGoal.findMany.mockResolvedValue([
            {
                id: 'goal-1',
                content: 'Goal 1',
                isValidated: true,
                createdAt: new Date('2026-05-01T00:00:00.000Z'),
                chatSpace: {
                    id: 'chat-1',
                    name: 'Chat 1',
                    group: {
                        id: 'group-1',
                        name: 'Group 1',
                        course: { id: 'course-1', code: 'IF101', name: 'Intro AI' },
                    },
                },
                _count: { reflections: 1 },
            },
        ]);

        const result = await GoalService.getMyGoals('user-1');

        expect(result).toEqual([
            {
                id: 'goal-1',
                content: 'Goal 1',
                isValidated: true,
                chatSpace: {
                    id: 'chat-1',
                    name: 'Chat 1',
                    group: {
                        id: 'group-1',
                        name: 'Group 1',
                        course: { id: 'course-1', code: 'IF101', name: 'Intro AI' },
                    },
                },
                reflectionsCount: 1,
                createdAt: new Date('2026-05-01T00:00:00.000Z'),
            },
        ]);
    });

    it('rejects unknown goal details requests', async () => {
        prismaMock.learningGoal.findUnique.mockResolvedValue(null);

        await expect(GoalService.getGoalDetails('goal-1', 'user-1', 'student')).rejects.toMatchObject({
            statusCode: 404,
            message: 'Goal not found',
        });
    });

    it('rejects students without access to goal details', async () => {
        prismaMock.learningGoal.findUnique.mockResolvedValue({
            id: 'goal-1',
            userId: 'owner-1',
            chatSpace: { groupId: 'group-1', group: { course: { ownerId: 'lecturer-1' } } },
        });
        isGroupMemberMock.mockResolvedValue(false);

        await expect(GoalService.getGoalDetails('goal-1', 'user-2', 'student')).rejects.toMatchObject({
            statusCode: 403,
            message: 'You do not have access to this goal',
        });
    });

    it('returns goal details with reflections when access is allowed', async () => {
        prismaMock.learningGoal.findUnique.mockResolvedValue({
            id: 'goal-1',
            userId: 'owner-1',
            content: 'Analyze the topic deeply.',
            isValidated: true,
            createdAt: new Date('2026-05-01T00:00:00.000Z'),
            user: { id: 'owner-1', name: 'Owner' },
            chatSpace: {
                id: 'chat-1',
                name: 'Chat 1',
                groupId: 'group-1',
                group: {
                    id: 'group-1',
                    name: 'Group 1',
                    course: { id: 'course-1', code: 'IF101', name: 'Intro AI', ownerId: 'lecturer-1' },
                },
            },
            reflections: [
                {
                    id: 'reflection-1',
                    content: 'We improved our reasoning.',
                    createdAt: new Date('2026-05-02T00:00:00.000Z'),
                    user: { id: 'student-1', name: 'Student One' },
                },
            ],
        });
        isGroupMemberMock.mockResolvedValue(true);

        const result = await GoalService.getGoalDetails('goal-1', 'student-1', 'student');

        expect(result).toEqual({
            id: 'goal-1',
            content: 'Analyze the topic deeply.',
            isValidated: true,
            createdBy: { id: 'owner-1', name: 'Owner' },
            chatSpace: {
                id: 'chat-1',
                name: 'Chat 1',
                group: {
                    id: 'group-1',
                    name: 'Group 1',
                    course: { id: 'course-1', code: 'IF101', name: 'Intro AI', ownerId: 'lecturer-1' },
                },
            },
            reflections: [
                {
                    id: 'reflection-1',
                    content: 'We improved our reasoning.',
                    createdBy: { id: 'student-1', name: 'Student One' },
                    createdAt: new Date('2026-05-02T00:00:00.000Z'),
                },
            ],
            createdAt: new Date('2026-05-01T00:00:00.000Z'),
        });
    });

    it('returns null when a user goal is not found in a chat space', async () => {
        prismaMock.learningGoal.findFirst.mockResolvedValue(null);

        const result = await GoalService.getUserGoalInChatSpace('chat-1', 'user-1');

        expect(result).toBeNull();
    });

    it('returns the first shared goal for a chat space', async () => {
        prismaMock.learningGoal.findFirst.mockResolvedValue({
            id: 'goal-1',
            content: 'Shared goal',
            isValidated: true,
            createdAt: new Date('2026-05-01T00:00:00.000Z'),
            user: { id: 'user-1', name: 'Student One' },
        });

        const result = await GoalService.getUserGoalInChatSpace('chat-1', 'user-1');

        expect(result).toEqual({
            id: 'goal-1',
            content: 'Shared goal',
            isValidated: true,
            createdBy: { id: 'user-1', name: 'Student One' },
            createdAt: new Date('2026-05-01T00:00:00.000Z'),
        });
    });

    it('returns shared goal metadata only to group members', async () => {
        prismaMock.chatSpace.findFirst.mockResolvedValue({ id: 'chat-1', groupId: 'group-1', group: { id: 'group-1' } });
        isGroupMemberMock.mockResolvedValue(true);
        prismaMock.learningGoal.findFirst.mockResolvedValue({
            id: 'goal-1',
            content: 'Shared goal',
            isValidated: true,
            createdAt: new Date('2026-05-01T00:00:00.000Z'),
            user: { id: 'user-1', name: 'Student One' },
        });

        const result = await GoalService.getChatSpaceSharedGoal('chat-1', 'user-1');

        expect(result?.id).toBe('goal-1');
    });

    it('rejects shared goal access for non-members', async () => {
        prismaMock.chatSpace.findFirst.mockResolvedValue({ id: 'chat-1', groupId: 'group-1', group: { id: 'group-1' } });
        isGroupMemberMock.mockResolvedValue(false);

        await expect(GoalService.getChatSpaceSharedGoal('chat-1', 'user-2')).rejects.toMatchObject({
            statusCode: 403,
            message: 'You are not a member of this group',
        });
    });
});
