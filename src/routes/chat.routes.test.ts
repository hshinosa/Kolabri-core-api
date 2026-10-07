import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const { chatLogMock } = vi.hoisted(() => {
  const mockSave = vi.fn().mockImplementation(function (this: any) {
    return Promise.resolve(this);
  });
  const mockFind: any = vi.fn();
  const mockFindById: any = vi.fn(() => Promise.resolve(null));

  return {
    chatLogMock: {
      find: mockFind,
      findById: mockFindById,
      prototype: { save: mockSave },
    },
  };
});

vi.mock("../models/ChatLog.js", () => ({
  ChatLog: {
    find: (query: any) => chatLogMock.find(query),
    findById: (id: any) => chatLogMock.findById(id),
  },
}));

vi.mock("../middleware/chatMembership.js", () => ({
  assertChatMembership: (_req: any, _res: any, next: any) => {
    next();
  },
}));

vi.mock("../middleware/auth.js", () => ({
  verifyToken: (req: any, _res: any, next: any) => {
    req.user = { userId: "user-1", role: "student" };
    next();
  },
}));

import chatRoutes from "./chat.routes.js";
import { errorHandler } from "../middleware/errorHandler.js";

// sessionDiscussionId is always a PostgreSQL UUID in production (H1 guard).
const CONV_ID = "2366e9f1-08e7-4aa9-b707-939e357afedd";
const OTHER_CONV_ID = "9d3e85bd-be51-4fce-8b99-da8eb39282ee";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/chat", chatRoutes);
  // Same error pipeline as production: validateQuery rejects with ApiError.
  app.use(errorHandler);
  return app;
}

function chainResult(docs: unknown[]) {
  const selectFn = vi.fn().mockResolvedValue(docs);
  const limitFn = vi.fn().mockReturnValue({ select: selectFn });
  const sortFn = vi.fn().mockReturnValue({ limit: limitFn });
  return { sortFn, limitFn, selectFn };
}

describe("chat.routes", () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = makeApp();
  });

  describe("GET /messages/search", () => {
    it("returns 400 when conversation_id is missing", async () => {
      const res = await request(app).get("/api/chat/messages/search?q=hello");
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("BAD_REQUEST");
    });

    it("returns 400 when q is too short", async () => {
      const res = await request(app).get(
        `/api/chat/messages/search?conversation_id=${CONV_ID}&q=a`,
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for the conversation_id[$in] operator payload (H1)", async () => {
      // Live authorization-bypass payload: qs turns this into
      // { $in: [convA, convB] } which previously replaced the Mongo filter.
      const res = await request(app).get(
        `/api/chat/messages/search?conversation_id[$in][]=${CONV_ID}` +
          `&conversation_id[$in][]=${OTHER_CONV_ID}&q=notation&limit=20`,
      );
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("BAD_REQUEST");
      expect(chatLogMock.find).not.toHaveBeenCalled();
    });

    it("returns 400 for a non-UUID conversation_id", async () => {
      const res = await request(app).get(
        "/api/chat/messages/search?conversation_id=cs-1&q=hello",
      );
      expect(res.status).toBe(400);
      expect(chatLogMock.find).not.toHaveBeenCalled();
    });

    it("returns 400 when q exceeds 200 characters", async () => {
      const res = await request(app).get(
        `/api/chat/messages/search?conversation_id=${CONV_ID}&q=${"a".repeat(201)}`,
      );
      expect(res.status).toBe(400);
      expect(chatLogMock.find).not.toHaveBeenCalled();
    });

    it("returns search results for valid query", async () => {
      const mockDocs = [
        {
          _id: { toString: () => "507f1f77bcf86cd799439011" },
          content: "hello world",
          senderName: "Alice",
          createdAt: new Date("2026-01-01"),
        },
        {
          _id: { toString: () => "msg-2" },
          content: "hello again",
          senderName: "Bob",
          createdAt: new Date("2026-01-02"),
        },
      ];

      const { sortFn } = chainResult(mockDocs);
      chatLogMock.find.mockReturnValue({ sort: sortFn });

      const res = await request(app).get(
        `/api/chat/messages/search?conversation_id=${CONV_ID}&q=hello`,
      );

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].id).toBe("507f1f77bcf86cd799439011");
      expect(res.body.data[0].content).toBe("hello world");
      expect(res.body.data[0].sender_name).toBe("Alice");
      expect(res.body.pagination.has_more).toBe(false);
      expect(chatLogMock.find).toHaveBeenCalledWith({
        sessionDiscussionId: CONV_ID,
        content: { $regex: "hello", $options: "i" },
        deletedAt: null,
      });
    });

    it("escapes regex metacharacters so wildcards only match literally (H1)", async () => {
      const { sortFn } = chainResult([]);
      chatLogMock.find.mockReturnValue({ sort: sortFn });

      const res = await request(app).get(
        `/api/chat/messages/search?conversation_id=${CONV_ID}&q=${encodeURIComponent(".*")}`,
      );

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
      expect(chatLogMock.find).toHaveBeenCalledWith(
        expect.objectContaining({
          content: { $regex: "\\.\\*", $options: "i" },
        }),
      );

      // The compiled pattern must not match arbitrary content.
      const passed = chatLogMock.find.mock.calls[0][0].content.$regex;
      expect(new RegExp(passed, "i").test("anything at all")).toBe(false);
      expect(new RegExp(passed, "i").test("literal .* text")).toBe(true);
    });

    it("compiles an invalid pattern like [a- as a literal instead of 500 (H1)", async () => {
      const { sortFn } = chainResult([]);
      chatLogMock.find.mockReturnValue({ sort: sortFn });

      const res = await request(app).get(
        `/api/chat/messages/search?conversation_id=${CONV_ID}&q=${encodeURIComponent("[a-")}`,
      );

      expect(res.status).toBe(200);
      const passed = chatLogMock.find.mock.calls[0][0].content.$regex;
      // Previously Mongo compiled the raw pattern and answered HTTP 500.
      expect(() => new RegExp(passed, "i")).not.toThrow();
      expect(passed).toBe("\\[a-");
    });

    it("handles database error gracefully", async () => {
      const sortFn = vi.fn(() => {
        throw new Error("DB error");
      });
      chatLogMock.find.mockReturnValue({ sort: sortFn });

      const res = await request(app).get(
        `/api/chat/messages/search?conversation_id=${CONV_ID}&q=hello`,
      );

      expect(res.status).toBe(500);
    });
  });

  describe("GET /messages/pinned", () => {
    it("returns 400 when conversation_id is missing", async () => {
      const res = await request(app).get("/api/chat/messages/pinned");
      expect(res.status).toBe(400);
    });

    it("returns 400 for the conversation_id[$in] operator payload (H1)", async () => {
      const res = await request(app).get(
        `/api/chat/messages/pinned?conversation_id[$in][]=${CONV_ID}` +
          `&conversation_id[$in][]=${OTHER_CONV_ID}`,
      );
      expect(res.status).toBe(400);
      expect(chatLogMock.find).not.toHaveBeenCalled();
    });

    it("returns pinned messages sorted by pinnedAt descending", async () => {
      const pinnedAt = new Date("2026-06-01");
      const mockPinned = [
        {
          _id: { toString: () => "pin-1" },
          content: "Important note",
          senderName: "Lecturer",
          pinnedAt,
          pinnedBy: "lecturer-1",
          sessionDiscussionId: CONV_ID,
          createdAt: new Date("2026-01-01"),
        },
      ];

      const selectFn = vi.fn().mockResolvedValue(mockPinned);
      const limitFn = vi.fn().mockReturnValue({ select: selectFn });
      const sortFn = vi.fn().mockReturnValue({ limit: limitFn });
      chatLogMock.find.mockReturnValue({ sort: sortFn });

      const res = await request(app).get(
        `/api/chat/messages/pinned?conversation_id=${CONV_ID}`,
      );

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].message_id).toBe("pin-1");
      expect(res.body.data[0].content).toBe("Important note");
      expect(res.body.data[0].pinned_by).toBe("lecturer-1");
      expect(chatLogMock.find).toHaveBeenCalledWith({
        sessionDiscussionId: CONV_ID,
        isPinned: true,
        deletedAt: null,
      });
    });

    it('returns pinned_by as "unknown" when not set', async () => {
      const mockPinned = [
        {
          _id: { toString: () => "pin-1" },
          content: "test",
          senderName: "Alice",
          pinnedAt: null,
          pinnedBy: null as string | null,
          sessionDiscussionId: CONV_ID,
          createdAt: new Date("2026-01-01"),
        },
      ];

      const selectFn = vi.fn().mockResolvedValue(mockPinned);
      const limitFn = vi.fn().mockReturnValue({ select: selectFn });
      const sortFn = vi.fn().mockReturnValue({ limit: limitFn });
      chatLogMock.find.mockReturnValue({ sort: sortFn });

      const res = await request(app).get(
        `/api/chat/messages/pinned?conversation_id=${CONV_ID}`,
      );

      expect(res.body.data[0].pinned_by).toBe("unknown");
    });
  });

  describe("POST /messages/:id/pin", () => {
    it("returns 404 when message not found", async () => {
      chatLogMock.findById.mockResolvedValue(null);

      const res = await request(app)
        .post("/api/chat/messages/507f1f77bcf86cd799439011/pin")
        .send({ conversation_id: "cs-1" });

      expect(res.status).toBe(404);
    });

    it("pins a message and returns data", async () => {
      const pinnedAt = new Date("2026-06-01");
      const mockMessage = {
        _id: { toString: () => "507f1f77bcf86cd799439011" },
        content: "Pin me",
        senderName: "Bob",
        sessionDiscussionId: "cs-1",
        isPinned: false,
        pinnedAt: null as Date | null,
        pinnedBy: null as string | null,
        save: vi.fn().mockImplementation(function (this: any) {
          Object.assign(this, {
            isPinned: true,
            pinnedAt,
            pinnedBy: "user-1",
          });
          return Promise.resolve(this);
        }),
      };

      chatLogMock.findById.mockResolvedValue(mockMessage);

      const res = await request(app)
        .post("/api/chat/messages/507f1f77bcf86cd799439011/pin")
        .send({
          conversation_id: "cs-1",
          content: "Pin me",
          sender_name: "Bob",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message_id).toBe("507f1f77bcf86cd799439011");
      expect(res.body.data.pinned_by).toBe("user-1");
      expect(mockMessage.save).toHaveBeenCalled();
    });

    it("returns 404 when message does not belong to conversation", async () => {
      chatLogMock.findById.mockResolvedValue({
        sessionDiscussionId: "cs-other",
      });

      const res = await request(app)
        .post("/api/chat/messages/507f1f77bcf86cd799439011/pin")
        .send({ conversation_id: "cs-1" });

      expect(res.status).toBe(404);
    });
  });

  describe("POST /messages/:id/unpin", () => {
    it("returns 404 when message not found", async () => {
      chatLogMock.findById.mockResolvedValue(null);

      const res = await request(app).post(
        "/api/chat/messages/507f1f77bcf86cd799439011/unpin",
      );
      expect(res.status).toBe(404);
    });

    it("unpins a message", async () => {
      const mockMessage = {
        isPinned: true,
        pinnedAt: new Date(),
        pinnedBy: "user-1",
        save: vi.fn().mockImplementation(function (this: any) {
          Object.assign(this, {
            isPinned: false,
            pinnedAt: undefined,
            pinnedBy: undefined,
          });
          return Promise.resolve(this);
        }),
      };

      chatLogMock.findById.mockResolvedValue(mockMessage);

      const res = await request(app).post(
        "/api/chat/messages/507f1f77bcf86cd799439011/unpin",
      );
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockMessage.save).toHaveBeenCalled();
    });
  });

  describe("DELETE /messages/:id/pin", () => {
    it("returns 404 when message not found", async () => {
      chatLogMock.findById.mockResolvedValue(null);

      const res = await request(app).delete(
        "/api/chat/messages/507f1f77bcf86cd799439011/pin",
      );
      expect(res.status).toBe(404);
    });

    it("unpins a message via DELETE", async () => {
      const mockMessage = {
        isPinned: true,
        pinnedAt: new Date(),
        pinnedBy: "user-1",
        save: vi.fn().mockImplementation(function (this: any) {
          Object.assign(this, {
            isPinned: false,
            pinnedAt: undefined,
            pinnedBy: undefined,
          });
          return Promise.resolve(this);
        }),
      };

      chatLogMock.findById.mockResolvedValue(mockMessage);

      const res = await request(app).delete(
        "/api/chat/messages/507f1f77bcf86cd799439011/pin",
      );
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(mockMessage.save).toHaveBeenCalled();
    });
  });

  describe("PATCH /messages/:id/topic", () => {
    it("returns 404 when message not found", async () => {
      chatLogMock.findById.mockResolvedValue(null);

      const res = await request(app)
        .patch("/api/chat/messages/507f1f77bcf86cd799439011/topic")
        .send({ topic: "Q1 Analysis", conversation_id: "cs-1" });

      expect(res.status).toBe(404);
    });

    it("sets topic on a message", async () => {
      const mockMessage = {
        _id: { toString: () => "507f1f77bcf86cd799439011" },
        sessionDiscussionId: "cs-1",
        topic: undefined as string | undefined,
        save: vi.fn().mockImplementation(function (this: any) {
          this.topic = "Q1 Analysis";
          return Promise.resolve(this);
        }),
      };

      chatLogMock.findById.mockResolvedValue(mockMessage);

      const res = await request(app)
        .patch("/api/chat/messages/507f1f77bcf86cd799439011/topic")
        .send({ topic: "Q1 Analysis", conversation_id: "cs-1" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.topic).toBe("Q1 Analysis");
      expect(mockMessage.save).toHaveBeenCalled();
    });

    it("clears topic when given empty string", async () => {
      const mockMessage = {
        _id: { toString: () => "507f1f77bcf86cd799439011" },
        sessionDiscussionId: "cs-1",
        topic: "Old Topic",
        save: vi.fn().mockImplementation(function (this: any) {
          this.topic = undefined;
          return Promise.resolve(this);
        }),
      };

      chatLogMock.findById.mockResolvedValue(mockMessage);

      const res = await request(app)
        .patch("/api/chat/messages/507f1f77bcf86cd799439011/topic")
        .send({ topic: "   ", conversation_id: "cs-1" });

      expect(res.status).toBe(200);
      expect(res.body.data.topic).toBeUndefined();
    });
  });

  describe("GET /messages/:id (M9 ownership lookup)", () => {
    it("returns the message payload with conversation and sender ids", async () => {
      chatLogMock.findById.mockResolvedValue({
        _id: { toString: () => "507f1f77bcf86cd799439011" },
        sessionDiscussionId: CONV_ID,
        groupId: "group-1",
        courseId: "course-1",
        senderId: "user-1",
        senderName: "Alice",
        senderType: "student",
        content: "halo",
        version: 0,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        editedAt: null,
        deletedAt: null,
      });

      const res = await request(app).get(
        "/api/chat/messages/507f1f77bcf86cd799439011",
      );

      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id: "507f1f77bcf86cd799439011",
        conversation_id: CONV_ID,
        group_id: "group-1",
        sender_id: "user-1",
        version: 0,
        created_at: "2026-01-01T00:00:00.000Z",
        edited_at: null,
        deleted_at: null,
      });
    });

    it("404s when the message does not exist", async () => {
      chatLogMock.findById.mockResolvedValue(null);

      const res = await request(app).get(
        "/api/chat/messages/507f1f77bcf86cd799439011",
      );

      expect(res.status).toBe(404);
    });

    it("404s for an invalid ObjectId without touching Mongo", async () => {
      const res = await request(app).get("/api/chat/messages/not-an-id");

      expect(res.status).toBe(404);
      expect(chatLogMock.findById).not.toHaveBeenCalled();
    });
  });
});
