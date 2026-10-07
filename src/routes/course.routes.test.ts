import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_SECRET = process.env.JWT_SECRET || "course-routes-test-secret";

const { prismaMock, chatLogMock } = vi.hoisted(() => ({
  prismaMock: {
    course: { findUnique: vi.fn() },
    courseStudent: { findUnique: vi.fn() },
    user: { findFirst: vi.fn() },
  },
  chatLogMock: { find: vi.fn() },
}));

vi.mock("../config/database.js", () => ({
  default: prismaMock,
  prisma: prismaMock,
}));

vi.mock("../models/ChatLog.js", () => ({
  ChatLog: chatLogMock,
}));

import courseRoutes from "./course.routes.js";
import { errorHandler } from "../middleware/errorHandler.js";

type Role = "student" | "lecturer" | "admin";

function tokenFor(role: Role, userId: string) {
  return jwt.sign(
    { userId, email: `${userId}@example.com`, role },
    process.env.JWT_SECRET as string,
    { expiresIn: "1h" },
  );
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/courses", courseRoutes);
  app.use(errorHandler);
  return app;
}

function mockChatLogFind(messages: unknown[]) {
  const lean = vi.fn().mockResolvedValue(messages);
  const limit = vi.fn().mockReturnValue({ lean });
  const sort = vi.fn().mockReturnValue({ limit });
  chatLogMock.find.mockReturnValue({ sort });
}

describe("GET /api/courses/:id/messages (auth + enrollment guard, fix C2/F-02)", () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    // verifyToken memvalidasi keaktifan user lewat prisma saat cache kosong.
    prismaMock.user.findFirst.mockImplementation(
      async (args: { where?: { id?: string } }) => ({
        id: args?.where?.id ?? "user",
      }),
    );
    app = makeApp();
  });

  it("returns 401 without a token", async () => {
    const res = await request(app).get("/api/courses/course-1/messages");

    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe("UNAUTHORIZED");
    expect(chatLogMock.find).not.toHaveBeenCalled();
  });

  it("returns 401 with a garbage token", async () => {
    const res = await request(app)
      .get("/api/courses/course-1/messages")
      .set("Authorization", "Bearer not-a-jwt");

    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe("UNAUTHORIZED");
  });

  it("returns 403 for a student who is not enrolled", async () => {
    prismaMock.course.findUnique.mockResolvedValue({
      id: "course-1",
      ownerId: "lecturer-owner",
    });
    prismaMock.courseStudent.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/courses/course-1/messages")
      .set(
        "Authorization",
        `Bearer ${tokenFor("student", "outsider-student")}`,
      );

    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe("FORBIDDEN");
    expect(chatLogMock.find).not.toHaveBeenCalled();
  });

  it("returns 403 for a lecturer who does not own the course", async () => {
    prismaMock.course.findUnique.mockResolvedValue({
      id: "course-1",
      ownerId: "lecturer-owner",
    });
    prismaMock.courseStudent.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/courses/course-1/messages")
      .set("Authorization", `Bearer ${tokenFor("lecturer", "other-lecturer")}`);

    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe("FORBIDDEN");
  });

  it("returns 404 when the course does not exist", async () => {
    prismaMock.course.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get("/api/courses/missing-course/messages")
      .set("Authorization", `Bearer ${tokenFor("student", "student-1")}`);

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe("NOT_FOUND");
  });

  it("returns 200 with messages for the course owner", async () => {
    prismaMock.course.findUnique.mockResolvedValue({
      id: "course-1",
      ownerId: "lecturer-owner",
    });
    mockChatLogFind([
      {
        _id: "msg-1",
        courseId: "course-1",
        senderId: "student-1",
        senderName: "Andi Pratama",
        senderType: "student",
        content: "hello",
        isIntervention: false,
        createdAt: "2026-10-01T00:00:00.000Z",
      },
    ]);

    const res = await request(app)
      .get("/api/courses/course-1/messages?limit=5")
      .set("Authorization", `Bearer ${tokenFor("lecturer", "lecturer-owner")}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].content).toBe("hello");
    expect(res.body.data[0].sender_type).toBe("user");
    expect(chatLogMock.find).toHaveBeenCalledWith({
      courseId: "course-1",
      deletedAt: null,
    });
  });

  it("returns 200 with messages for an enrolled student", async () => {
    prismaMock.course.findUnique.mockResolvedValue({
      id: "course-1",
      ownerId: "lecturer-owner",
    });
    prismaMock.courseStudent.findUnique.mockResolvedValue({
      id: "enrollment-1",
    });
    mockChatLogFind([{ _id: "msg-2", content: "from class" }]);

    const res = await request(app)
      .get("/api/courses/course-1/messages")
      .set(
        "Authorization",
        `Bearer ${tokenFor("student", "enrolled-student")}`,
      );

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(prismaMock.courseStudent.findUnique).toHaveBeenCalledWith({
      where: {
        courseId_userId: {
          courseId: "course-1",
          userId: "enrolled-student",
        },
      },
    });
  });
});
