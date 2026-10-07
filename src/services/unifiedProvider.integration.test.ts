import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, aiEngineServiceMock, emitterMock, chatLogFindMock } =
  vi.hoisted(() => ({
    prismaMock: {
      aiChat: { findUnique: vi.fn(), update: vi.fn() },
      aiChatMessage: { create: vi.fn(), count: vi.fn() },
      aiProvider: { findMany: vi.fn() },
      sessionDiscussion: {
        findFirst: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    },
    aiEngineServiceMock: {
      personalChatStream: vi.fn(),
      generateSummary: vi.fn(),
    },
    emitterMock: { emit: vi.fn() },
    chatLogFindMock: vi.fn(() => ({
      sort: vi.fn(() => ({
        limit: vi.fn(() => ({
          lean: vi.fn(() => Promise.resolve([])),
        })),
      })),
    })),
  }));

vi.mock("../config/database.js", () => ({ default: prismaMock }));
vi.mock("./aiEngine.service.js", () => ({
  aiEngineService: aiEngineServiceMock,
}));
vi.mock("../utils/socketEmitter.js", () => ({
  getSocketEmitter: () => emitterMock,
}));
vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../models/ChatLog.js", () => ({
  ChatLog: {
    find: chatLogFindMock,
  },
}));

import { AiChatService } from "./aiChat.service.js";
import { SessionDiscussionService } from "./sessionDiscussion.service.js";

const NOW = new Date("2026-06-01T00:00:00.000Z");

function createSseResponse(payload: string): Response {
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

function createActiveProvider(overrides: Record<string, unknown> = {}) {
  return {
    id: "provider-gemini",
    name: "gemini",
    displayName: "Gemini",
    apiKey: "encrypted-gemini-key",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    isActive: true,
    fallbackOrder: 1,
    config: {
      defaultModel: "gemini-1.5-pro",
      temperature: 0.3,
      maxTokens: 512,
    },
    ...overrides,
  };
}

describe("Unified provider source of truth — integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends provider_context undefined to both personal-chat and summaries flows", async () => {
    prismaMock.aiProvider.findMany.mockResolvedValue([createActiveProvider()]);

    // Personal chat path
    prismaMock.aiChat.findUnique
      .mockResolvedValueOnce({ id: "chat-1", userId: "user-1" })
      .mockResolvedValueOnce({
        id: "chat-1",
        userId: "user-1",
        messages: [],
        user: { name: "Hashfi" },
      })
      .mockResolvedValueOnce({ id: "chat-1", userId: "user-1" });
    prismaMock.aiChatMessage.create
      .mockResolvedValueOnce({
        id: "msg-u",
        role: "user",
        content: "Halo",
        createdAt: NOW,
      })
      .mockResolvedValueOnce({
        id: "msg-a",
        role: "assistant",
        content: "Hai!",
        createdAt: NOW,
      });
    prismaMock.aiChatMessage.count.mockResolvedValue(2);
    prismaMock.aiChat.update.mockResolvedValue({});
    aiEngineServiceMock.personalChatStream.mockResolvedValue(
      createSseResponse('data: {"content":"Hai!"}\n\n' + "data: [DONE]\n\n"),
    );

    await AiChatService.sendMessage("chat-1", "user-1", "Halo");

    // Summary path
    chatLogFindMock.mockReturnValueOnce({
      sort: vi.fn(() => ({
        limit: vi.fn(() => ({
          lean: vi.fn(() =>
            Promise.resolve([
              {
                senderName: "Student",
                content: "Hello",
                createdAt: new Date().toISOString(),
              },
            ]),
          ),
        })),
      })),
    });
    prismaMock.sessionDiscussion.findFirst.mockResolvedValue({
      id: "chat-1",
      name: "Group Discussion",
      closedAt: null,
      closedBy: null,
      group: {
        course: { ownerId: "lecturer-1" },
        members: [{ userId: "student-1" }],
      },
    });
    prismaMock.sessionDiscussion.updateMany.mockResolvedValue({ count: 1 });
    aiEngineServiceMock.generateSummary.mockResolvedValue({
      success: true,
      summary: "Ringkasan diskusi.",
    });

    await SessionDiscussionService.closeSession(
      "chat-1",
      "lecturer-1",
      "lecturer",
    );

    // Single source of truth: the AI Engine resolves providers itself,
    // so core sends no provider_context on any migrated feature family.
    const personalChatContext =
      aiEngineServiceMock.personalChatStream.mock.calls[0][3];
    const summaryContext = aiEngineServiceMock.generateSummary.mock.calls[0][2];

    expect(personalChatContext).toBeUndefined();
    expect(summaryContext).toBeUndefined();
  });

  it("stays provider-agnostic when the active DB provider changes", async () => {
    prismaMock.aiProvider.findMany.mockResolvedValue([
      createActiveProvider({
        id: "provider-openai",
        name: "openai",
        displayName: "OpenAI GPT",
        baseUrl: "https://api.openai.com/v1",
        config: {
          defaultModel: "gpt-4o-mini",
          temperature: 0.25,
          maxTokens: 1024,
        },
      }),
    ]);

    prismaMock.aiChat.findUnique
      .mockResolvedValueOnce({ id: "chat-1", userId: "user-1" })
      .mockResolvedValueOnce({
        id: "chat-1",
        userId: "user-1",
        messages: [],
        user: { name: "Hashfi" },
      })
      .mockResolvedValueOnce({ id: "chat-1", userId: "user-1" });
    prismaMock.aiChatMessage.create
      .mockResolvedValueOnce({
        id: "msg-u",
        role: "user",
        content: "Halo",
        createdAt: NOW,
      })
      .mockResolvedValueOnce({
        id: "msg-a",
        role: "assistant",
        content: "Hai!",
        createdAt: NOW,
      });
    prismaMock.aiChatMessage.count.mockResolvedValue(2);
    prismaMock.aiChat.update.mockResolvedValue({});
    aiEngineServiceMock.personalChatStream.mockResolvedValue(
      createSseResponse('data: {"content":"Hai!"}\n\n' + "data: [DONE]\n\n"),
    );

    await AiChatService.sendMessage("chat-1", "user-1", "Halo");

    const context = aiEngineServiceMock.personalChatStream.mock.calls[0][3];
    expect(context).toBeUndefined();
    expect(prismaMock.aiProvider.findMany).not.toHaveBeenCalled();
  });
});
