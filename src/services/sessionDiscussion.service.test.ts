import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  prismaMock,
  emitterMock,
  aiEngineMock,
  attendanceMock,
  chatLogFindMock,
} = vi.hoisted(() => ({
  prismaMock: {
    sessionDiscussion: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    attendanceSession: { findUnique: vi.fn(), create: vi.fn() },
    attendanceRecord: { createMany: vi.fn() },
  },
  emitterMock: { emit: vi.fn() },
  aiEngineMock: { generateSummary: vi.fn() },
  attendanceMock: { computeAttendance: vi.fn() },
  chatLogFindMock: vi.fn(() => ({
    sort: vi.fn(() => ({
      limit: vi.fn(() => ({
        lean: vi.fn(() => Promise.resolve([])),
      })),
    })),
  })),
}));

vi.mock("../config/database.js", () => ({ default: prismaMock }));
vi.mock("../utils/socketEmitter.js", () => ({
  getSocketEmitter: () => emitterMock,
}));
vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../models/ChatLog.js", () => ({ ChatLog: { find: chatLogFindMock } }));
vi.mock("./aiEngine.service.js", () => ({ aiEngineService: aiEngineMock }));
vi.mock("./attendance.service.js", () => ({
  AttendanceService: attendanceMock,
}));

import { SessionDiscussionService } from "./sessionDiscussion.service.js";

function openSession() {
  return {
    id: "chat-1",
    name: "General",
    closedAt: null,
    closedBy: null,
    weekId: null,
    group: {
      course: { id: "course-1", ownerId: "lecturer-1" },
      members: [{ userId: "student-1" }, { userId: "student-2" }],
    },
  };
}

describe("SessionDiscussionService.closeSession — M5 atomic close (anti-race)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.sessionDiscussion.findFirst.mockResolvedValue(openSession());
    attendanceMock.computeAttendance.mockResolvedValue(null);
  });

  it("lets only one of two parallel close calls win", async () => {
    // Simulates the DB guard: the conditional UPDATE ... WHERE closed_at IS NULL
    // flips the row on the first write, so the second one matches nothing.
    let alreadyClosed = false;
    prismaMock.sessionDiscussion.updateMany.mockImplementation(async () => {
      if (alreadyClosed) {
        return { count: 0 };
      }
      alreadyClosed = true;
      return { count: 1 };
    });

    const results = await Promise.allSettled([
      SessionDiscussionService.closeSession("chat-1", "student-1", "student"),
      SessionDiscussionService.closeSession("chat-1", "student-2", "student"),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter(
      (r) => r.status === "rejected",
    ) as PromiseRejectedResult[];

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({
      statusCode: 400,
      message: "This session is already closed",
    });

    const winner = (
      fulfilled[0] as PromiseFulfilledResult<Record<string, unknown>>
    ).value;
    expect(winner).toMatchObject({ id: "chat-1", closedAt: expect.any(Date) });
    expect(["student-1", "student-2"]).toContain(winner.closedBy);

    expect(prismaMock.sessionDiscussion.updateMany).toHaveBeenCalledTimes(2);
    for (const [args] of prismaMock.sessionDiscussion.updateMany.mock.calls) {
      expect(args).toMatchObject({
        where: { id: "chat-1", closedAt: null },
        data: { closedBy: expect.any(String) },
      });
    }

    // Broadcast / summary / attendance run for the winner only
    expect(emitterMock.emit).toHaveBeenCalledTimes(1);
    expect(attendanceMock.computeAttendance).toHaveBeenCalledTimes(1);
    expect(aiEngineMock.generateSummary).not.toHaveBeenCalled();
    expect(prismaMock.sessionDiscussion.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ closedBy: expect.any(String) }),
      }),
    );
  });

  it("throws already-closed without touching side effects when the row is claimed elsewhere", async () => {
    prismaMock.sessionDiscussion.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      SessionDiscussionService.closeSession("chat-1", "student-1", "student"),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "This session is already closed",
    });

    expect(emitterMock.emit).not.toHaveBeenCalled();
    expect(attendanceMock.computeAttendance).not.toHaveBeenCalled();
    expect(aiEngineMock.generateSummary).not.toHaveBeenCalled();
  });

  it("checks group membership before attempting the atomic claim", async () => {
    prismaMock.sessionDiscussion.findFirst.mockResolvedValue({
      ...openSession(),
      group: {
        course: { id: "course-1", ownerId: "lecturer-1" },
        members: [{ userId: "student-2" }],
      },
    });

    await expect(
      SessionDiscussionService.closeSession("chat-1", "student-1", "student"),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "You are not a member of this group",
    });

    expect(prismaMock.sessionDiscussion.updateMany).not.toHaveBeenCalled();
  });
});
