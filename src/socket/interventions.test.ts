import { beforeEach, describe, expect, it, vi } from 'vitest';

const { aiEngineMock, ChatLogMock, SilenceEventMock, gateMock } = vi.hoisted(() => {
    const chatLogSave = vi.fn().mockResolvedValue(undefined);
    const silenceSave = vi.fn().mockResolvedValue(undefined);

    return {
        aiEngineMock: {
            analyzeIntervention: vi.fn(),
            generatePrompt: vi.fn(),
        },
        ChatLogMock: {
            find: vi.fn(() => ({
                sort: vi.fn(() => ({
                    limit: vi.fn(() => ({
                        lean: vi.fn(() => Promise.resolve([])),
                    })),
                })),
            })),
            _save: chatLogSave,
        },
        SilenceEventMock: {
            _save: silenceSave,
        },
        gateMock: {
            tryAcquireSilenceLock: vi.fn().mockResolvedValue(true),
        },
    };
});

vi.mock('../services/aiEngine.service.js', () => ({
    aiEngineService: aiEngineMock,
}));

vi.mock('../models/ChatLog.js', () => {
    function ChatLog(this: Record<string, unknown>, data: Record<string, unknown>) {
        Object.assign(this, data);
        this._id = { toString: () => 'mock-chatlog-id' };
        this.createdAt = new Date('2026-06-01T00:00:00Z');
        this.save = ChatLogMock._save;
    }
    (ChatLog as unknown as { find: typeof ChatLogMock.find }).find = ChatLogMock.find;
    return { ChatLog };
});

vi.mock('../models/SilenceEvent.js', () => {
    function SilenceEvent(this: Record<string, unknown>, data: Record<string, unknown>) {
        Object.assign(this, data);
        this.save = SilenceEventMock._save;
    }
    return { SilenceEvent };
});

vi.mock('./interventionGate.js', async () => {
    const actual = await vi.importActual<typeof import('./interventionGate.js')>('./interventionGate.js');
    return {
        ...actual,
        tryAcquireSilenceLock: gateMock.tryAcquireSilenceLock,
    };
});

vi.mock('../utils/logger.js', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { runSilenceIntervention } from './interventions.js';
import { INTERVENTION_MESSAGES } from './interventionMessages.js';

const ctx = {
    roomId: 'room-1',
    courseId: 'course-1',
    groupId: 'group-1',
    sessionDiscussionId: 'cs-1',
};

function makeDeps() {
    return {
        emit: vi.fn(),
        onSent: vi.fn(),
    };
}

describe('runSilenceIntervention', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        gateMock.tryAcquireSilenceLock.mockResolvedValue(true);
    });

    it('uses AI primary message when analyzeIntervention succeeds', async () => {
        aiEngineMock.analyzeIntervention.mockResolvedValue({
            success: true,
            message: 'AI nudge contextual',
        });
        const deps = makeDeps();

        await runSilenceIntervention(ctx, deps);

        expect(aiEngineMock.analyzeIntervention).toHaveBeenCalledOnce();
        expect(aiEngineMock.analyzeIntervention).toHaveBeenCalledWith(
            expect.objectContaining({ provider_context: undefined })
        );
        expect(aiEngineMock.generatePrompt).not.toHaveBeenCalled();

        const savedChatLogCall = ChatLogMock._save.mock.calls;
        expect(savedChatLogCall).toHaveLength(1);

        expect(deps.emit).toHaveBeenCalledWith(
            'room-1',
            'receive_message',
            expect.objectContaining({ content: 'AI nudge contextual' }),
        );
        expect(deps.onSent).toHaveBeenCalledWith('room-1');
    });

    it('falls back to generatePrompt when analyzeIntervention returns unsuccessful', async () => {
        aiEngineMock.analyzeIntervention.mockResolvedValue({ success: false });
        aiEngineMock.generatePrompt.mockResolvedValue({
            success: true,
            prompt: 'Bagaimana progress kalian?',
        });
        const deps = makeDeps();

        await runSilenceIntervention(ctx, deps);

        expect(aiEngineMock.generatePrompt).toHaveBeenCalledWith(
            'Diskusi sepi',
            expect.any(String),
            'easy',
            undefined,
        );
        expect(deps.emit).toHaveBeenCalledWith(
            'room-1',
            'receive_message',
            expect.objectContaining({ content: 'Bagaimana progress kalian?' }),
        );
    });

    it('falls back to hardcoded message when both AI calls fail', async () => {
        aiEngineMock.analyzeIntervention.mockResolvedValue({ success: false });
        // Exact AI Engine failure shape: success=false with EMPTY string prompt
        // (not undefined) — `??` would let '' through to the broadcast.
        aiEngineMock.generatePrompt.mockResolvedValue({ success: false, prompt: '' });
        const deps = makeDeps();

        await runSilenceIntervention(ctx, deps);

        expect(deps.emit).toHaveBeenCalledOnce();
        const broadcastPayload = deps.emit.mock.calls[0][2] as { content: string };
        expect(INTERVENTION_MESSAGES).toContain(broadcastPayload.content);
    });

    it('falls back to hardcoded message when AI throws', async () => {
        aiEngineMock.analyzeIntervention.mockRejectedValue(new Error('network error'));
        const deps = makeDeps();

        await runSilenceIntervention(ctx, deps);

        expect(deps.emit).toHaveBeenCalledOnce();
        const broadcastPayload = deps.emit.mock.calls[0][2] as { content: string };
        expect(INTERVENTION_MESSAGES).toContain(broadcastPayload.content);
    });

    it('skips entirely when silence lock is held by another instance', async () => {
        gateMock.tryAcquireSilenceLock.mockResolvedValue(false);
        const deps = makeDeps();

        await runSilenceIntervention(ctx, deps);

        expect(aiEngineMock.analyzeIntervention).not.toHaveBeenCalled();
        expect(aiEngineMock.generatePrompt).not.toHaveBeenCalled();
        expect(ChatLogMock._save).not.toHaveBeenCalled();
        expect(SilenceEventMock._save).not.toHaveBeenCalled();
        expect(deps.emit).not.toHaveBeenCalled();
        expect(deps.onSent).not.toHaveBeenCalled();
    });

    it('still persists silence event before AI call', async () => {
        aiEngineMock.analyzeIntervention.mockResolvedValue({
            success: true,
            message: 'AI nudge',
        });
        const deps = makeDeps();

        await runSilenceIntervention(ctx, deps);

        expect(SilenceEventMock._save).toHaveBeenCalledOnce();
    });

    it('does not throw when ChatLog.save fails', async () => {
        aiEngineMock.analyzeIntervention.mockResolvedValue({
            success: true,
            message: 'AI nudge',
        });
        ChatLogMock._save.mockRejectedValueOnce(new Error('mongo down'));
        const deps = makeDeps();

        await expect(runSilenceIntervention(ctx, deps)).resolves.toBeUndefined();
        expect(deps.emit).not.toHaveBeenCalled();
    });
});
