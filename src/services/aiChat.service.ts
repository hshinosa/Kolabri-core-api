import prisma from '../config/database.js';
import { ApiError } from '../middleware/errorHandler.js';
import { aiEngineService } from './aiEngine.service.js';
import { providerResolutionService } from './providerResolution.service.js';

export class AiChatService {
    /**
     * Create a new AI chat conversation
     */
    static async createChat(userId: string, title?: string) {
        const chat = await prisma.aiChat.create({
            data: {
                title: title || 'Chat Baru',
                userId,
            },
        });

        return {
            id: chat.id,
            title: chat.title,
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt,
        };
    }

    static async getUserChats(userId: string, page = 1, pageSize = 20) {
        const safePage = Math.max(1, Math.floor(page));
        const safePageSize = Math.max(1, Math.min(100, Math.floor(pageSize)));

        const chats = await prisma.aiChat.findMany({
            where: { userId },
            orderBy: { updatedAt: 'desc' },
            skip: (safePage - 1) * safePageSize,
            take: safePageSize,
            include: {
                messages: {
                    take: 1,
                    orderBy: { createdAt: 'desc' },
                },
            },
        });

        return chats.map((chat) => ({
            id: chat.id,
            title: chat.title,
            lastMessage: chat.messages[0]?.content,
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt,
        }));
    }

    /**
     * Get a specific chat metadata (without messages)
     */
    static async getChatMetadata(chatId: string, userId: string) {
        const chat = await prisma.aiChat.findUnique({
            where: { id: chatId },
        });

        if (!chat) {
            throw ApiError.notFound('Chat not found');
        }

        if (chat.userId !== userId) {
            throw ApiError.forbidden('You do not have access to this chat');
        }

        return {
            id: chat.id,
            title: chat.title,
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt,
        };
    }

    /**
     * Get messages for a specific chat
     */
    static async getChatMessages(chatId: string, userId: string) {
        const chat = await prisma.aiChat.findUnique({
            where: { id: chatId },
            select: { userId: true },
        });

        if (!chat) {
            throw ApiError.notFound('Chat not found');
        }

        if (chat.userId !== userId) {
            throw ApiError.forbidden('You do not have access to this chat');
        }

        const messages = await prisma.aiChatMessage.findMany({
            where: { chatId },
            orderBy: { createdAt: 'asc' },
        });

        return messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            citations: (m.citations as Array<{ source: string; page?: number; course_id?: string; course_material_id?: string }> | null) ?? undefined,
            createdAt: m.createdAt,
        }));
    }

    /**
     * Get a specific chat with messages (legacy - for backward compatibility)
     */
    static async getChat(chatId: string, userId: string) {
        const chat = await prisma.aiChat.findUnique({
            where: { id: chatId },
            include: {
                messages: {
                    orderBy: { createdAt: 'asc' },
                },
            },
        });

        if (!chat) {
            throw ApiError.notFound('Chat not found');
        }

        if (chat.userId !== userId) {
            throw ApiError.forbidden('You do not have access to this chat');
        }

        return {
            id: chat.id,
            title: chat.title,
            messages: chat.messages.map((m) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                citations: (m.citations as Array<{ source: string; page?: number; course_id?: string; course_material_id?: string }> | null) ?? undefined,
                createdAt: m.createdAt,
            })),
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt,
        };
    }

    /**
     * Add a message to a chat
     */
    static async addMessage(chatId: string, userId: string, role: 'user' | 'assistant', content: string, citations?: Array<{ source: string; page?: number; course_id?: string; course_material_id?: string }>) {
        const chat = await prisma.aiChat.findUnique({
            where: { id: chatId },
        });

        if (!chat) {
            throw ApiError.notFound('Chat not found');
        }

        if (chat.userId !== userId) {
            throw ApiError.forbidden('You do not have access to this chat');
        }

        const message = await prisma.aiChatMessage.create({
            data: {
                chatId,
                role,
                content,
                ...(citations ? { citations } : {}),
            },
        });

        // Update chat title if it's the first user message
        if (role === 'user') {
            const messageCount = await prisma.aiChatMessage.count({
                where: { chatId, role: 'user' },
            });

            if (messageCount === 1) {
                // Use first 50 chars of first message as title
                const newTitle = content.length > 50 ? content.substring(0, 47) + '...' : content;
                await prisma.aiChat.update({
                    where: { id: chatId },
                    data: { title: newTitle },
                });
            }
        }

        // Update chat's updatedAt
        await prisma.aiChat.update({
            where: { id: chatId },
            data: { updatedAt: new Date() },
        });

        return {
            id: message.id,
            role: message.role,
            content: message.content,
            citations: (message.citations as Array<{ source: string; page?: number; course_id?: string; course_material_id?: string }> | null) ?? undefined,
            createdAt: message.createdAt,
        };
    }

    static async getChatWithUser(chatId: string, userId: string) {
        const chat = await prisma.aiChat.findUnique({
            where: { id: chatId },
            include: {
                messages: {
                    orderBy: { createdAt: 'asc' as const },
                    take: 40,
                },
                user: { select: { name: true } },
            },
        });

        if (!chat || chat.userId !== userId) return null;

        return {
            messages: chat.messages,
            userName: chat.user?.name ?? null,
        };
    }

    /**
     * Send a message and get AI response
     */
    static async sendMessage(chatId: string, userId: string, content: string) {
        const userMessage = await this.addMessage(chatId, userId, 'user', content);

        const chat = await prisma.aiChat.findUnique({
            where: { id: chatId },
            include: {
                messages: {
                    orderBy: { createdAt: 'asc' },
                    take: 40,
                },
                user: { select: { name: true } },
            },
        });

        const history = (chat?.messages ?? [])
            .filter((m) => m.id !== userMessage.id)
            .map((m) => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
            }))
            .slice(-20);

        let assistantContent: string;

        try {
            const response = await aiEngineService.personalChat(
                content,
                history,
                chat?.user?.name ?? undefined,
                undefined,
            );
            assistantContent = response.reply;
        } catch {
            assistantContent = 'Maaf, AI Assistant sedang tidak tersedia saat ini. Silakan coba lagi nanti.';
        }

        const assistantMessage = await this.addMessage(
            chatId,
            userId,
            'assistant',
            assistantContent,
        );

        return {
            userMessage,
            assistantMessage,
        };
    }

    /**
     * Delete a chat
     */
    static async deleteChat(chatId: string, userId: string) {
        const chat = await prisma.aiChat.findUnique({
            where: { id: chatId },
        });

        if (!chat) {
            throw ApiError.notFound('Chat not found');
        }

        if (chat.userId !== userId) {
            throw ApiError.forbidden('You do not have access to this chat');
        }

        await prisma.aiChat.delete({
            where: { id: chatId },
        });

        return { success: true };
    }

    /**
     * Update chat title
     */
    static async updateChatTitle(chatId: string, userId: string, title: string) {
        const chat = await prisma.aiChat.findUnique({
            where: { id: chatId },
        });

        if (!chat) {
            throw ApiError.notFound('Chat not found');
        }

        if (chat.userId !== userId) {
            throw ApiError.forbidden('You do not have access to this chat');
        }

        const updated = await prisma.aiChat.update({
            where: { id: chatId },
            data: { title },
        });

        return {
            id: updated.id,
            title: updated.title,
            updatedAt: updated.updatedAt,
        };
    }
}
