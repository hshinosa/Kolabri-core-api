import { Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { AiChatService } from '../services/aiChat.service.js';
import { aiEngineService } from '../services/aiEngine.service.js';
import { providerResolutionService } from '../services/providerResolution.service.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

const prisma = new PrismaClient();

export class AiChatController {
    /**
     * POST /api/ai-chats
     * Create a new AI chat
     */
    static async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const chat = await AiChatService.createChat(req.user!.userId, req.body.title);

            res.status(201).json({
                data: chat,
                meta: {
                    message: 'Chat created successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/ai-chats
     * Get all chats for the current user
     */
    static async index(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const page = req.query.page ? Number(req.query.page) : undefined;
            const pageSize = req.query.pageSize ? Number(req.query.pageSize) : undefined;
            const chats = await AiChatService.getUserChats(req.user!.userId, page, pageSize);

            res.json({
                data: chats,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/ai-chats/:id
     * Get a specific chat WITHOUT messages (metadata only)
     */
    static async show(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const chat = await AiChatService.getChatMetadata(req.params.id, req.user!.userId);

            res.json({
                data: chat,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/ai-chats/:id/messages
     * Get messages for a specific chat
     */
    static async getMessages(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const messages = await AiChatService.getChatMessages(req.params.id, req.user!.userId);

            res.json({
                data: messages,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/ai-chats/:id/messages
     * Send a message to AI and get response
     */
    static async sendMessage(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const { content } = req.body;
            const result = await AiChatService.sendMessage(req.params.id, req.user!.userId, content);

            res.json({
                data: result,
                meta: {
                    message: 'Message sent successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * PATCH /api/ai-chats/:id
     * Update chat title
     */
    static async updateTitle(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const { title } = req.body;
            const chat = await AiChatService.updateChatTitle(req.params.id, req.user!.userId, title);

            res.json({
                data: chat,
                meta: {
                    message: 'Chat updated successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * DELETE /api/ai-chats/:id
     * Delete a chat
     */
    static async delete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            await AiChatService.deleteChat(req.params.id, req.user!.userId);

            res.json({
                data: null,
                meta: {
                    message: 'Chat deleted successfully',
                },
            });
        } catch (error) {
            next(error);
        }
    }

    static async streamMessage(req: AuthenticatedRequest, res: Response, next: NextFunction) {
        try {
            const { content } = req.body;
            const userId = req.user!.userId;
            const chatId = req.params.id;

            const userMessage = await AiChatService.addMessage(chatId, userId, 'user', content);

            const chat = await AiChatService.getChatWithUser(chatId, userId);
            const history = (chat?.messages ?? [])
                .filter((m: { id: string }) => m.id !== userMessage.id)
                .map((m: { role: string; content: string }) => ({
                    role: m.role as 'user' | 'assistant',
                    content: m.content,
                }));

            // Fetch enrolled course IDs (UUID) for this user (RAG scope)
            const enrollments = await prisma.courseStudent.findMany({
                where: { userId },
                select: {
                    course: { select: { id: true } },
                },
            });
            const courseIds = enrollments.map((e) => e.course.id);

            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');
            res.flushHeaders();

            res.write(`data: ${JSON.stringify({ type: 'user_message', id: userMessage.id })}\n\n`);

            const streamResp = await aiEngineService.personalChatStream(
                content,
                history,
                chat?.userName ?? undefined,
                undefined,
                courseIds,
            );

            if (!streamResp.ok || !streamResp.body) {
                const fallback = 'Maaf, AI Assistant sedang tidak tersedia.';
                await AiChatService.addMessage(chatId, userId, 'assistant', fallback);
                res.write(`data: ${JSON.stringify({ content: fallback })}\n\n`);
                res.write('data: [DONE]\n\n');
                res.end();
                return;
            }

            let fullReply = '';
            let collectedCitations: Array<{ source: string; page?: number; course_id?: string; course_material_id?: string }> = [];
            const reader = streamResp.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';

                for (const rawLine of lines) {
                    const line = rawLine.trim();
                    if (!line.startsWith('data: ')) continue;

                    const payload = line.slice(6);
                    if (payload === '[DONE]') {
                        continue;
                    }

                    try {
                        const parsed = JSON.parse(payload);

                        if (parsed.type === 'error' || parsed.error) {
                            throw new Error(parsed.content || parsed.error || 'AI stream failed');
                        }

                        if (parsed.citations && Array.isArray(parsed.citations)) {
                            collectedCitations = parsed.citations;
                        }

                        if (parsed.content) {
                            fullReply += parsed.content;
                        }
                    } catch (error) {
                        if (error instanceof Error && error.message !== payload) {
                            throw error;
                        }
                    }

                    res.write(`${line}\n\n`);
                }
            }

            const trailingLine = buffer.trim();
            if (trailingLine.startsWith('data: ')) {
                const payload = trailingLine.slice(6);

                if (payload !== '[DONE]') {
                    const parsed = JSON.parse(payload);

                    if (parsed.type === 'error' || parsed.error) {
                        throw new Error(parsed.content || parsed.error || 'AI stream failed');
                    }

                    if (parsed.citations && Array.isArray(parsed.citations)) {
                        collectedCitations = parsed.citations;
                    }

                    if (parsed.content) {
                        fullReply += parsed.content;
                    }

                    res.write(`${trailingLine}\n\n`);
                }
            }

            if (fullReply) {
                const saved = await AiChatService.addMessage(chatId, userId, 'assistant', fullReply, collectedCitations.length > 0 ? collectedCitations : undefined);
                res.write(`data: ${JSON.stringify({ type: 'assistant_saved', id: saved.id, citations: collectedCitations.length > 0 ? collectedCitations : undefined })}\n\n`);
            }

            res.write('data: [DONE]\n\n');
            res.end();
        } catch (error) {
            const fallback = 'Maaf, AI Assistant sedang tidak tersedia saat ini. Silakan coba lagi nanti.';

            try {
                if (req.params.id && req.user?.userId) {
                    await AiChatService.addMessage(req.params.id, req.user.userId, 'assistant', fallback);
                }
            } catch {
                // Ignore persistence fallback failures so the stream can still terminate cleanly.
            }

            if (!res.headersSent) {
                return next(error);
            }

            res.write(`data: ${JSON.stringify({ content: fallback })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
        }
    }
}
