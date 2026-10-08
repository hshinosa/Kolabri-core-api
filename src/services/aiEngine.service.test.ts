import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AIEngineService, type ProviderContextV1, type StreamEvent } from './aiEngine.service.js';

type FetchMock = ReturnType<typeof vi.fn>;

function createJsonResponse(data: unknown, ok = true, status = 200): Response {
    return {
        ok,
        status,
        json: vi.fn().mockResolvedValue(data),
        text: vi.fn().mockResolvedValue(JSON.stringify(data)),
    } as unknown as Response;
}

function createSseResponse(events: unknown[]): Response {
    const payload =
        events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') +
        'data: [DONE]\n\n' +
        'data: {"type":"token","content":"after-done-marker"}\n\n';
    const bytes = new TextEncoder().encode(payload);
    return {
        ok: true,
        status: 200,
        body: {
            getReader: () => {
                let sent = false;
                return {
                    read: async () => {
                        if (sent) return { done: true, value: undefined };
                        sent = true;
                        return { done: false, value: bytes };
                    },
                };
            },
        },
    } as unknown as Response;
}

async function collectEvents(stream: AsyncGenerator<StreamEvent>): Promise<StreamEvent[]> {
    const events: StreamEvent[] = [];
    for await (const event of stream) {
        events.push(event);
    }
    return events;
}

function createProviderContext(): ProviderContextV1 {
    return {
        version: '1.0',
        provider: {
            name: 'openai',
            displayName: 'OpenAI GPT',
        },
        execution: {
            baseUrl: 'https://api.openai.com/v1',
            model: 'gpt-4o-mini',
            temperature: 0.4,
            maxTokens: 1024,
        },
        auth: {
            type: 'api-key',
            credential: 'sk-test-credential',
        },
        metadata: {
            featureFamily: 'orchestration',
            requestId: 'req-123',
            resolvedAt: '2026-06-16T00:00:00.000Z',
        },
    };
}

describe('AIEngineService', () => {
    let fetchMock: FetchMock;
    let service: AIEngineService;

    beforeEach(() => {
        process.env.AI_ENGINE_URL = 'http://ai-engine.test';
        process.env.AI_ENGINE_SECRET = 'super-secret';

        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        service = new AIEngineService();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        delete process.env.AI_ENGINE_URL;
        delete process.env.AI_ENGINE_SECRET;
    });

    it('returns health availability when AI Engine is healthy', async () => {
        fetchMock.mockResolvedValue(
            createJsonResponse({
                status: 'healthy',
                version: '1.0.0',
                timestamp: new Date().toISOString(),
                services: {
                    vector_store: true,
                    llm: true,
                },
            })
        );

        const available = await service.isAvailable();

        expect(available).toBe(true);
        expect(fetchMock).toHaveBeenCalledWith(
            'http://ai-engine.test/api/health',
            expect.objectContaining({
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer super-secret',
                },
            })
        );
    });

    it('returns false when health check fails with server error', async () => {
        fetchMock.mockResolvedValue(createJsonResponse({ status: 'down' }, false, 500));

        const available = await service.isAvailable();

        expect(available).toBe(false);
    });

    it('returns false when health check times out', async () => {
        fetchMock.mockRejectedValue(new Error('timeout'));

        const available = await service.isAvailable();

        expect(available).toBe(false);
    });

    it('sends ask requests and returns parsed response', async () => {
        fetchMock.mockResolvedValue(
            createJsonResponse({
                answer: 'Ini jawabannya',
                success: true,
            })
        );

        const result = await service.ask(
            'Apa itu Kolabri?',
            'course-1',
            'Hshi',
            'chat-9',
            { preset: 'balanced', allow_rewrite: true, allow_flag_only: false }
        );

        expect(result).toEqual({
            answer: 'Ini jawabannya',
            success: true,
        });
        expect(fetchMock).toHaveBeenCalledWith(
            'http://ai-engine.test/api/ask',
            expect.objectContaining({
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer super-secret',
                },
                body: JSON.stringify({
                    query: 'Apa itu Kolabri?',
                    course_id: 'course-1',
                    user_name: 'Hshi',
                    session_discussion_id: 'chat-9',
                    guardrail_policy: {
                        preset: 'balanced',
                        allow_rewrite: true,
                        allow_flag_only: false,
                    },
                }),
            })
        );
    });

    it('includes provider_context when supplied to ask requests', async () => {
        const providerContext = createProviderContext();
        fetchMock.mockResolvedValue(createJsonResponse({ answer: 'ok', success: true }));

        await service.ask('Apa itu Kolabri?', 'course-1', 'Hshi', 'chat-9', undefined, providerContext);

        expect(fetchMock).toHaveBeenCalledWith(
            'http://ai-engine.test/api/ask',
            expect.objectContaining({
                body: JSON.stringify({
                    query: 'Apa itu Kolabri?',
                    course_id: 'course-1',
                    user_name: 'Hshi',
                    session_discussion_id: 'chat-9',
                    guardrail_policy: undefined,
                    provider_context: providerContext,
                }),
            })
        );
    });

    it('sends reading recommendation requests and returns parsed response', async () => {
        fetchMock.mockResolvedValue(
            createJsonResponse({
                success: true,
                recommendations: [
                    {
                        source_title: 'week-3-transformer.pdf',
                        snippet: 'Self-attention menghitung relasi antar token.',
                        rationale: 'Topik sesuai dengan permintaan mahasiswa.',
                        suggested_action: 'Baca bagian self-attention.',
                        page: 12,
                        relevance_score: 0.91,
                    },
                ],
                fallback: null,
            })
        );

        const result = await service.generateReadingRecommendations('transformer', 'course-1', 3);

        expect(fetchMock).toHaveBeenCalledWith(
            'http://ai-engine.test/api/reading-recommendations',
            expect.objectContaining({
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer super-secret',
                },
                body: JSON.stringify({
                    topic: 'transformer',
                    course_id: 'course-1',
                    limit: 3,
                }),
            })
        );
        expect(result.success).toBe(true);
        expect(result.recommendations).toHaveLength(1);
    });

    it('includes provider_context when supplied to reading recommendations', async () => {
        const providerContext = createProviderContext();
        fetchMock.mockResolvedValue(createJsonResponse({ success: true, recommendations: [], fallback: null }));

        await service.generateReadingRecommendations('transformer', 'course-1', 3, providerContext);

        expect(fetchMock).toHaveBeenCalledWith(
            'http://ai-engine.test/api/reading-recommendations',
            expect.objectContaining({
                body: JSON.stringify({
                    topic: 'transformer',
                    course_id: 'course-1',
                    limit: 3,
                    provider_context: providerContext,
                }),
            })
        );
    });

    it('returns fallback response when ask times out', async () => {
        fetchMock.mockRejectedValue(new Error('timeout'));

        const result = await service.ask('Apa itu Kolabri?', 'course-1');

        expect(result).toEqual({
            answer: 'Maaf, AI Assistant sedang tidak tersedia saat ini. Silakan coba lagi nanti.',
            success: false,
            error: 'timeout',
        });
    });

    it('returns fallback response when ask receives 500 error', async () => {
        fetchMock.mockResolvedValue(createJsonResponse({ error: 'boom' }, false, 500));

        const result = await service.ask('Apa itu Kolabri?', 'course-1');

        expect(result).toEqual({
            answer: 'Maaf, AI Assistant sedang tidak tersedia saat ini. Silakan coba lagi nanti.',
            success: false,
            error: 'AI Engine responded with 500',
        });
    });

    it('streams orchestrated chat events from the SSE endpoint', async () => {
        fetchMock.mockResolvedValue(
            createSseResponse([
                { type: 'token', content: 'Diskusi ' },
                { type: 'token', content: 'kalian bagus.' },
                { type: 'done', content: 'Diskusi kalian bagus.', action_taken: 'RESPOND', should_notify_teacher: false },
            ])
        );

        const events = await collectEvents(
            service.orchestratedChatStream({
                user_id: 'user-1',
                group_id: 'group-1',
                message: 'Halo teman-teman',
                topic: 'Kolaborasi',
            })
        );

        expect(events.map((event) => event.type)).toEqual(['token', 'token', 'done']);
        expect(events[2].content).toBe('Diskusi kalian bagus.');
        expect(fetchMock).toHaveBeenCalledWith(
            'http://ai-engine.test/api/chat/stream',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({
                    user_id: 'user-1',
                    group_id: 'group-1',
                    message: 'Halo teman-teman',
                    topic: 'Kolaborasi',
                }),
            })
        );
    });

    it('stops consuming events after the [DONE] terminator', async () => {
        fetchMock.mockResolvedValue(
            createSseResponse([{ type: 'done', content: 'Selesai.' }])
        );

        const events = await collectEvents(
            service.orchestratedChatStream({
                user_id: 'user-1',
                group_id: 'group-1',
                message: 'Halo teman-teman',
            })
        );

        expect(events).toEqual([{ type: 'done', content: 'Selesai.' }]);
    });

    it('flushes the final event when the stream ends without a trailing delimiter', async () => {
        // Bug production (2026-10-07): event terakhir 'done' (bawa quality_score)
        // tiba tanpa '\n\n' penutup lalu stream ditutup — tanpa flush, sisa buffer
        // terbuang sehingga quality_update tak pernah sampai ke panel kualitas.
        const payload =
            'data: {"type":"token","content":"Halo"}\n\n' +
            'data: {"type":"done","content":"Tuntas","action_taken":"RESPOND"}';
        const bytes = new TextEncoder().encode(payload);
        fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            body: {
                getReader: () => {
                    let sent = false;
                    return {
                        read: async () => {
                            if (sent) return { done: true, value: undefined };
                            sent = true;
                            return { done: false, value: bytes };
                        },
                    };
                },
            },
        } as unknown as Response);

        const events = await collectEvents(
            service.orchestratedChatStream({
                user_id: 'user-1',
                group_id: 'group-1',
                message: 'Halo teman-teman',
            })
        );

        expect(events.map((event) => event.type)).toEqual(['token', 'done']);
        expect(events[1].content).toBe('Tuntas');
    });

    it('preserves provider_context on orchestrated chat stream requests', async () => {
        const providerContext = createProviderContext();
        fetchMock.mockResolvedValue(createSseResponse([{ type: 'done', content: 'ok' }]));

        await collectEvents(
            service.orchestratedChatStream({
                user_id: 'user-1',
                group_id: 'group-1',
                message: 'Halo teman-teman',
                provider_context: providerContext,
            })
        );

        expect(fetchMock).toHaveBeenCalledWith(
            'http://ai-engine.test/api/chat/stream',
            expect.objectContaining({
                body: JSON.stringify({
                    user_id: 'user-1',
                    group_id: 'group-1',
                    message: 'Halo teman-teman',
                    provider_context: providerContext,
                }),
            })
        );
    });

    it('yields an error event when orchestrated chat stream fails', async () => {
        fetchMock.mockRejectedValue(new Error('timeout'));

        const events = await collectEvents(
            service.orchestratedChatStream({
                user_id: 'user-1',
                group_id: 'group-1',
                message: 'Halo',
            })
        );

        expect(events).toEqual([
            { type: 'error', content: 'Maaf, terjadi kesalahan sistem.' },
        ]);
    });

    it('sends analyze intervention requests and returns parsed response', async () => {
        fetchMock.mockResolvedValue(
            createJsonResponse({
                success: true,
                should_intervene: true,
                message: 'Coba fokus ke topik utama.',
                intervention_type: 'redirect',
                confidence: 0.91,
                reason: 'discussion drift detected',
            })
        );

        const result = await service.analyzeIntervention({
            messages: [
                { sender: 'student-1', content: 'Kita mulai dari definisi dulu.' },
            ],
            topic: 'Machine Learning',
            chat_room_id: 'room-1',
            force: true,
        });

        expect(result).toEqual({
            success: true,
            should_intervene: true,
            message: 'Coba fokus ke topik utama.',
            intervention_type: 'redirect',
            confidence: 0.91,
            reason: 'discussion drift detected',
        });
        expect(fetchMock).toHaveBeenCalledWith(
            'http://ai-engine.test/api/intervention/analyze',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({
                    messages: [
                        { sender: 'student-1', content: 'Kita mulai dari definisi dulu.' },
                    ],
                    topic: 'Machine Learning',
                    chat_room_id: 'room-1',
                    force: true,
                }),
            })
        );
    });

    it('returns fallback response when intervention analysis receives 500 error', async () => {
        fetchMock.mockResolvedValue(createJsonResponse({ error: 'boom' }, false, 500));

        const result = await service.analyzeIntervention({
            messages: [],
            topic: 'Machine Learning',
            chat_room_id: 'room-1',
        });

        expect(result).toEqual({
            success: false,
            should_intervene: false,
            message: '',
            intervention_type: 'error',
            confidence: 0,
            reason: 'AI Engine responded with 500',
            error: 'AI Engine responded with 500',
        });
    });
});

describe('AIEngineService - Scaffolding', () => {
    let fetchMock: FetchMock;
    let service: AIEngineService;

    beforeEach(() => {
        process.env.AI_ENGINE_URL = 'http://ai-engine.test';
        process.env.AI_ENGINE_SECRET = 'super-secret';

        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        service = new AIEngineService();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        delete process.env.AI_ENGINE_URL;
        delete process.env.AI_ENGINE_SECRET;
    });

    it('returns scaffolding_level and scaffolding_outcome for early+enabled', async () => {
        fetchMock.mockResolvedValue(
            createSseResponse([
                { type: 'full', content: 'Step by step explanation...' },
                { type: 'done', content: 'Step by step explanation...', scaffolding_level: 'early', scaffolding_outcome: 'applied' },
            ])
        );

        const events = await collectEvents(
            service.orchestratedChatStream({
                user_id: 'u1',
                group_id: 'g1',
                message: 'Explain recursion',
                topic: 'Recursion',
                collection_name: 'course_IF201',
                course_id: 'c1',
                chat_room_id: 'room-1',
                guardrail_policy: { preset: 'balanced', allow_rewrite: true, allow_flag_only: false },
                scaffolding_config: { scaffolding_level: 'early', enabled: true },
            })
        );

        const done = events.find((event) => event.type === 'done');
        expect(done?.scaffolding_level).toBe('early');
        expect(done?.scaffolding_outcome).toBe('applied');
        expect(fetchMock).toHaveBeenCalledWith(
            'http://ai-engine.test/api/chat/stream',
            expect.objectContaining({
                body: JSON.stringify({
                    user_id: 'u1',
                    group_id: 'g1',
                    message: 'Explain recursion',
                    topic: 'Recursion',
                    collection_name: 'course_IF201',
                    course_id: 'c1',
                    chat_room_id: 'room-1',
                    guardrail_policy: { preset: 'balanced', allow_rewrite: true, allow_flag_only: false },
                    scaffolding_config: { scaffolding_level: 'early', enabled: true },
                }),
            })
        );
    });

    it('returns scaffolding_outcome=disabled when enabled=false', async () => {
        fetchMock.mockResolvedValue(
            createSseResponse([
                { type: 'done', content: 'Normal answer', scaffolding_level: 'auto', scaffolding_outcome: 'disabled' },
            ])
        );

        const events = await collectEvents(
            service.orchestratedChatStream({
                user_id: 'u1',
                group_id: 'g1',
                message: 'Explain recursion',
                topic: 'Recursion',
                collection_name: 'course_IF204',
                course_id: 'c4',
                chat_room_id: 'room-1',
                guardrail_policy: { preset: 'balanced', allow_rewrite: true, allow_flag_only: false },
                scaffolding_config: { scaffolding_level: 'auto', enabled: false },
            })
        );

        const done = events.find((event) => event.type === 'done');
        expect(done?.scaffolding_outcome).toBe('disabled');
    });
});
