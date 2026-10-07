import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_SECRET = process.env.JWT_SECRET || "user-routes-test-secret";

const { userServiceMock, prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findFirst: vi.fn(), findUnique: vi.fn() },
  },
  userServiceMock: {
    getUsers: vi.fn(),
    getUserById: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
    hardDeleteUser: vi.fn(),
    resetPassword: vi.fn(),
    bulkDeleteUsers: vi.fn(),
    bulkUpdateUserRole: vi.fn(),
    toggleUserStatus: vi.fn(),
    bulkImportUsersFromCsv: vi.fn(),
  },
}));

vi.mock("../config/database.js", () => ({
  default: prismaMock,
  prisma: prismaMock,
}));

vi.mock("../services/user.service.js", () => ({
  UserService: userServiceMock,
}));

vi.mock("../services/auth.service.js", () => ({
  AuthService: {},
}));

vi.mock("../services/account-deletion.service.js", () => ({
  AccountDeletionService: {},
}));

import userRoutes from "./user.routes.js";
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
  app.use("/api/users", userRoutes);
  app.use(errorHandler);
  return app;
}

const STUDENT_ID = "6daedd03-719c-4e9f-8037-8bbe579ddc84";
const TARGET_ID = "9b9e224b-a29e-45cb-8730-e9e47f928124";

describe("user routes (privilege escalation fix C1/F-01)", () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    // verifyToken memvalidasi keaktifan user lewat prisma saat cache kosong.
    prismaMock.user.findFirst.mockImplementation(
      async (args: { where?: { id?: string } }) => ({
        id: args?.where?.id ?? "user",
      }),
    );
    userServiceMock.updateUser.mockResolvedValue({
      id: STUDENT_ID,
      name: "Rizki",
      role: "student",
    });
    app = makeApp();
  });

  it("rejects PUT /api/users/me that only carries role=admin", async () => {
    const res = await request(app)
      .put("/api/users/me")
      .set("Authorization", `Bearer ${tokenFor("student", STUDENT_ID)}`)
      .send({ role: "admin" });

    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe("BAD_REQUEST");
    expect(userServiceMock.updateUser).not.toHaveBeenCalled();
  });

  it("strips role/isActive from PUT /api/users/me before the service sees them", async () => {
    const res = await request(app)
      .put("/api/users/me")
      .set("Authorization", `Bearer ${tokenFor("student", STUDENT_ID)}`)
      .send({ name: "Rizki Pratama", role: "admin", isActive: false });

    expect(res.status).toBe(200);
    expect(userServiceMock.updateUser).toHaveBeenCalledTimes(1);
    const [id, data, actorId, actorRole] =
      userServiceMock.updateUser.mock.calls[0];
    expect(id).toBe(STUDENT_ID);
    expect(data).toEqual({ name: "Rizki Pratama" });
    expect(data).not.toHaveProperty("role");
    expect(data).not.toHaveProperty("isActive");
    expect(actorId).toBe(STUDENT_ID);
    expect(actorRole).toBe("student");
  });

  it("still updates name/email through PUT /api/users/me", async () => {
    const res = await request(app)
      .put("/api/users/me")
      .set("Authorization", `Bearer ${tokenFor("lecturer", STUDENT_ID)}`)
      .send({ name: "Budi Santoso", email: "budi@univ.ac.id" });

    expect(res.status).toBe(200);
    expect(userServiceMock.updateUser).toHaveBeenCalledWith(
      STUDENT_ID,
      { name: "Budi Santoso", email: "budi@univ.ac.id" },
      STUDENT_ID,
      "lecturer",
    );
  });

  it("keeps PUT /api/users/:id (role management) behind checkRole(admin)", async () => {
    const res = await request(app)
      .put(`/api/users/${TARGET_ID}`)
      .set("Authorization", `Bearer ${tokenFor("student", STUDENT_ID)}`)
      .send({ role: "admin" });

    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe("FORBIDDEN");
    expect(userServiceMock.updateUser).not.toHaveBeenCalled();
  });

  it("lets an admin change a role via PUT /api/users/:id", async () => {
    const res = await request(app)
      .put(`/api/users/${TARGET_ID}`)
      .set("Authorization", `Bearer ${tokenFor("admin", "admin-1")}`)
      .send({ role: "lecturer" });

    expect(res.status).toBe(200);
    expect(userServiceMock.updateUser).toHaveBeenCalledWith(
      TARGET_ID,
      { role: "lecturer" },
      "admin-1",
      "admin",
    );
  });
});
