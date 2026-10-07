import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, chatAnalyticsMock, chatLogMock } = vi.hoisted(() => ({
  prismaMock: {
    course: { findFirst: vi.fn() },
    courseStudent: { findMany: vi.fn() },
    group: { findMany: vi.fn() },
  },
  chatAnalyticsMock: { getGroupAnalytics: vi.fn() },
  chatLogMock: { find: vi.fn(), aggregate: vi.fn() },
}));

vi.mock("../config/database.js", () => ({ default: prismaMock }));
vi.mock("./chatAnalytics.service.js", () => ({
  chatAnalyticsService: chatAnalyticsMock,
}));
vi.mock("../models/ChatLog.js", () => ({ ChatLog: chatLogMock }));

import { AnalyticsService } from "./analytics.service.js";

const options = {
  page: 1,
  perPage: 15,
  sortBy: "quality_score",
  sortDir: "desc",
};

describe("AnalyticsService ownership checks (H4 / F-03..F-05)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects getStudentBreakdown for a lecturer who does not own the course", async () => {
    prismaMock.course.findFirst.mockResolvedValue({ ownerId: "lecturer-siti" });

    await expect(
      AnalyticsService.getStudentBreakdown(
        "IF212",
        options,
        "lecturer-budi",
        "lecturer",
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
      message: "You do not own this course",
    });

    expect(prismaMock.courseStudent.findMany).not.toHaveBeenCalled();
  });

  it("allows getStudentBreakdown for the course owner", async () => {
    prismaMock.course.findFirst.mockResolvedValue({ ownerId: "lecturer-budi" });
    prismaMock.courseStudent.findMany.mockResolvedValue([]);

    const result = await AnalyticsService.getStudentBreakdown(
      "IF212",
      options,
      "lecturer-budi",
      "lecturer",
    );

    expect(result.meta.total).toBe(0);
    expect(prismaMock.courseStudent.findMany).toHaveBeenCalled();
  });

  it("allows getStudentBreakdown for an admin on another lecturer course", async () => {
    prismaMock.course.findFirst.mockResolvedValue({ ownerId: "lecturer-siti" });
    prismaMock.courseStudent.findMany.mockResolvedValue([]);

    const result = await AnalyticsService.getStudentBreakdown(
      "IF212",
      options,
      "admin-1",
      "admin",
    );

    expect(result.meta.total).toBe(0);
  });

  it("fails closed for getStudentBreakdown when the caller has no userId", async () => {
    prismaMock.course.findFirst.mockResolvedValue({ ownerId: "lecturer-siti" });

    await expect(
      AnalyticsService.getStudentBreakdown(
        "IF212",
        options,
        undefined,
        undefined,
      ),
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });

    expect(prismaMock.courseStudent.findMany).not.toHaveBeenCalled();
  });

  it("returns 404 from getStudentBreakdown when the course does not exist", async () => {
    prismaMock.course.findFirst.mockResolvedValue(null);

    await expect(
      AnalyticsService.getStudentBreakdown(
        "IF212",
        options,
        "lecturer-budi",
        "lecturer",
      ),
    ).rejects.toMatchObject({ statusCode: 404, code: "NOT_FOUND" });
  });

  it("rejects getCourseTrendPoints for a lecturer who does not own the course", async () => {
    prismaMock.course.findFirst.mockResolvedValue({ ownerId: "lecturer-siti" });

    await expect(
      AnalyticsService.getCourseTrendPoints(
        "IF212",
        "engagement",
        undefined,
        undefined,
        "lecturer-budi",
        "lecturer",
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
      message: "You do not own this course",
    });

    expect(prismaMock.group.findMany).not.toHaveBeenCalled();
  });

  it("returns trend points for the course owner", async () => {
    prismaMock.course.findFirst.mockResolvedValue({ ownerId: "lecturer-budi" });
    prismaMock.group.findMany.mockResolvedValue([]);

    const result = await AnalyticsService.getCourseTrendPoints(
      "IF212",
      "engagement",
      "2026-09-24",
      "2026-09-26",
      "lecturer-budi",
      "lecturer",
    );

    expect(result.success).toBe(true);
    expect(result.data.points).toHaveLength(3);
  });

  it("allows getCourseTrendPoints for an admin on another lecturer course", async () => {
    prismaMock.course.findFirst.mockResolvedValue({ ownerId: "lecturer-siti" });
    prismaMock.group.findMany.mockResolvedValue([]);

    const result = await AnalyticsService.getCourseTrendPoints(
      "IF212",
      "engagement",
      "2026-09-24",
      "2026-09-26",
      "admin-1",
      "admin",
    );

    expect(result.success).toBe(true);
  });
});

describe("AnalyticsService shared report access (H3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const course = {
    id: "IF203",
    name: "Algoritma & Struktur Data",
    code: "IF203",
    ownerId: "lecturer-siti",
    groups: [],
  };

  it("serves getCourseAnalytics for a verified share token (skipOwnership)", async () => {
    prismaMock.course.findFirst.mockResolvedValue(course);
    chatLogMock.aggregate.mockResolvedValue([]);

    const result = await AnalyticsService.getCourseAnalytics(
      "IF203",
      undefined,
      { skipOwnership: true },
    );

    expect(result.success).toBe(true);
    expect(result.course).toEqual({
      id: "IF203",
      name: "Algoritma & Struktur Data",
      code: "IF203",
    });
  });

  it("still enforces ownership on the authenticated getCourseAnalytics path", async () => {
    prismaMock.course.findFirst.mockResolvedValue(course);

    await expect(
      AnalyticsService.getCourseAnalytics("IF203", "lecturer-budi"),
    ).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });

    await expect(
      AnalyticsService.getCourseAnalytics("IF203", undefined),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });
  });
});
