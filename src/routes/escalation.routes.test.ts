import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const { prismaMock, escalationMock } = vi.hoisted(() => {
  const findChain = vi.fn();
  return {
    prismaMock: {
      course: { findUnique: vi.fn(), findMany: vi.fn() },
    },
    escalationMock: {
      find: findChain,
      findById: vi.fn(),
    },
  };
});

vi.mock("../config/database.js", () => ({ default: prismaMock }));

vi.mock("../models/EscalationState.js", () => ({
  EscalationState: {
    find: (filter: unknown) => {
      escalationMock.find(filter);
      return {
        sort: () => ({
          limit: () => ({
            lean: async () => [{ _id: "esc-1", courseId: "course-1" }],
          }),
        }),
      };
    },
    findById: (id: string) => escalationMock.findById(id),
  },
}));

vi.mock("../services/escalation.service.js", () => ({
  resolveState: vi.fn(async (state: unknown) => state),
  isStagedEscalationEnabled: () => true,
  getThresholds: () => ({}),
  findOrCreateState: vi.fn(),
  advanceStage: vi.fn(),
  shouldNotifyLecturer: vi.fn(),
  markNotificationSent: vi.fn(),
}));

const currentUser: { user: { userId: string; role: string } } = {
  user: { userId: "lecturer-1", role: "lecturer" },
};

vi.mock("../middleware/auth.js", () => ({
  verifyToken: (req: any, _res: any, next: any) => {
    req.user = currentUser.user;
    next();
  },
  requireLecturer: (_req: any, _res: any, next: any) => next(),
}));

import escalationRoutes from "./escalation.routes.js";
import { errorHandler } from "../middleware/error.middleware.js";

const OWN_COURSE = "3c2220d2-9155-4b2d-8150-cdd6492b05f0";
const FOREIGN_COURSE = "e4022aae-b149-48e8-8b6d-bea0b698bca6";
const ESCALATION_ID = "507f1f77bcf86cd799439011";

const BASE = "/api/lecturer/escalations";

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/lecturer/escalations", escalationRoutes);
  app.use(errorHandler);
  return app;
}

describe("escalation.routes", () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    currentUser.user = { userId: "lecturer-1", role: "lecturer" };
    app = makeApp();
    prismaMock.course.findMany.mockResolvedValue([{ id: OWN_COURSE }]);
  });

  describe("GET /", () => {
    it("rejects a courseId owned by another lecturer with 403", async () => {
      prismaMock.course.findUnique.mockResolvedValue({ ownerId: "lecturer-2" });

      const res = await request(app).get(`${BASE}?courseId=${FOREIGN_COURSE}`);

      expect(res.status).toBe(403);
      expect(escalationMock.find).not.toHaveBeenCalled();
    });

    it("returns escalations when the lecturer owns the filtered course", async () => {
      prismaMock.course.findUnique.mockResolvedValue({ ownerId: "lecturer-1" });

      const res = await request(app).get(`${BASE}?courseId=${OWN_COURSE}`);

      expect(res.status).toBe(200);
      expect(escalationMock.find).toHaveBeenCalledWith(
        expect.objectContaining({ courseId: OWN_COURSE }),
      );
    });

    it("scopes an unfiltered list to the lecturer own courses", async () => {
      const res = await request(app).get(`${BASE}/`);

      expect(res.status).toBe(200);
      expect(prismaMock.course.findMany).toHaveBeenCalledWith({
        where: { ownerId: "lecturer-1" },
        select: { id: true },
      });
      expect(escalationMock.find).toHaveBeenCalledWith(
        expect.objectContaining({ courseId: { $in: [OWN_COURSE] } }),
      );
    });

    it("accepts an admin without course scoping", async () => {
      currentUser.user = { userId: "admin-1", role: "admin" };

      const res = await request(app).get(`${BASE}/`);

      expect(res.status).toBe(200);
      expect(escalationMock.find).toHaveBeenCalledWith({});
      expect(prismaMock.course.findMany).not.toHaveBeenCalled();
    });

    it("rejects a non-UUID courseId (operator injection) with 400", async () => {
      const res = await request(app).get(`${BASE}?courseId[$ne]=anything`);

      expect(res.status).toBe(400);
      expect(escalationMock.find).not.toHaveBeenCalled();
    });

    it("rejects an unknown stage value with 400", async () => {
      const res = await request(app).get(`${BASE}?stage=not-a-stage`);

      expect(res.status).toBe(400);
      expect(escalationMock.find).not.toHaveBeenCalled();
    });
  });

  describe("POST /:id/resolve", () => {
    it("404s for an unknown escalation id", async () => {
      escalationMock.findById.mockResolvedValue(null);

      const res = await request(app).post(`${BASE}/${ESCALATION_ID}/resolve`).send({});

      expect(res.status).toBe(404);
    });

    it("rejects resolving an escalation of another lecturer course with 403", async () => {
      escalationMock.findById.mockResolvedValue({
        _id: ESCALATION_ID,
        courseId: FOREIGN_COURSE,
        currentStage: "new",
      });
      prismaMock.course.findUnique.mockResolvedValue({ ownerId: "lecturer-2" });

      const res = await request(app).post(`${BASE}/${ESCALATION_ID}/resolve`).send({});

      expect(res.status).toBe(403);
    });

    it("resolves an escalation of the lecturer own course", async () => {
      escalationMock.findById.mockResolvedValue({
        _id: ESCALATION_ID,
        courseId: OWN_COURSE,
        currentStage: "flag-lecturer",
      });
      prismaMock.course.findUnique.mockResolvedValue({ ownerId: "lecturer-1" });

      const res = await request(app)
        .post(`${BASE}/${ESCALATION_ID}/resolve`)
        .send({ reason: "done" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
