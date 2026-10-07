import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    sessionDiscussion: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../config/database.js", () => ({ default: prismaMock }));
vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../utils/socketEmitter.js", () => ({
  getSocketEmitter: vi.fn(() => null),
}));
vi.mock("../models/ChatLog.js", () => ({ ChatLog: { find: vi.fn() } }));
vi.mock("./aiEngine.service.js", () => ({
  aiEngineService: { generateSummary: vi.fn() },
}));
vi.mock("./attendance.service.js", () => ({
  AttendanceService: {
    computeAttendance: vi.fn(),
    saveAttendanceToDb: vi.fn(),
  },
}));

import { SessionDiscussionService } from "./sessionDiscussion.service.js";

const SESSION = "c920f470-e735-431f-9222-86198e4b56ed";

function sessionFixture({
  closedAt = null,
  ownerId = "lecturer-1",
  members = ["student-1"],
}: {
  closedAt?: Date | null;
  ownerId?: string;
  members?: string[];
} = {}) {
  return {
    id: SESSION,
    name: "Sesi",
    closedAt,
    closedBy: null,
    weekId: null,
    group: {
      course: { id: "course-1", ownerId },
      members: members.map((userId) => ({ userId })),
    },
  };
}

describe("SessionDiscussionService.closeSession — M10 check ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("answers 403 (not 400) when a non-member probes an already closed session", async () => {
    prismaMock.sessionDiscussion.findFirst.mockResolvedValue(
      sessionFixture({
        closedAt: new Date("2026-10-07T05:00:00Z"),
        members: ["student-2"],
      }),
    );

    await expect(
      SessionDiscussionService.closeSession(SESSION, "student-1", "student"),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "You are not a member of this group",
    });
    expect(prismaMock.sessionDiscussion.updateMany).not.toHaveBeenCalled();
  });

  it("answers 403 for a non-member probing an open session", async () => {
    prismaMock.sessionDiscussion.findFirst.mockResolvedValue(
      sessionFixture({ members: ["student-2"] }),
    );

    await expect(
      SessionDiscussionService.closeSession(SESSION, "student-1", "student"),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("answers 403 for a lecturer who does not own the course, closed or not", async () => {
    prismaMock.sessionDiscussion.findFirst.mockResolvedValue(
      sessionFixture({ closedAt: new Date(), ownerId: "lecturer-1" }),
    );

    await expect(
      SessionDiscussionService.closeSession(SESSION, "lecturer-2", "lecturer"),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "You do not own this course",
    });
  });

  it("still answers 400 already closed to an authorised member", async () => {
    prismaMock.sessionDiscussion.findFirst.mockResolvedValue(
      sessionFixture({
        closedAt: new Date("2026-10-07T05:00:00Z"),
        members: ["student-1"],
      }),
    );

    await expect(
      SessionDiscussionService.closeSession(SESSION, "student-1", "student"),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: "This session is already closed",
    });
    expect(prismaMock.sessionDiscussion.updateMany).not.toHaveBeenCalled();
  });

  it("claims an open session atomically for an authorised member", async () => {
    prismaMock.sessionDiscussion.findFirst.mockResolvedValue(
      sessionFixture({ members: ["student-1"] }),
    );
    prismaMock.sessionDiscussion.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.sessionDiscussion.update.mockResolvedValue({});

    await SessionDiscussionService.closeSession(
      SESSION,
      "student-1",
      "student",
    );

    expect(prismaMock.sessionDiscussion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SESSION, closedAt: null },
      }),
    );
  });
});
