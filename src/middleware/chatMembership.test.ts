import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";

const { chatLogMock } = vi.hoisted(() => ({
  chatLogMock: {
    findOne: vi.fn(),
    findById: vi.fn(),
  },
}));

vi.mock("../models/ChatLog.js", () => ({
  ChatLog: {
    findOne: (...args: unknown[]) => chatLogMock.findOne(...args),
    findById: (...args: unknown[]) => chatLogMock.findById(...args),
  },
}));

import { assertChatMembership } from "./chatMembership.js";

const UUID = "2366e9f1-08e7-4aa9-b707-939e357afedd";

function mockReq(overrides: Partial<Request> = {}) {
  return {
    user: { userId: "user-1", role: "student" },
    query: {},
    params: {},
    path: "/messages/search",
    method: "GET",
    ...overrides,
  } as unknown as Request;
}

function mockRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
  (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
  (res.json as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
}

describe("assertChatMembership conversation_id validation (H1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatLogMock.findOne.mockResolvedValue(null);
    chatLogMock.findById.mockResolvedValue(null);
  });

  it("rejects the object shape from conversation_id[$in][] payloads with 400", async () => {
    const req = mockReq({
      query: {
        conversation_id: {
          $in: [UUID, "9d3e85bd-be51-4fce-8b99-da8eb39282ee"],
        },
      },
    } as Partial<Request>);
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;

    await assertChatMembership(req as never, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "BAD_REQUEST",
        message: "conversation_id must be a valid UUID string",
      },
    });
    // The operator payload must never reach the Mongo filter.
    expect(chatLogMock.findOne).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects array conversation_id with 400", async () => {
    const req = mockReq({
      query: { conversation_id: [UUID] },
    } as Partial<Request>);
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;

    await assertChatMembership(req as never, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(chatLogMock.findOne).not.toHaveBeenCalled();
  });

  it("rejects a non-UUID conversation_id with 400", async () => {
    const req = mockReq({
      query: { conversation_id: "not-a-uuid" },
    } as Partial<Request>);
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;

    await assertChatMembership(req as never, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(chatLogMock.findOne).not.toHaveBeenCalled();
  });

  it("queries with the parsed UUID when conversation_id is valid", async () => {
    chatLogMock.findOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(null),
      }),
    });

    const req = mockReq({
      query: { conversation_id: UUID },
    } as Partial<Request>);
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;

    await assertChatMembership(req as never, res, next);

    expect(chatLogMock.findOne).toHaveBeenCalledWith({
      sessionDiscussionId: UUID,
      deletedAt: null,
    });
    // No group found for the conversation -> 400 (unchanged behaviour)
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("requires authentication first", async () => {
    const req = mockReq({ user: undefined } as Partial<Request>);
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;

    await assertChatMembership(req as never, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(chatLogMock.findOne).not.toHaveBeenCalled();
  });

  it("returns 400 when neither conversation_id nor message id is present", async () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;

    await assertChatMembership(req as never, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "BAD_REQUEST",
        message: "conversation_id or message id required",
      },
    });
  });
});
