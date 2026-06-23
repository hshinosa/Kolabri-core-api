import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, mockGroupService, mockValidateGoalContent, mockProviderResolutionService } = vi.hoisted(() => ({
    prismaMock: {
        sessionDiscussion: { findUnique: vi.fn(), findFirst: vi.fn() },
        learningGoal: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
        courseStudent: { findMany: vi.fn().mockResolvedValue([]) },
    },
    mockGroupService: { isGroupMember: vi.fn() },
    mockValidateGoalContent: vi.fn(),
    mockProviderResolutionService: {
        resolveProviderContext: vi.fn(),
        executeWithFallback: vi.fn(async (_input, operation) => {
            const resolution = await mockProviderResolutionService.resolveProviderContext(_input);
            return operation(resolution.primary.providerContext);
        }),
    },
}));

vi.mock('../config/database.js', () => ({ default: prismaMock }));
vi.mock('./group.service.js', () => ({ GroupService: mockGroupService }));
vi.mock('../utils/helpers.js', () => ({ validateGoalContent: mockValidateGoalContent }));
vi.mock('./providerResolution.service.js', () => ({ providerResolutionService: mockProviderResolutionService }));

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

const NOW = new Date('2026-06-01T00:00:00.000Z');

function makeSessionDiscussion(overrides: Record<string, unknown> = {}) {
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
        prismaMock.sessionDiscussion.findFirst.mockResolvedValue(makeSessionDiscussion());
        mockGroupService.isGroupMember.mockResolvedValue(true);
        prismaMock.learningGoal.findFirst.mockResolvedValue(null);
        mockValidateGoalContent.mockReturnValue({ isValid: true });
        mockProviderResolutionService.resolveProviderContext.mockResolvedValue({
            primary: { providerId: 'provider-openai', providerName: 'openai', providerContext: { auth: { type: 'api-key', credential: 'sk-test' }, execution: { model: 'gpt-4o-mini' } } },
            fallbackChain: [],
        });
        prismaMock.learningGoal.create.mockResolvedValue({
            id: 'goal-1',
            content: 'Menganalisis dampak perubahan iklim',
            isValidated: true,
            user: { id: 'student-1', name: 'Student' },
            sessionDiscussion: { id: 'cs-1', name: 'Sesi 1', group: { id: 'group-1', name: 'Kelompok 1' } },
            createdAt: NOW,
        });

        const result = await GoalService.createGoal(
            { content: 'Menganalisis dampak perubahan iklim', session_discussion_id: 'cs-1' } as any,
            'student-1',
        );

        expect(result.id).toBe('goal-1');
        expect(result.isValidated).toBe(true);
        expect(mockValidateGoalContent).toHaveBeenCalledWith('Menganalisis dampak perubahan iklim');
    });

    it('rejects goal without Bloom verb', async () => {
        prismaMock.sessionDiscussion.findFirst.mockResolvedValue(makeSessionDiscussion());
        mockGroupService.isGroupMember.mockResolvedValue(true);
        prismaMock.learningGoal.findFirst.mockResolvedValue(null);
        mockValidateGoalContent.mockReturnValue({
            isValid: false,
            message: 'Goal harus menggunakan kata kerja taksonomi Bloom',
        });

        await expect(
            GoalService.createGoal(
                { content: 'Belajar tentang iklim', session_discussion_id: 'cs-1' } as any,
                'student-1',
            ),
        ).rejects.toThrow('Goal harus menggunakan kata kerja taksonomi Bloom');
    });

    it('returns existing goal when duplicate is submitted', async () => {
        prismaMock.sessionDiscussion.findFirst.mockResolvedValue(makeSessionDiscussion());
        mockGroupService.isGroupMember.mockResolvedValue(true);
        prismaMock.learningGoal.findFirst.mockResolvedValue({
            id: 'existing-goal',
            content: 'Mengevaluasi teori',
            isValidated: true,
            user: { id: 'student-2', name: 'Other Student' },
            sessionDiscussion: { id: 'cs-1', name: 'Sesi 1', group: { id: 'group-1', name: 'Kelompok 1' } },
            createdAt: NOW,
        });

        const result = await GoalService.createGoal(
            { content: 'New goal', session_discussion_id: 'cs-1' } as any,
            'student-1',
        );

        expect(result.id).toBe('existing-goal');
        expect(prismaMock.learningGoal.create).not.toHaveBeenCalled();
    });

    it('rejects goal when session discussion not found', async () => {
        prismaMock.sessionDiscussion.findFirst.mockResolvedValue(null);

        await expect(
            GoalService.createGoal({ content: 'test', session_discussion_id: 'nonexistent' } as any, 'student-1'),
        ).rejects.toThrow('Session discussion not found');
    });

    it('rejects goal when user is not group member', async () => {
        prismaMock.sessionDiscussion.findFirst.mockResolvedValue(makeSessionDiscussion());
        mockGroupService.isGroupMember.mockResolvedValue(false);

        await expect(
            GoalService.createGoal({ content: 'test', session_discussion_id: 'cs-1' } as any, 'outsider'),
        ).rejects.toThrow('You are not a member of this group');
    });

    it('returns goals for session discussion as lecturer (owner)', async () => {
        prismaMock.sessionDiscussion.findFirst.mockResolvedValue({
            ...makeSessionDiscussion(),
            group: {
                ...makeSessionDiscussion().group,
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

        const result = await GoalService.getSessionDiscussionGoals('cs-1', 'lecturer-1', 'lecturer');

        expect(result).toHaveLength(1);
        expect(result[0].content).toBe('Menganalisis data');
    });

    it('returns empty array when no goal exists for session discussion', async () => {
        prismaMock.sessionDiscussion.findFirst.mockResolvedValue({
            ...makeSessionDiscussion(),
            group: {
                ...makeSessionDiscussion().group,
                course: { ownerId: 'lecturer-1' },
            },
        });
        prismaMock.learningGoal.findFirst.mockResolvedValue(null);

        const result = await GoalService.getSessionDiscussionGoals('cs-1', 'lecturer-1', 'lecturer');
        expect(result).toEqual([]);
    });

    it('returns user goals across session discussions', async () => {
        prismaMock.learningGoal.findMany.mockResolvedValue([
            {
                id: 'g-1', content: 'Goal 1', isValidated: true,
                sessionDiscussion: { id: 'cs-1', name: 'Sesi 1', group: { id: 'grp-1', name: 'K1', course: { id: 'c-1', code: 'CS101', name: 'Algo' } } },
                _count: { reflections: 1 },
                createdAt: NOW,
            },
            {
                id: 'g-2', content: 'Goal 2', isValidated: true,
                sessionDiscussion: { id: 'cs-2', name: 'Sesi 2', group: { id: 'grp-2', name: 'K2', course: { id: 'c-2', code: 'CS102', name: 'DB' } } },
                _count: { reflections: 0 },
                createdAt: NOW,
            },
        ]);

        const result = await GoalService.getMyGoals('student-1');

        expect(result).toHaveLength(2);
        expect(result[0].sessionDiscussion.name).toBe('Sesi 1');
        expect(result[1].reflectionsCount).toBe(0);
    });

    it('returns goal details with reflections', async () => {
        prismaMock.learningGoal.findUnique.mockResolvedValue({
            id: 'goal-1',
            content: 'Mengevaluasi teori',
            isValidated: true,
            userId: 'student-1',
            user: { id: 'student-1', name: 'Student' },
            sessionDiscussion: {
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
