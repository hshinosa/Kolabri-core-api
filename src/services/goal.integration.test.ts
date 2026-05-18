import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, mockGroupService, mockValidateGoalContent } = vi.hoisted(() => ({
    prismaMock: {
        chatSpace: { findUnique: vi.fn() },
        learningGoal: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    },
    mockGroupService: { isGroupMember: vi.fn() },
    mockValidateGoalContent: vi.fn(),
}));

vi.mock('../config/database.js', () => ({ default: prismaMock }));
vi.mock('./group.service.js', () => ({ GroupService: mockGroupService }));
vi.mock('../utils/helpers.js', () => ({ validateGoalContent: mockValidateGoalContent }));

import { GoalService } from './goal.service.js';

const NOW = new Date('2026-06-01T00:00:00.000Z');

function makeChatSpace(overrides: Record<string, unknown> = {}) {
    return {
        id: 'cs-1',
        groupId: 'group-1',
        group: { id: 'group-1', name: 'Kelompok 1' },
        ...overrides,
    };
}

describe('GoalService Integration — Flow 3: Goal Setting + Bloom Taxonomy', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('creates goal with valid Bloom verb', async () => {
        prismaMock.chatSpace.findUnique.mockResolvedValue(makeChatSpace());
        mockGroupService.isGroupMember.mockResolvedValue(true);
        prismaMock.learningGoal.findFirst.mockResolvedValue(null);
        mockValidateGoalContent.mockReturnValue({ isValid: true });
        prismaMock.learningGoal.create.mockResolvedValue({
            id: 'goal-1',
            content: 'Menganalisis dampak perubahan iklim',
            isValidated: true,
            user: { id: 'student-1', name: 'Student' },
            chatSpace: { id: 'cs-1', name: 'Sesi 1', group: { id: 'group-1', name: 'Kelompok 1' } },
            createdAt: NOW,
        });

        const result = await GoalService.createGoal(
            { content: 'Menganalisis dampak perubahan iklim', chat_space_id: 'cs-1' } as any,
            'student-1',
        );

        expect(result.id).toBe('goal-1');
        expect(result.isValidated).toBe(true);
        expect(mockValidateGoalContent).toHaveBeenCalledWith('Menganalisis dampak perubahan iklim');
    });

    it('rejects goal without Bloom verb', async () => {
        prismaMock.chatSpace.findUnique.mockResolvedValue(makeChatSpace());
        mockGroupService.isGroupMember.mockResolvedValue(true);
        prismaMock.learningGoal.findFirst.mockResolvedValue(null);
        mockValidateGoalContent.mockReturnValue({
            isValid: false,
            message: 'Goal harus menggunakan kata kerja taksonomi Bloom',
        });

        await expect(
            GoalService.createGoal(
                { content: 'Belajar tentang iklim', chat_space_id: 'cs-1' } as any,
                'student-1',
            ),
        ).rejects.toThrow('Goal harus menggunakan kata kerja taksonomi Bloom');
    });

    it('returns existing goal when duplicate is submitted', async () => {
        prismaMock.chatSpace.findUnique.mockResolvedValue(makeChatSpace());
        mockGroupService.isGroupMember.mockResolvedValue(true);
        prismaMock.learningGoal.findFirst.mockResolvedValue({
            id: 'existing-goal',
            content: 'Mengevaluasi teori',
            isValidated: true,
            user: { id: 'student-2', name: 'Other Student' },
            chatSpace: { id: 'cs-1', name: 'Sesi 1', group: { id: 'group-1', name: 'Kelompok 1' } },
            createdAt: NOW,
        });

        const result = await GoalService.createGoal(
            { content: 'New goal', chat_space_id: 'cs-1' } as any,
            'student-1',
        );

        expect(result.id).toBe('existing-goal');
        expect(prismaMock.learningGoal.create).not.toHaveBeenCalled();
    });

    it('rejects goal when chat space not found', async () => {
        prismaMock.chatSpace.findUnique.mockResolvedValue(null);

        await expect(
            GoalService.createGoal({ content: 'test', chat_space_id: 'nonexistent' } as any, 'student-1'),
        ).rejects.toThrow('Chat space not found');
    });

    it('rejects goal when user is not group member', async () => {
        prismaMock.chatSpace.findUnique.mockResolvedValue(makeChatSpace());
        mockGroupService.isGroupMember.mockResolvedValue(false);

        await expect(
            GoalService.createGoal({ content: 'test', chat_space_id: 'cs-1' } as any, 'outsider'),
        ).rejects.toThrow('You are not a member of this group');
    });

    it('returns goals for chat space as lecturer (owner)', async () => {
        prismaMock.chatSpace.findUnique.mockResolvedValue({
            ...makeChatSpace(),
            group: {
                ...makeChatSpace().group,
                course: { ownerId: 'lecturer-1' },
            },
        });
        prismaMock.learningGoal.findFirst.mockResolvedValue({
            id: 'goal-1',
            content: 'Menganalisis data',
            isValidated: true,
            user: { id: 'student-1', name: 'Student' },
            _count: { reflections: 2 },
            createdAt: NOW,
        });

        const result = await GoalService.getChatSpaceGoals('cs-1', 'lecturer-1', 'lecturer');

        expect(result).toHaveLength(1);
        expect(result[0].content).toBe('Menganalisis data');
    });

    it('returns empty array when no goal exists for chat space', async () => {
        prismaMock.chatSpace.findUnique.mockResolvedValue({
            ...makeChatSpace(),
            group: {
                ...makeChatSpace().group,
                course: { ownerId: 'lecturer-1' },
            },
        });
        prismaMock.learningGoal.findFirst.mockResolvedValue(null);

        const result = await GoalService.getChatSpaceGoals('cs-1', 'lecturer-1', 'lecturer');
        expect(result).toEqual([]);
    });

    it('returns user goals across chat spaces', async () => {
        prismaMock.learningGoal.findMany.mockResolvedValue([
            {
                id: 'g-1', content: 'Goal 1', isValidated: true,
                chatSpace: { id: 'cs-1', name: 'Sesi 1', group: { id: 'grp-1', name: 'K1', course: { id: 'c-1', code: 'CS101', name: 'Algo' } } },
                _count: { reflections: 1 },
                createdAt: NOW,
            },
            {
                id: 'g-2', content: 'Goal 2', isValidated: true,
                chatSpace: { id: 'cs-2', name: 'Sesi 2', group: { id: 'grp-2', name: 'K2', course: { id: 'c-2', code: 'CS102', name: 'DB' } } },
                _count: { reflections: 0 },
                createdAt: NOW,
            },
        ]);

        const result = await GoalService.getMyGoals('student-1');

        expect(result).toHaveLength(2);
        expect(result[0].chatSpace.name).toBe('Sesi 1');
        expect(result[1].reflectionsCount).toBe(0);
    });

    it('returns goal details with reflections', async () => {
        prismaMock.learningGoal.findUnique.mockResolvedValue({
            id: 'goal-1',
            content: 'Mengevaluasi teori',
            isValidated: true,
            userId: 'student-1',
            user: { id: 'student-1', name: 'Student' },
            chatSpace: {
                id: 'cs-1', name: 'Sesi 1', groupId: 'group-1',
                group: { id: 'group-1', name: 'K1', course: { id: 'c-1', code: 'CS101', name: 'Algo', ownerId: 'lecturer-1' } },
            },
            reflections: [
                { id: 'ref-1', content: 'Refleksi saya', user: { id: 'student-1', name: 'Student' }, createdAt: NOW },
            ],
            createdAt: NOW,
        });
        mockGroupService.isGroupMember.mockResolvedValue(true);

        const result = await GoalService.getGoalDetails('goal-1', 'student-1', 'student');

        expect(result.reflections).toHaveLength(1);
        expect(result.reflections[0].content).toBe('Refleksi saya');
    });

    it('returns 404 when goal not found', async () => {
        prismaMock.learningGoal.findUnique.mockResolvedValue(null);

        await expect(GoalService.getGoalDetails('nonexistent', 'student-1', 'student'))
            .rejects.toThrow('Goal not found');
    });
});
