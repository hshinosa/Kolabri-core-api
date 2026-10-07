import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  prismaMock,
  emitterMock,
  loggerMock,
  chatLogFindMock,
  generateSummaryMock,
  providerResolutionServiceMock,
} = vi.hoisted(() => {
  const chatLogFindMock = vi.fn(() => ({
    sort: vi.fn(() => ({
      limit: vi.fn(() => ({
        lean: vi.fn(() => Promise.resolve([])),
      })),
    })),
  }));

  const generateSummaryMock = vi.fn(() =>
    Promise.resolve({
      success: false,
      summary: "",
      message_count: 0,
      error: "mock default",
    }),
  );

  const providerResolutionServiceMock = {
    resolveProviderContext: vi.fn(),
    executeWithFallback: vi.fn(async (_input, operation, options) => {
      const resolution =
        await providerResolutionServiceMock.resolveProviderContext(_input);
      const result = await operation(resolution.primary.providerContext);
      if (options?.isSuccess && !options.isSuccess(result)) {
        throw new Error(
          `Provider ${resolution.primary.providerName} returned unsuccessful result`,
        );
      }
      return result;
    }),
  };

  return {
    prismaMock: {
      sessionDiscussion: {
        findFirst: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      groupMember: { findFirst: vi.fn() },
      goal: { findFirst: vi.fn() },
      reflection: { findFirst: vi.fn(), create: vi.fn() },
      sessionDiscussionReflection: { create: vi.fn(), findFirst: vi.fn() },
      $transaction: vi.fn((fn) => fn()),
    },
    emitterMock: { emit: vi.fn() },
    loggerMock: {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    chatLogFindMock,
    generateSummaryMock,
    providerResolutionServiceMock,
  };
});

vi.mock("../config/database.js", () => ({
  default: prismaMock,
}));

vi.mock("../utils/socketEmitter.js", () => ({
  getSocketEmitter: () => emitterMock,
}));

vi.mock("../utils/logger.js", () => ({
  logger: loggerMock,
}));

vi.mock("../models/ChatLog.js", () => ({
  ChatLog: {
    find: chatLogFindMock,
  },
}));

vi.mock("./aiEngine.service.js", () => ({
  aiEngineService: {
    generateSummary: generateSummaryMock,
  },
}));

vi.mock("./providerResolution.service.js", () => ({
  providerResolutionService: providerResolutionServiceMock,
}));

import { SessionDiscussionService } from "./sessionDiscussion.service.js";

describe("SessionDiscussionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("closes a session for a student group member and broadcasts the closure", async () => {
    const closedAt = new Date("2026-05-03T10:00:00.000Z");
    prismaMock.sessionDiscussion.findFirst.mockResolvedValue({
      id: "chat-1",
      name: "General",
      closedAt: null,
      closedBy: null,
      group: {
        course: { ownerId: "lecturer-1" },
        members: [{ userId: "student-1" }],
      },
    });
    prismaMock.sessionDiscussion.updateMany.mockResolvedValue({ count: 1 });

    const result = await SessionDiscussionService.closeSession(
      "chat-1",
      "student-1",
      "student",
    );

    expect(prismaMock.sessionDiscussion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "chat-1", closedAt: null },
        data: expect.objectContaining({ closedBy: "student-1" }),
      }),
    );
    expect(emitterMock.emit).toHaveBeenCalledWith("chat-1", "session_closed", {
      sessionDiscussionId: "chat-1",
      closedAt: expect.any(String),
      message: "Sesi diskusi ini telah ditutup oleh mahasiswa.",
    });
    expect(result).toEqual({
      id: "chat-1",
      name: "General",
      closedAt: expect.any(Date),
      closedBy: "student-1",
      summary: null,
      summaryGeneratedAt: null,
      summaryError: null,
      attendanceData: null,
    });
  });

  it("generates and saves summary when AI Engine returns success", async () => {
    const closedAt = new Date("2026-05-03T10:00:00.000Z");
    const summaryText =
      "Sesi diskusi membahas konsep dasar React hooks dan state management.";

    prismaMock.sessionDiscussion.findFirst.mockResolvedValue({
      id: "chat-1",
      name: "General",
      closedAt: null,
      closedBy: null,
      group: {
        course: { ownerId: "lecturer-1" },
        members: [{ userId: "student-1" }],
      },
    });
    prismaMock.sessionDiscussion.updateMany.mockResolvedValue({ count: 1 });

    chatLogFindMock.mockReturnValue({
      sort: vi.fn(() => ({
        limit: vi.fn(() => ({
          lean: vi.fn(() =>
            Promise.resolve([
              {
                senderName: "Student A",
                content: "Apa itu useState?",
                createdAt: new Date(),
              },
              {
                senderName: "Student B",
                content: "useState adalah hook untuk state management",
                createdAt: new Date(),
              },
            ]),
          ),
        })),
      })),
    });

    generateSummaryMock.mockResolvedValueOnce({
      success: true,
      summary: summaryText,
      message_count: 2,
      error: "",
    });

    const result = await SessionDiscussionService.closeSession(
      "chat-1",
      "student-1",
      "student",
    );

    expect(chatLogFindMock).toHaveBeenCalledWith({
      sessionDiscussionId: "chat-1",
      deletedAt: null,
      senderType: { $in: ["student", "lecturer", "ai"] },
    });
    expect(generateSummaryMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ sender: "Student A" }),
        expect.objectContaining({ sender: "Student B" }),
      ]),
      "chat-1",
      undefined,
    );
    expect(prismaMock.sessionDiscussion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "chat-1" },
        data: expect.objectContaining({
          summary: summaryText,
          summaryGeneratedAt: expect.any(Date),
        }),
      }),
    );
    expect(result).toEqual({
      id: "chat-1",
      name: "General",
      closedAt: expect.any(Date),
      closedBy: "student-1",
      summary: summaryText,
      summaryGeneratedAt: expect.any(Date),
      summaryError: null,
      attendanceData: null,
    });
  });

  it("returns summaryError when AI Engine fails during summary generation", async () => {
    const closedAt = new Date("2026-05-03T10:00:00.000Z");

    prismaMock.sessionDiscussion.findFirst.mockResolvedValue({
      id: "chat-1",
      name: "General",
      closedAt: null,
      closedBy: null,
      group: {
        course: { ownerId: "lecturer-1" },
        members: [{ userId: "student-1" }],
      },
    });
    prismaMock.sessionDiscussion.updateMany.mockResolvedValue({ count: 1 });

    chatLogFindMock.mockReturnValue({
      sort: vi.fn(() => ({
        limit: vi.fn(() => ({
          lean: vi.fn(() =>
            Promise.resolve([
              {
                senderName: "Student A",
                content: "Test message",
                createdAt: new Date(),
              },
            ]),
          ),
        })),
      })),
    });

    generateSummaryMock.mockRejectedValueOnce(new Error("AI Engine timeout"));

    const result = await SessionDiscussionService.closeSession(
      "chat-1",
      "student-1",
      "student",
    );

    expect(loggerMock.warn).toHaveBeenCalledWith(
      "Summary generation failed during session close",
      expect.objectContaining({
        sessionDiscussionId: "chat-1",
        error: "AI Engine timeout",
      }),
    );
    expect(result).toEqual({
      id: "chat-1",
      name: "General",
      closedAt: expect.any(Date),
      closedBy: "student-1",
      summary: null,
      summaryGeneratedAt: null,
      summaryError: "AI Engine timeout",
      attendanceData: null,
    });
  });

  it("skips summary generation when chat has no messages", async () => {
    const closedAt = new Date("2026-05-03T10:00:00.000Z");

    prismaMock.sessionDiscussion.findFirst.mockResolvedValue({
      id: "chat-1",
      name: "General",
      closedAt: null,
      closedBy: null,
      group: {
        course: { ownerId: "lecturer-1" },
        members: [{ userId: "student-1" }],
      },
    });
    prismaMock.sessionDiscussion.updateMany.mockResolvedValue({ count: 1 });

    chatLogFindMock.mockReturnValue({
      sort: vi.fn(() => ({
        limit: vi.fn(() => ({
          lean: vi.fn(() => Promise.resolve([])),
        })),
      })),
    });

    const result = await SessionDiscussionService.closeSession(
      "chat-1",
      "student-1",
      "student",
    );

    expect(generateSummaryMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      id: "chat-1",
      name: "General",
      closedAt: expect.any(Date),
      closedBy: "student-1",
      summary: null,
      summaryGeneratedAt: null,
      summaryError: null,
      attendanceData: null,
    });
  });

  it("rejects closing a session when the student is not a group member", async () => {
    prismaMock.sessionDiscussion.findFirst.mockResolvedValue({
      id: "chat-1",
      name: "General",
      closedAt: null,
      closedBy: null,
      group: {
        course: { ownerId: "lecturer-1" },
        members: [{ userId: "student-2" }],
      },
    });

    await expect(
      SessionDiscussionService.closeSession("chat-1", "student-1", "student"),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "You are not a member of this group",
    });
  });

  it("computes session discussion reflection status for a closed student session", async () => {
    prismaMock.sessionDiscussion.findFirst.mockResolvedValue({
      id: "chat-1",
      name: "General",
      closedAt: new Date("2026-05-03T10:00:00.000Z"),
      closedBy: "lecturer-1",
      group: {
        course: { ownerId: "lecturer-1" },
        members: [{ userId: "student-1" }],
      },
      goals: [{ id: "goal-1" }],
      reflections: [],
    });

    const result = await SessionDiscussionService.getSessionDiscussionStatus(
      "chat-1",
      "student-1",
      "student",
    );

    expect(result).toEqual({
      id: "chat-1",
      name: "General",
      isClosed: true,
      closedAt: new Date("2026-05-03T10:00:00.000Z"),
      hasReflection: false,
      needsReflection: true,
      hasGoal: true,
    });
  });

  it("submits a closed-session reflection and links the user goal when available", async () => {
    const createdAt = new Date("2026-05-03T12:00:00.000Z");
    prismaMock.sessionDiscussion.findFirst.mockResolvedValue({
      id: "chat-1",
      name: "General",
      closedAt: new Date("2026-05-03T10:00:00.000Z"),
      closedBy: "lecturer-1",
      group: {
        course: { ownerId: "lecturer-1" },
        members: [{ userId: "student-1" }],
      },
      goals: [{ id: "goal-1" }],
    });
    prismaMock.reflection.findFirst.mockResolvedValue(null);
    prismaMock.reflection.create.mockResolvedValue({
      id: "reflection-1",
      content: "I learned how to synthesize arguments.",
      type: "session",
      sessionDiscussion: { id: "chat-1", name: "General" },
      goal: { id: "goal-1", content: "Synthesize arguments" },
      user: { id: "student-1", name: "Alya" },
      createdAt,
    });

    const result = await SessionDiscussionService.submitSessionReflection(
      "chat-1",
      "I learned how to synthesize arguments.",
      "student-1",
    );

    expect(prismaMock.reflection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ goalId: "goal-1", type: "session" }),
      }),
    );
    expect(result).toEqual({
      id: "reflection-1",
      content: "I learned how to synthesize arguments.",
      type: "session",
      sessionDiscussion: { id: "chat-1", name: "General" },
      goal: { id: "goal-1", content: "Synthesize arguments" },
      createdBy: { id: "student-1", name: "Alya" },
      createdAt,
    });
  });

  it("rejects reflection submission before the session is closed", async () => {
    prismaMock.sessionDiscussion.findFirst.mockResolvedValue({
      id: "chat-1",
      name: "General",
      closedAt: null,
      closedBy: null,
      group: {
        course: { ownerId: "lecturer-1" },
        members: [{ userId: "student-1" }],
      },
      goals: [],
    });

    await expect(
      SessionDiscussionService.submitSessionReflection(
        "chat-1",
        "Reflection",
        "student-1",
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "Session must be closed before submitting reflection",
    });
  });
});
