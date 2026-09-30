import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { executeMock, consoleErrorMock, mockProviderContext, executeWithFallbackMock } = vi.hoisted(() => {
    const execWithFallback = vi.fn();
    return {
        executeMock: vi.fn(),
        consoleErrorMock: vi.fn(),
        executeWithFallbackMock: execWithFallback,
        mockProviderContext: {
            version: '1.0' as const,
            provider: { name: 'test', displayName: 'Test' },
            execution: { baseUrl: 'http://test/v1', model: 'test-model' },
            auth: { type: 'api-key' as const, credential: 'sk-test' },
            metadata: { featureFamily: 'orchestration', requestId: 'r1', resolvedAt: '2026-01-01T00:00:00Z' },
        },
    };
});

vi.mock('../utils/circuitBreaker.js', () => ({
    aiEngineCircuitBreaker: {
        execute: executeMock,
    },
}));

vi.mock('./providerResolution.service.js', () => ({
    providerResolutionService: {
        executeWithFallback: executeWithFallbackMock,
        resolveProviderContext: vi.fn().mockResolvedValue([mockProviderContext]),
    },
}));

import { DiscussionDirectionService } from './discussion-direction.service.js';

describe('DiscussionDirectionService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(consoleErrorMock);
        process.env.AI_ENGINE_URL = 'http://ai-engine.test';
        process.env.AI_ENGINE_SECRET = 'super-secret-min-16';
        process.env.CORE_API_SECRET = 'wrong-secret-min-16';
        executeMock.mockImplementation(async (fn: () => Promise<unknown>) => fn());
        executeWithFallbackMock.mockImplementation(
            async (_scope: unknown, operation: (ctx: unknown) => Promise<unknown>) => {
                return await operation(mockProviderContext);
            },
        );
    });

    afterEach(() => {
        delete process.env.AI_ENGINE_URL;
        delete process.env.AI_ENGINE_SECRET;
        delete process.env.CORE_API_SECRET;
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('uses AI_ENGINE_SECRET for classify requests', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({ classifications: [{ messageId: 'm1', isRelevant: true }] }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const result = await DiscussionDirectionService.classifyMessages([{ id: 'm1', content: 'hello' }], 'goal');

        expect(result).toEqual([{ messageId: 'm1', isRelevant: true }]);
        expect(fetchMock).toHaveBeenCalledWith(
            'http://ai-engine.test/api/classify-relevance',
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: 'Bearer super-secret-min-16',
                }),
            }),
        );
    });

    it('falls back safely when circuit breaker rejects classify request', async () => {
        executeMock.mockRejectedValue(new Error('AI service temporarily unavailable (circuit open)'));

        const result = await DiscussionDirectionService.classifyMessages(
            [{ id: 'm1', content: 'hello' }, { id: 'm2', content: 'world' }],
            'goal',
        );

        expect(result).toEqual([
            { messageId: 'm1', isRelevant: true },
            { messageId: 'm2', isRelevant: true },
        ]);
        expect(consoleErrorMock).toHaveBeenCalled();
    });

    it('falls back to default summary when circuit breaker rejects summary request', async () => {
        executeMock.mockRejectedValue(new Error('AI service temporarily unavailable (circuit open)'));

        const result = await DiscussionDirectionService.generateSessionSummary(
            [{ content: 'hello', senderName: 'Alice' }],
            'goal',
            { totalMessages: 1, participantCount: 1 },
        );

        expect(result).toEqual({
            goalAchieved: false,
            topics: ['goal'],
            contributions: {},
            assessment:
                'Penilaian tujuan tidak tersedia saat ini (layanan AI sibuk atau tidak merespons). ' +
                'Sesi ini mencatat 1 pesan dari 1 peserta. ' +
                'Silakan tinjau kembali tujuan: "goal".',
        });
        expect(consoleErrorMock).toHaveBeenCalled();
    });
});
