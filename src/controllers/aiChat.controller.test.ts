import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAiChatService, mockAiEngineService, mockProviderResolutionService } = vi.hoisted(() => ({
    mockAiChatService: {
        createChat: vi.fn(),
        getUserChats: vi.fn(),
        getChatMetadata: vi.fn(),
        getChatMessages: vi.fn(),
        sendMessage: vi.fn(),
        updateChatTitle: vi.fn(),
        deleteChat: vi.fn(),
        addMessage: vi.fn(),
        getChatWithUser: vi.fn(),
    },
    mockAiEngineService: {
        personalChatStream: vi.fn(),
    },
    mockProviderResolutionService: {
        resolveProviderContext: vi.fn(),
        executeWithFallback: vi.fn(async (_input, operation, options) => {
            const resolution = await mockProviderResolutionService.resolveProviderContext(_input);
            const result = await operation(resolution.primary.providerContext);
            if (options?.isSuccess && !options.isSuccess(result)) {
                throw new Error(`Provider ${resolution.primary.providerName} returned unsuccessful result`);
            }
            return result;
        }),
    },
}));

vi.mock('../services/aiChat.service.js', () => ({
    AiChatService: mockAiChatService,
}));

vi.mock('../services/aiEngine.service.js', () => ({
    aiEngineService: mockAiEngineService,
}));

vi.mock('../services/providerResolution.service.js', () => ({
    providerResolutionService: mockProviderResolutionService,
}));

import { AiChatController } from './aiChat.controller.js';

function mockReq(overrides: Partial<Request> = {}) {
    return {
        body: {},
        params: {},
        query: {},
        user: {
            userId: 'user-1',
            role: 'student',
            email: 'user@example.com',
        },
        ...overrides,
    } as Partial<Request>;
}

function mockRes(): Partial<Response> {
    const res: Partial<Response> & {
        status: ReturnType<typeof vi.fn>;
        json: ReturnType<typeof vi.fn>;
        setHeader: ReturnType<typeof vi.fn>;
        flushHeaders: ReturnType<typeof vi.fn>;
        write: ReturnType<typeof vi.fn>;
        end: ReturnType<typeof vi.fn>;
    } = {
        status: vi.fn(),
        json: vi.fn(),
        setHeader: vi.fn(),
        flushHeaders: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
    };
    res.status.mockReturnValue(res as Response);
    res.json.mockReturnValue(res as Response);
    return res;
}

function mockNext(): NextFunction {
    return vi.fn() as unknown as NextFunction;
}

function createProviderContext() {
    return {
        version: '1.0' as const,
        provider: { name: 'openai', displayName: 'OpenAI GPT' },
        execution: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
        auth: { type: 'api-key' as const, credential: 'sk-test' },
        metadata: { featureFamily: 'personal-chat', requestId: 'req-1', resolvedAt: '2026-06-16T10:00:00.000Z' },
    };
}

describe('AiChatController', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('creates a chat and returns 201 with success message', async () => {
        const chat = { id: 'chat-1', title: 'New chat' };
        mockAiChatService.createChat.mockResolvedValue(chat);
        const req = mockReq({ body: { title: 'New chat' } });
        const res = mockRes();
        const next = mockNext();

        await AiChatController.create(req as Request, res as Response, next);

        expect(mockAiChatService.createChat).toHaveBeenCalledWith('user-1', 'New chat');
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith({
            data: chat,
            meta: { message: 'Chat created successfully' },
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('returns messages for a chat', async () => {
        const messages = [{ id: 'msg-1', content: 'Hello' }];
        mockAiChatService.getChatMessages.mockResolvedValue(messages);
        const req = mockReq({ params: { id: 'chat-1' } });
        const res = mockRes();
        const next = mockNext();

        await AiChatController.getMessages(req as Request, res as Response, next);

        expect(mockAiChatService.getChatMessages).toHaveBeenCalledWith('chat-1', 'user-1');
        expect(res.json).toHaveBeenCalledWith({ data: messages });
        expect(next).not.toHaveBeenCalled();
    });

    it('sends a message and returns the AI response payload', async () => {
        const result = { userMessage: { id: 'msg-1' }, assistantMessage: { id: 'msg-2' } };
        mockAiChatService.sendMessage.mockResolvedValue(result);
        const req = mockReq({ params: { id: 'chat-1' }, body: { content: 'How are you?' } });
        const res = mockRes();
        const next = mockNext();

        await AiChatController.sendMessage(req as Request, res as Response, next);

        expect(mockAiChatService.sendMessage).toHaveBeenCalledWith('chat-1', 'user-1', 'How are you?');
        expect(res.json).toHaveBeenCalledWith({
            data: result,
            meta: { message: 'Message sent successfully' },
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('streams a message, resolves provider context, forwards prior history, and persists the assistant reply', async () => {
        const userMessage = { id: 'msg-user' };
        const savedAssistant = { id: 'msg-assistant' };
        const providerContext = createProviderContext();
        mockAiChatService.addMessage
            .mockResolvedValueOnce(userMessage)
            .mockResolvedValueOnce(savedAssistant);
        mockAiChatService.getChatWithUser.mockResolvedValue({
            userName: 'Alice',
            messages: [
                { id: 'old-1', role: 'assistant', content: 'Previous answer' },
                { id: 'msg-user', role: 'user', content: 'Should be excluded' },
            ],
        });
        mockProviderResolutionService.resolveProviderContext.mockResolvedValue({
            primary: { providerId: 'provider-openai', providerName: 'openai', providerContext },
            fallbackChain: [],
        });
        mockAiEngineService.personalChatStream.mockResolvedValue({
            ok: true,
            body: {
                getReader: () => {
                    let done = false;
                    return {
                        read: vi.fn(async () => {
                            if (done) return { done: true, value: undefined };
                            done = true;
                            return {
                                done: false,
                                value: new TextEncoder().encode('data: {"content":"Hello"}\n'),
                            };
                        }),
                    };
                },
            },
        });
        const req = mockReq({ params: { id: 'chat-1' }, body: { content: 'Hi there' } });
        const res = mockRes();
        const next = mockNext();

        await AiChatController.streamMessage(req as Request, res as Response, next);

        expect(mockProviderResolutionService.resolveProviderContext).toHaveBeenCalledWith({ featureFamily: 'personal-chat' });
        expect(mockAiChatService.addMessage).toHaveBeenNthCalledWith(1, 'chat-1', 'user-1', 'user', 'Hi there');
        expect(mockAiEngineService.personalChatStream).toHaveBeenCalledWith(
            'Hi there',
            [{ role: 'assistant', content: 'Previous answer' }],
            'Alice',
            providerContext,
            expect.any(Array),
        );
        expect(mockAiChatService.addMessage).toHaveBeenNthCalledWith(2, 'chat-1', 'user-1', 'assistant', 'Hello', undefined);
        expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
        expect(res.write).toHaveBeenCalledWith(`data: ${JSON.stringify({ type: 'user_message', id: 'msg-user' })}\n\n`);
        expect(res.write).toHaveBeenCalledWith('data: {"content":"Hello"}\n\n');
        expect(res.write).toHaveBeenCalledWith(
            `data: ${JSON.stringify({ type: 'assistant_saved', id: 'msg-assistant', citations: undefined })}\n\n`
        );
        expect(res.write).toHaveBeenCalledWith('data: [DONE]\n\n');
        expect(res.end).toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });
    it('persists citations received in the SSE stream alongside the assistant reply', async () => {
        const userMessage = { id: 'msg-user' };
        const savedAssistant = { id: 'msg-assistant' };
        const providerContext = createProviderContext();
        const testCitations = [{ source: 'React Docs', page: 42, course_id: 'c1', course_material_id: 'm1' }];
        mockAiChatService.addMessage
            .mockResolvedValueOnce(userMessage)
            .mockResolvedValueOnce(savedAssistant);
        mockAiChatService.getChatWithUser.mockResolvedValue({ userName: 'Bob', messages: [] });
        mockProviderResolutionService.resolveProviderContext.mockResolvedValue({
            primary: { providerId: 'provider-openai', providerName: 'openai', providerContext },
            fallbackChain: [],
        });
        mockAiEngineService.personalChatStream.mockResolvedValue({
            ok: true,
            body: {
                getReader: () => {
                    let calls = 0;
                    return {
                        read: vi.fn(async () => {
                            calls++;
                            if (calls === 1) {
                                return { done: false, value: new TextEncoder().encode('data: {"content":"Answer with RAG"}\n') };
                            }
                            if (calls === 2) {
                                return { done: false, value: new TextEncoder().encode(`data: ${JSON.stringify({ citations: testCitations })}\n`) };
                            }
                            return { done: true, value: undefined };
                        }),
                    };
                },
            },
        });
        const req = mockReq({ params: { id: 'chat-1' }, body: { content: 'question' } });
        const res = mockRes();
        const next = mockNext();

        await AiChatController.streamMessage(req as Request, res as Response, next);

        expect(mockAiChatService.addMessage).toHaveBeenNthCalledWith(2, 'chat-1', 'user-1', 'assistant', 'Answer with RAG', testCitations);
        expect(res.write).toHaveBeenCalledWith(
            `data: ${JSON.stringify({ type: 'assistant_saved', id: 'msg-assistant', citations: testCitations })}\n\n`
        );
    });

    it('falls back to a canned assistant message when the stream is unavailable', async () => {
        const userMessage = { id: 'msg-user' };
        const fallbackText = 'Maaf, AI Assistant sedang tidak tersedia.';
        const providerContext = createProviderContext();
        mockAiChatService.addMessage
            .mockResolvedValueOnce(userMessage)
            .mockResolvedValueOnce({ id: 'fallback-assistant' });
        mockAiChatService.getChatWithUser.mockResolvedValue({ userName: 'Alice', messages: [] });
        mockProviderResolutionService.resolveProviderContext.mockResolvedValue({
            primary: { providerId: 'provider-openai', providerName: 'openai', providerContext },
            fallbackChain: [],
        });
        mockAiEngineService.personalChatStream.mockResolvedValue({ ok: false, body: null });
        const req = mockReq({ params: { id: 'chat-1' }, body: { content: 'Hi there' } });
        const res = mockRes();
        const next = mockNext();

        await AiChatController.streamMessage(req as Request, res as Response, next);

        expect(mockAiEngineService.personalChatStream).toHaveBeenCalledWith('Hi there', [], 'Alice', providerContext, expect.any(Array));
        expect(mockAiChatService.addMessage).toHaveBeenNthCalledWith(2, 'chat-1', 'user-1', 'assistant', fallbackText);
        expect(res.write).toHaveBeenCalledWith(`data: ${JSON.stringify({ content: fallbackText })}\n\n`);
        expect(res.write).toHaveBeenCalledWith('data: [DONE]\n\n');
        expect(res.end).toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });
});
