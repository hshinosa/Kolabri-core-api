import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSave = vi.fn().mockImplementation(function (this: any) {
    return Promise.resolve(this);
});

 function MockEscalationState(this: any, data: any) {
     Object.assign(this, data);
     this.save = mockSave;
 }

vi.mock('../models/EscalationState.js', () => {
    return {
        EscalationState: Object.assign(MockEscalationState, {
            find: vi.fn(() => ({
                sort: vi.fn(() => ({
                    limit: vi.fn(() => ({
                        lean: vi.fn(() => Promise.resolve([])),
                    })),
                })),
            })),
            findById: vi.fn(() => Promise.resolve(null)),
            findOne: vi.fn(() => Promise.resolve(null)),
        }),
        EscalationStage: {},
        IssueType: {},
    };
});

vi.mock('../utils/logger.js', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
    isStagedEscalationEnabled,
    findOrCreateState,
    advanceStage,
    resolveState,
    shouldNotifyLecturer,
    markNotificationSent,
} from './escalation.service.js';
import { EscalationState } from '../models/EscalationState.js';

describe('EscalationService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.STAGED_ESCALATION_ENABLED = 'true';
    });

    describe('isStagedEscalationEnabled', () => {
        it('returns true when env var is "true"', () => {
            process.env.STAGED_ESCALATION_ENABLED = 'true';
            expect(isStagedEscalationEnabled()).toBe(true);
        });

        it('returns false by default', () => {
            delete process.env.STAGED_ESCALATION_ENABLED;
            expect(isStagedEscalationEnabled()).toBe(false);
        });

        it('returns false for non-"true" values', () => {
            process.env.STAGED_ESCALATION_ENABLED = 'false';
            expect(isStagedEscalationEnabled()).toBe(false);
        });
    });

    describe('findOrCreateState', () => {
        it('returns existing unresolved state', async () => {
            const existing = { _id: 'existing', currentStage: 'nudge', lastCheckedAt: new Date(), save: mockSave };
            (EscalationState.findOne as any).mockResolvedValue(existing);

            const state = await findOrCreateState('c1', 'g1', 'cs1', 'silence');
            expect(state._id).toBe('existing');
        });

        it('creates new state when none exists', async () => {
            (EscalationState.findOne as any).mockResolvedValue(null);

            const state = await findOrCreateState('c1', 'g1', 'cs1', 'silence');
            expect(state.currentStage).toBe('new');
        });
    });

    describe('advanceStage', () => {
        it('advances from new to nudge', async () => {
            const state = {
                _id: 's1',
                currentStage: 'new',
                history: [],
                lastCheckedAt: new Date(),
                save: vi.fn().mockImplementation(function (this: any) { return Promise.resolve(this); }),
            };

            const result = await advanceStage(state as any, 'nudge', 'Silence detected', 'silence_timer');
            expect(result.currentStage).toBe('nudge');
            expect(result.history).toHaveLength(1);
            expect(result.history[0].stage).toBe('nudge');
        });

        it('advances from nudge to probe-blocker', async () => {
            const state = {
                _id: 's1',
                currentStage: 'nudge',
                history: [{ stage: 'nudge', enteredAt: new Date(), reason: 'test', triggeredBy: 'silence_timer' }],
                lastCheckedAt: new Date(),
                save: vi.fn().mockImplementation(function (this: any) { return Promise.resolve(this); }),
            };

            const result = await advanceStage(state as any, 'probe-blocker', 'Silence persists', 'silence_timer');
            expect(result.currentStage).toBe('probe-blocker');
        });

        it('advances from probe-blocker to flag-lecturer', async () => {
            const state = {
                _id: 's1',
                currentStage: 'probe-blocker',
                history: [],
                lastCheckedAt: new Date(),
                save: vi.fn().mockImplementation(function (this: any) { return Promise.resolve(this); }),
            };

            const result = await advanceStage(state as any, 'flag-lecturer', 'No response', 'ai_chat');
            expect(result.currentStage).toBe('flag-lecturer');
        });

        it('rejects invalid transition from new to flag-lecturer', async () => {
            const state = {
                _id: 's1',
                currentStage: 'new',
                history: [],
                lastCheckedAt: new Date(),
                save: vi.fn().mockImplementation(function (this: any) { return Promise.resolve(this); }),
            };

            const result = await advanceStage(state as any, 'flag-lecturer', 'Skip stages', 'ai_chat');
            expect(result.currentStage).toBe('new');
        });

        it('no-ops when stage is already resolved', async () => {
            const state = {
                _id: 's1',
                currentStage: 'resolved',
                history: [],
                lastCheckedAt: new Date(),
                save: vi.fn(),
            };

            const result = await advanceStage(state as any, 'nudge', 'Already resolved', 'silence_timer');
            expect(result.currentStage).toBe('resolved');
            expect(state.save).not.toHaveBeenCalled();
        });

        it('no-ops when newStage equals currentStage', async () => {
            const state = {
                _id: 's1',
                currentStage: 'nudge',
                history: [],
                lastCheckedAt: new Date(),
                save: vi.fn(),
            };

            const result = await advanceStage(state as any, 'nudge', 'Same stage', 'silence_timer');
            expect(result.currentStage).toBe('nudge');
            expect(state.save).not.toHaveBeenCalled();
        });
    });

    describe('resolveState', () => {
        it('resolves an active escalation', async () => {
            const state = {
                _id: 's1',
                currentStage: 'flag-lecturer',
                history: [],
                lastCheckedAt: new Date(),
                save: vi.fn().mockImplementation(function (this: any) { return Promise.resolve(this); }),
            };

            const result = await resolveState(state as any, 'lecturer-1', 'Manual resolve');
            expect(result.currentStage).toBe('resolved');
            expect(result.resolvedBy).toBe('lecturer-1');
            expect(result.resolvedAt).toBeDefined();
        });

        it('no-ops if already resolved', async () => {
            const state = {
                _id: 's1',
                currentStage: 'resolved',
                history: [],
                lastCheckedAt: new Date(),
                save: vi.fn(),
            };

            const result = await resolveState(state as any, 'lecturer-1', 'Already resolved');
            expect(state.save).not.toHaveBeenCalled();
        });
    });

    describe('shouldNotifyLecturer', () => {
        it('returns true when stage is flag-lecturer and no notification sent', () => {
            const state = { currentStage: 'flag-lecturer', notificationSentAt: undefined };
            expect(shouldNotifyLecturer(state as any)).toBe(true);
        });

        it('returns false when notification already sent', () => {
            const state = { currentStage: 'flag-lecturer', notificationSentAt: new Date() };
            expect(shouldNotifyLecturer(state as any)).toBe(false);
        });

        it('returns false when not at flag-lecturer stage', () => {
            const state = { currentStage: 'nudge', notificationSentAt: undefined };
            expect(shouldNotifyLecturer(state as any)).toBe(false);
        });
    });

    describe('deduplication', () => {
        it('markNotificationSent sets notificationSentAt', () => {
            const state = { notificationSentAt: undefined } as any;
            const result = markNotificationSent(state);
            expect(result.notificationSentAt).toBeDefined();
        });
    });
});
