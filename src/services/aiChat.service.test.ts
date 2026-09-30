import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, providerResolutionServiceMock, aiEngineServiceMock } = vi.hoisted(() => ({
    prismaMock: {
        aiChat: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
        aiChatMessage: { findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
        aiProvider: { count: vi.fn() },
    },
    providerResolutionServiceMock: {
        resolveProviderContext: vi.fn(),
        executeWithFallback: vi.fn(async (_input, operation, options) => {
            const resolution = await providerResolutionServiceMock.resolveProviderContext(_input);
            const result = await operation(resolution.primary.providerContext);
            if (options?.isSuccess && !options.isSuccess(result)) {
                throw new Error(`Provider ${resolution.primary.providerName} returned unsuccessful result`);
            }
            return result;
        }),
    },
    aiEngineServiceMock: { personalChatStream: vi.fn() },
}));

vi.mock('../config/database.js', () => ({
    default: prismaMock,
}));

vi.mock('./providerResolution.service.js', () => ({
    providerResolutionService: providerResolutionServiceMock,
}));

vi.mock('./aiEngine.service.js', () => ({
    aiEngineService: aiEngineServiceMock,
}));

import { AiChatService } from './aiChat.service.js';

/**
 * SSE Response whose payload is delivered split across two reads, so parsers
 * are exercised on chunks that cut a `data:` line in half.
 */
function createSseResponse(payload: string): Response {
    const bytes = new TextEncoder().encode(payload);
    const midpoint = Math.floor(bytes.length / 2);
    return {
        ok: true,
        status: 200,
        body: {
            getReader: () => {
                let reads = 0;
                return {
                    read: async () => {
                        reads += 1;
                        if (reads === 1) return { done: false, value: bytes.slice(0, midpoint) };
                        if (reads === 2) return { done: false, value: bytes.slice(midpoint) };
                        return { done: true, value: undefined };
                    },
                };
            },
        },
    } as unknown as Response;
}

describe('AiChatService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('creates a chat with the default title when no title is provided', async () => {
        const now = new Date('2026-05-01T00:00:00.000Z');
        prismaMock.aiChat.create.mockResolvedValue({
            id: 'chat-1',
            title: 'Chat Baru',
            createdAt: now,
            updatedAt: now,
        });

        const result = await AiChatService.createChat('user-1');

        expect(prismaMock.aiChat.create).toHaveBeenCalledWith({
            data: {
                title: 'Chat Baru',
                userId: 'user-1',
            },
        });
        expect(result).toEqual({
            id: 'chat-1',
            title: 'Chat Baru',
            createdAt: now,
            updatedAt: now,
        });
    });

    it('maps user chats with the latest message preview', async () => {
        const createdAt = new Date('2026-05-01T00:00:00.000Z');
        const updatedAt = new Date('2026-05-02T00:00:00.000Z');
        prismaMock.aiChat.findMany.mockResolvedValue([
            {
                id: 'chat-1',
                title: 'Study Plan',
                createdAt,
                updatedAt,
                messages: [{ content: 'Latest reply' }],
            },
        ]);

        const result = await AiChatService.getUserChats('user-1');

        expect(prismaMock.aiChat.findMany).toHaveBeenCalledWith({
            where: { userId: 'user-1' },
            orderBy: { updatedAt: 'desc' },
            skip: 0,
            take: 20,
            include: {
                messages: {
                    take: 1,
                    orderBy: { createdAt: 'desc' },
                },
            },
        });
        expect(result).toEqual([
            {
                id: 'chat-1',
                title: 'Study Plan',
                lastMessage: 'Latest reply',
                createdAt,
                updatedAt,
            },
        ]);
    });

    it('renames the chat from the first user message and updates the timestamp', async () => {
        const createdAt = new Date('2026-05-03T00:00:00.000Z');
        prismaMock.aiChat.findUnique.mockResolvedValue({ id: 'chat-1', userId: 'user-1' });
        prismaMock.aiChatMessage.create.mockResolvedValue({
            id: 'msg-1',
            role: 'user',
            content: 'A very long opening question about collaborative learning outcomes',
            createdAt,
        });
        prismaMock.aiChatMessage.count.mockResolvedValue(1);
        prismaMock.aiChat.update.mockResolvedValue({});

        const result = await AiChatService.addMessage(
            'chat-1',
            'user-1',
            'user',
            'A very long opening question about collaborative learning outcomes'
        );

        const renameCall = prismaMock.aiChat.update.mock.calls[0][0];
        expect(renameCall).toEqual({
            where: { id: 'chat-1' },
            data: {
                title: expect.stringMatching(/^A very long opening question about .+\.\.\.$/),
            },
        });
        expect(renameCall.data.title).toHaveLength(50);
        expect(prismaMock.aiChat.update).toHaveBeenNthCalledWith(2, {
            where: { id: 'chat-1' },
            data: { updatedAt: expect.any(Date) },
        });
        expect(result).toEqual({
            id: 'msg-1',
            role: 'user',
            content: 'A very long opening question about collaborative learning outcomes',
            createdAt,
        });
    });

    it('sends a message through the ai-engine personal chat stream', async () => {
        const addMessageSpy = vi
            .spyOn(AiChatService, 'addMessage')
            .mockResolvedValueOnce({ id: 'user-msg', role: 'user', content: 'How do I improve?', createdAt: new Date('2026-05-01T00:00:00.000Z') })
            .mockResolvedValueOnce({ id: 'assistant-msg', role: 'assistant', content: 'Try reflective practice.', createdAt: new Date('2026-05-01T00:01:00.000Z') });

        prismaMock.aiChat.findUnique.mockResolvedValue({
            id: 'chat-1',
            userId: 'user-1',
            messages: [
                { id: 'older-1', role: 'assistant', content: 'Welcome back' },
                { id: 'user-msg', role: 'user', content: 'How do I improve?' },
            ],
            user: { name: 'Alya' },
        });

        aiEngineServiceMock.personalChatStream.mockResolvedValue(createSseResponse(
            'data: {"content":"Try reflective "}\n\n' +
            'data: {"content":"practice."}\n\n' +
            'data: {"citations":[{"source":"week-3-reflective.pdf","page":12}]}\n\n' +
            'data: [DONE]\n\n'
        ));

        const result = await AiChatService.sendMessage('chat-1', 'user-1', 'How do I improve?');

        expect(aiEngineServiceMock.personalChatStream).toHaveBeenCalledWith(
            'How do I improve?',
            [{ role: 'assistant', content: 'Welcome back' }],
            'Alya',
            undefined,
        );
        expect(addMessageSpy).toHaveBeenNthCalledWith(
            2,
            'chat-1',
            'user-1',
            'assistant',
            'Try reflective practice.',
            [{ source: 'week-3-reflective.pdf', page: 12 }],
        );
        expect(result).toEqual({
            userMessage: { id: 'user-msg', role: 'user', content: 'How do I improve?', createdAt: new Date('2026-05-01T00:00:00.000Z') },
            assistantMessage: { id: 'assistant-msg', role: 'assistant', content: 'Try reflective practice.', createdAt: new Date('2026-05-01T00:01:00.000Z') },
        });
    });

    it('returns a fallback reply when the personal chat stream is unavailable', async () => {
        const addMessageSpy = vi
            .spyOn(AiChatService, 'addMessage')
            .mockResolvedValueOnce({ id: 'user-msg', role: 'user', content: 'How do I improve?', createdAt: new Date('2026-05-01T00:00:00.000Z') })
            .mockResolvedValueOnce({ id: 'assistant-msg', role: 'assistant', content: 'Maaf, AI Assistant sedang tidak tersedia saat ini. Silakan coba lagi nanti.', createdAt: new Date('2026-05-01T00:01:00.000Z') });

        prismaMock.aiChat.findUnique.mockResolvedValue({
            id: 'chat-1',
            userId: 'user-1',
            messages: [],
            user: { name: 'Alya' },
        });
        aiEngineServiceMock.personalChatStream.mockResolvedValue({ ok: false, body: null, status: 503 } as unknown as Response);

        const result = await AiChatService.sendMessage('chat-1', 'user-1', 'How do I improve?');

        expect(aiEngineServiceMock.personalChatStream).toHaveBeenCalledWith(
            'How do I improve?',
            [],
            'Alya',
            undefined,
        );
        expect(addMessageSpy).toHaveBeenNthCalledWith(2, 'chat-1', 'user-1', 'assistant', 'Maaf, AI Assistant sedang tidak tersedia saat ini. Silakan coba lagi nanti.', undefined);
        expect(result.assistantMessage.content).toBe('Maaf, AI Assistant sedang tidak tersedia saat ini. Silakan coba lagi nanti.');
    });

    it('returns a fallback reply when the stream reports an error event', async () => {
        const addMessageSpy = vi
            .spyOn(AiChatService, 'addMessage')
            .mockResolvedValueOnce({ id: 'user-msg', role: 'user', content: 'How do I improve?', createdAt: new Date('2026-05-01T00:00:00.000Z') })
            .mockResolvedValueOnce({ id: 'assistant-msg', role: 'assistant', content: 'Maaf, AI Assistant sedang tidak tersedia saat ini. Silakan coba lagi nanti.', createdAt: new Date('2026-05-01T00:01:00.000Z') });

        prismaMock.aiChat.findUnique.mockResolvedValue({
            id: 'chat-1',
            userId: 'user-1',
            messages: [],
            user: { name: 'Alya' },
        });
        aiEngineServiceMock.personalChatStream.mockResolvedValue(createSseResponse(
            'data: {"content":"partial answer"}\n\n' +
            'data: {"type":"error","content":"Maaf, terjadi kesalahan sistem."}\n\n'
        ));

        const result = await AiChatService.sendMessage('chat-1', 'user-1', 'How do I improve?');

        expect(addMessageSpy).toHaveBeenNthCalledWith(2, 'chat-1', 'user-1', 'assistant', 'Maaf, AI Assistant sedang tidak tersedia saat ini. Silakan coba lagi nanti.', undefined);
        expect(result.assistantMessage.content).toBe('Maaf, AI Assistant sedang tidak tersedia saat ini. Silakan coba lagi nanti.');
    });

    it('rejects deleting a chat owned by another user', async () => {
        prismaMock.aiChat.findUnique.mockResolvedValue({ id: 'chat-1', userId: 'user-2' });

        await expect(AiChatService.deleteChat('chat-1', 'user-1')).rejects.toMatchObject({
            statusCode: 403,
            message: 'You do not have access to this chat',
        });
    });
});
