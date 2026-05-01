import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AIEngineService } from './aiEngine.service.js';

type FetchMock = ReturnType<typeof vi.fn>;

function createJsonResponse(data: unknown, ok = true, status = 200): Response {
    return {
        ok,
        status,
        json: vi.fn().mockResolvedValue(data),
        text: vi.fn().mockResolvedValue(JSON.stringify(data)),
    } as unknown as Response;
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

        const result = await service.ask('Apa itu Kolabri?', 'course-1', 'Hshi', 'chat-9');

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
                    chat_space_id: 'chat-9',
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

    it('sends orchestrated chat requests and returns parsed response', async () => {
        fetchMock.mockResolvedValue(
            createJsonResponse({
                success: true,
                bot_response: 'Diskusi kalian bagus.',
                action_taken: 'RESPOND',
                should_notify_teacher: false,
            })
        );

        const result = await service.orchestratedChat({
            user_id: 'user-1',
            group_id: 'group-1',
            message: 'Halo teman-teman',
            topic: 'Kolaborasi',
        });

        expect(result).toEqual({
            success: true,
            bot_response: 'Diskusi kalian bagus.',
            action_taken: 'RESPOND',
            should_notify_teacher: false,
        });
        expect(fetchMock).toHaveBeenCalledWith(
            'http://ai-engine.test/api/chat',
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

    it('returns fallback response when orchestrated chat fails', async () => {
        fetchMock.mockRejectedValue(new Error('timeout'));

        const result = await service.orchestratedChat({
            user_id: 'user-1',
            group_id: 'group-1',
            message: 'Halo',
        });

        expect(result).toEqual({
            success: false,
            bot_response: 'Maaf, terjadi kesalahan sistem.',
            action_taken: 'ERROR',
            should_notify_teacher: false,
            error: 'timeout',
        });
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
