import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, aiServiceMock, aiEngineServiceMock } = vi.hoisted(() => ({
    prismaMock: {
        aiChat: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
        aiChatMessage: { findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
        aiProvider: { count: vi.fn() },
    },
    aiServiceMock: { sendWithConfiguredFallback: vi.fn() },
    aiEngineServiceMock: { personalChat: vi.fn(), personalChatStream: vi.fn(), isAvailable: vi.fn() },
}));

vi.mock('../config/database.js', () => ({ default: prismaMock }));
vi.mock('./ai.service.js', () => ({ aiService: aiServiceMock }));
vi.mock('./aiEngine.service.js', () => ({ aiEngineService: aiEngineServiceMock }));

import { AiChatService } from './aiChat.service.js';

const NOW = new Date('2026-06-01T00:00:00.000Z');
const CHAT_BASE = { id: 'chat-1', userId: 'user-1' };

describe('AiChatService Integration — Flow 1: Student AI Chat', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('creates a chat then lists it for the same user', async () => {
        prismaMock.aiChat.create.mockResolvedValue({ ...CHAT_BASE, title: 'Chat Baru', createdAt: NOW, updatedAt: NOW });
        const created = await AiChatService.createChat('user-1');
        expect(created.id).toBe('chat-1');

        prismaMock.aiChat.findMany.mockResolvedValue([
            { ...CHAT_BASE, title: 'Chat Baru', createdAt: NOW, updatedAt: NOW, messages: [{ content: 'hi' }] },
        ]);
        const chats = await AiChatService.getUserChats('user-1');
        expect(chats).toHaveLength(1);
        expect(chats[0].lastMessage).toBe('hi');
    });

    it('updates chat title to first 50 chars on first user message', async () => {
        const longMsg = 'Bagaimana cara menganalisis data kualitatif dalam penelitian pendidikan?';
        const expectedTitle = longMsg.substring(0, 47) + '...';

        prismaMock.aiChat.findUnique.mockResolvedValue(CHAT_BASE);
        prismaMock.aiChatMessage.create.mockResolvedValue({ id: 'msg-1', chatId: 'chat-1', role: 'user', content: longMsg, createdAt: NOW });
        prismaMock.aiChatMessage.count.mockResolvedValue(1);
        prismaMock.aiChat.update.mockResolvedValue({});

        await AiChatService.addMessage('chat-1', 'user-1', 'user', longMsg);

        expect(prismaMock.aiChat.update).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 'chat-1' }, data: { title: expectedTitle } }),
        );
    });

    it('uses AI Engine personalChat when no active providers exist', async () => {
        prismaMock.aiChat.findUnique
            .mockResolvedValueOnce(CHAT_BASE)
            .mockResolvedValueOnce({ ...CHAT_BASE, messages: [], user: { name: 'Hashfi' } })
            .mockResolvedValueOnce(CHAT_BASE);
        prismaMock.aiChatMessage.create
            .mockResolvedValueOnce({ id: 'msg-u', role: 'user', content: 'Halo', createdAt: NOW })
            .mockResolvedValueOnce({ id: 'msg-a', role: 'assistant', content: 'Hai!', createdAt: NOW });
        prismaMock.aiChatMessage.count.mockResolvedValue(2);
        prismaMock.aiChat.update.mockResolvedValue({});
        prismaMock.aiProvider.count.mockResolvedValue(0);
        aiEngineServiceMock.personalChat.mockResolvedValue({ reply: 'Hai!', success: true, tokens_used: 10 });

        const result = await AiChatService.sendMessage('chat-1', 'user-1', 'Halo');

        expect(aiEngineServiceMock.personalChat).toHaveBeenCalledWith('Halo', [], 'Hashfi');
        expect(aiServiceMock.sendWithConfiguredFallback).not.toHaveBeenCalled();
        expect(result.userMessage.content).toBe('Halo');
        expect(result.assistantMessage.content).toBe('Hai!');
    });

    it('uses configured provider when active providers exist', async () => {
        prismaMock.aiChat.findUnique
            .mockResolvedValueOnce(CHAT_BASE)
            .mockResolvedValueOnce({ ...CHAT_BASE, messages: [], user: { name: 'Hashfi' } })
            .mockResolvedValueOnce(CHAT_BASE);
        prismaMock.aiChatMessage.create
            .mockResolvedValueOnce({ id: 'msg-u', role: 'user', content: 'Halo', createdAt: NOW })
            .mockResolvedValueOnce({ id: 'msg-a', role: 'assistant', content: 'Response', createdAt: NOW });
        prismaMock.aiChatMessage.count.mockResolvedValue(2);
        prismaMock.aiChat.update.mockResolvedValue({});
        prismaMock.aiProvider.count.mockResolvedValue(1);
        aiServiceMock.sendWithConfiguredFallback.mockResolvedValue({ content: 'Response', success: true });

        const result = await AiChatService.sendMessage('chat-1', 'user-1', 'Halo');

        expect(aiServiceMock.sendWithConfiguredFallback).toHaveBeenCalled();
        expect(aiEngineServiceMock.personalChat).not.toHaveBeenCalled();
        expect(result.assistantMessage.content).toBe('Response');
    });

    it('returns messages ordered by createdAt ascending', async () => {
        prismaMock.aiChat.findUnique.mockResolvedValue({ userId: 'user-1' });
        prismaMock.aiChatMessage.findMany.mockResolvedValue([
            { id: 'msg-1', role: 'user', content: 'First', createdAt: new Date('2026-06-01T10:00:00Z') },
            { id: 'msg-2', role: 'assistant', content: 'Second', createdAt: new Date('2026-06-01T10:01:00Z') },
        ]);

        const messages = await AiChatService.getChatMessages('chat-1', 'user-1');

        expect(messages[0].content).toBe('First');
        expect(messages[1].content).toBe('Second');
        expect(prismaMock.aiChatMessage.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ orderBy: { createdAt: 'asc' } }),
        );
    });

    it('throws forbidden when reading another user\'s chat messages', async () => {
        prismaMock.aiChat.findUnique.mockResolvedValue({ userId: 'user-1' });
        await expect(AiChatService.getChatMessages('chat-1', 'user-2')).rejects.toThrow('You do not have access to this chat');
    });

    it('throws forbidden when sending message to another user\'s chat', async () => {
        prismaMock.aiChat.findUnique.mockResolvedValue(CHAT_BASE);
        await expect(AiChatService.addMessage('chat-1', 'user-2', 'user', 'test')).rejects.toThrow('You do not have access to this chat');
    });

    it('deletes a chat owned by the user', async () => {
        prismaMock.aiChat.findUnique.mockResolvedValue(CHAT_BASE);
        prismaMock.aiChat.delete.mockResolvedValue({});
        const result = await AiChatService.deleteChat('chat-1', 'user-1');
        expect(result).toEqual({ success: true });
        expect(prismaMock.aiChat.delete).toHaveBeenCalledWith({ where: { id: 'chat-1' } });
    });

    it('throws forbidden when deleting another user\'s chat', async () => {
        prismaMock.aiChat.findUnique.mockResolvedValue(CHAT_BASE);
        await expect(AiChatService.deleteChat('chat-1', 'user-2')).rejects.toThrow('You do not have access to this chat');
    });

    it('throws not found when chat does not exist', async () => {
        prismaMock.aiChat.findUnique.mockResolvedValue(null);
        await expect(AiChatService.getChatMessages('nonexistent', 'user-1')).rejects.toThrow('Chat not found');
    });

    it('stores the AI Engine fallback message when the engine returns an error response', async () => {
        const fallbackReply = 'Maaf, AI Assistant sedang tidak tersedia saat ini. Silakan coba lagi nanti.';
        prismaMock.aiChat.findUnique
            .mockResolvedValueOnce(CHAT_BASE)
            .mockResolvedValueOnce({ ...CHAT_BASE, messages: [], user: { name: 'Hashfi' } })
            .mockResolvedValueOnce(CHAT_BASE);
        prismaMock.aiChatMessage.create
            .mockResolvedValueOnce({ id: 'msg-u', role: 'user', content: 'Help', createdAt: NOW })
            .mockResolvedValueOnce({ id: 'msg-a', role: 'assistant', content: fallbackReply, createdAt: NOW });
        prismaMock.aiChatMessage.count.mockResolvedValue(2);
        prismaMock.aiChat.update.mockResolvedValue({});
        prismaMock.aiProvider.count.mockResolvedValue(0);
        aiEngineServiceMock.personalChat.mockResolvedValue({ reply: fallbackReply, success: false, tokens_used: 0, error: 'Connection refused' });

        const result = await AiChatService.sendMessage('chat-1', 'user-1', 'Help');
        expect(result.assistantMessage.content).toBe(fallbackReply);
    });

    it('filters out the just-added user message from history before sending to AI', async () => {
        const olderMessages = [
            { id: 'msg-old-1', role: 'assistant', content: 'Previous reply', createdAt: new Date('2026-05-01T00:00:00Z') },
            { id: 'msg-old-2', role: 'user', content: 'Previous question', createdAt: new Date('2026-05-01T00:01:00Z') },
        ];
        prismaMock.aiChat.findUnique
            .mockResolvedValueOnce(CHAT_BASE)
            .mockResolvedValueOnce({
                ...CHAT_BASE,
                messages: [...olderMessages, { id: 'user-msg', role: 'user', content: 'New question', createdAt: new Date('2026-05-01T00:02:00Z') }],
                user: { name: 'Hashfi' },
            })
            .mockResolvedValueOnce(CHAT_BASE);
        prismaMock.aiChatMessage.create
            .mockResolvedValueOnce({ id: 'user-msg', role: 'user', content: 'New question', createdAt: NOW })
            .mockResolvedValueOnce({ id: 'a-msg', role: 'assistant', content: 'Answer', createdAt: NOW });
        prismaMock.aiChatMessage.count.mockResolvedValue(5);
        prismaMock.aiChat.update.mockResolvedValue({});
        prismaMock.aiProvider.count.mockResolvedValue(0);
        aiEngineServiceMock.personalChat.mockResolvedValue({ reply: 'Answer', success: true, tokens_used: 5 });

        await AiChatService.sendMessage('chat-1', 'user-1', 'New question');

        const [, historyArg] = aiEngineServiceMock.personalChat.mock.calls[0];
        expect(historyArg).toEqual([
            { role: 'assistant', content: 'Previous reply' },
            { role: 'user', content: 'Previous question' },
        ]);
    });

    it('returns null from getChatWithUser when called with wrong userId', async () => {
        prismaMock.aiChat.findUnique.mockResolvedValue({ ...CHAT_BASE, messages: [], user: { name: 'Hashfi' } });
        const result = await AiChatService.getChatWithUser('chat-1', 'user-2');
        expect(result).toBeNull();
    });
});
