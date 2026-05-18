import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, aiServiceMock, aiEngineServiceMock } = vi.hoisted(() => ({
    prismaMock: {
        aiChat: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
        aiChatMessage: { findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
        aiProvider: { count: vi.fn() },
    },
    aiServiceMock: { sendWithConfiguredFallback: vi.fn() },
    aiEngineServiceMock: { personalChat: vi.fn() },
}));

vi.mock('../config/database.js', () => ({
    default: prismaMock,
}));

vi.mock('./ai.service.js', () => ({
    aiService: aiServiceMock,
}));

vi.mock('./aiEngine.service.js', () => ({
    aiEngineService: aiEngineServiceMock,
}));

import { AiChatService } from './aiChat.service.js';

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

    it('sends a message through the configured provider fallback when active providers exist', async () => {
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
        prismaMock.aiProvider.count.mockResolvedValue(2);
        aiServiceMock.sendWithConfiguredFallback.mockResolvedValue({
            content: 'Try reflective practice.',
            model: 'gpt-4.1-mini',
        });

        const result = await AiChatService.sendMessage('chat-1', 'user-1', 'How do I improve?');

        expect(aiServiceMock.sendWithConfiguredFallback).toHaveBeenCalledWith('How do I improve?', {
            userId: 'user-1',
            history: [{ role: 'assistant', content: 'Welcome back' }],
            systemPrompt: 'You are a helpful learning assistant for Alya. Answer clearly and supportively.',
        });
        expect(aiEngineServiceMock.personalChat).not.toHaveBeenCalled();
        expect(addMessageSpy).toHaveBeenNthCalledWith(2, 'chat-1', 'user-1', 'assistant', 'Try reflective practice.');
        expect(result).toEqual({
            userMessage: { id: 'user-msg', role: 'user', content: 'How do I improve?', createdAt: new Date('2026-05-01T00:00:00.000Z') },
            assistantMessage: { id: 'assistant-msg', role: 'assistant', content: 'Try reflective practice.', createdAt: new Date('2026-05-01T00:01:00.000Z') },
        });
    });

    it('rejects deleting a chat owned by another user', async () => {
        prismaMock.aiChat.findUnique.mockResolvedValue({ id: 'chat-1', userId: 'user-2' });

        await expect(AiChatService.deleteChat('chat-1', 'user-1')).rejects.toMatchObject({
            statusCode: 403,
            message: 'You do not have access to this chat',
        });
    });
});
