import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, bcryptMock, auditLogServiceMock, broadcastAdminEventMock } =
  vi.hoisted(() => ({
    prismaMock: {
      user: {
        findMany: vi.fn(),
        count: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
        updateMany: vi.fn(),
        createMany: vi.fn(),
      },
    },
    bcryptMock: { hash: vi.fn() },
    auditLogServiceMock: { logAction: vi.fn() },
    broadcastAdminEventMock: vi.fn(),
  }));

vi.mock("../config/database.js", () => ({
  default: prismaMock,
}));

vi.mock("bcrypt", () => ({
  default: bcryptMock,
}));

vi.mock("./audit-log.service.js", () => ({
  AuditLogService: auditLogServiceMock,
}));

vi.mock("../websocket/server.js", () => ({
  broadcastAdminEvent: broadcastAdminEventMock,
}));

import { UserService } from "./user.service.js";

describe("UserService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bcryptMock.hash.mockResolvedValue("hashed-password");
    auditLogServiceMock.logAction.mockResolvedValue({
      user: { id: "admin-1", name: "Admin" },
    });
  });

  it("returns paginated users with filters", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: "user-1", email: "alya@example.com" },
    ]);
    prismaMock.user.count.mockResolvedValue(1);

    const result = await UserService.getUsers({
      page: 1,
      limit: 10,
      role: "student",
      search: "alya",
      sortBy: "createdAt",
      sortOrder: "desc",
    });

    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ role: "student" }),
        skip: 0,
        take: 10,
      }),
    );
    expect(result).toEqual({
      data: [{ id: "user-1", email: "alya@example.com" }],
      meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });
  });

  it("creates a user with hashed password, audit log, and broadcasts", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({
      id: "user-1",
      name: "Alya",
      email: "alya@example.com",
      role: "student",
    });

    const result = await UserService.createUser(
      {
        name: "Alya",
        email: "alya@example.com",
        password: "secret123",
        role: "student",
      },
      "admin-1",
    );

    expect(bcryptMock.hash).toHaveBeenCalledWith("secret123", 10);
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ password: "hashed-password" }),
      }),
    );
    expect(auditLogServiceMock.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CREATE",
        entityType: "User",
        entityId: "user-1",
        userId: "admin-1",
      }),
    );
    expect(broadcastAdminEventMock).toHaveBeenCalledWith("users:created", {
      user: {
        id: "user-1",
        name: "Alya",
        email: "alya@example.com",
        role: "student",
      },
      actor: { id: "admin-1", name: "Admin" },
    });
    expect(result).toEqual({
      id: "user-1",
      name: "Alya",
      email: "alya@example.com",
      role: "student",
    });
  });

  it("detects role changes during user updates for audit logging", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "alya@example.com",
      role: "student",
      isActive: true,
    });
    prismaMock.user.update.mockResolvedValue({
      id: "user-1",
      email: "alya@example.com",
      role: "lecturer",
      isActive: true,
    });

    const result = await UserService.updateUser(
      "user-1",
      { role: "lecturer" },
      "admin-1",
      "admin",
    );

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { role: "lecturer" } }),
    );
    expect(auditLogServiceMock.logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ROLE_CHANGE", entityId: "user-1" }),
    );
    expect(result).toEqual({
      id: "user-1",
      email: "alya@example.com",
      role: "lecturer",
      isActive: true,
    });
  });

  it("strips role/isActive when the actor is not an admin (defence in depth for PUT /users/me)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "alya@example.com",
      role: "student",
      isActive: true,
    });
    prismaMock.user.update.mockResolvedValue({
      id: "user-1",
      email: "alya@example.com",
      role: "student",
      isActive: true,
    });

    await UserService.updateUser(
      "user-1",
      { name: "Alya Pratama", role: "admin", isActive: false },
      "user-1",
      "student",
    );

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: "Alya Pratama" } }),
    );
    expect(prismaMock.user.update.mock.calls[0][0].data).not.toHaveProperty(
      "role",
    );
    expect(prismaMock.user.update.mock.calls[0][0].data).not.toHaveProperty(
      "isActive",
    );
    expect(auditLogServiceMock.logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "UPDATE" }),
    );
  });

  it("treats a caller without a role as non-admin (fail-closed default)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "alya@example.com",
      role: "student",
      isActive: true,
    });
    prismaMock.user.update.mockResolvedValue({
      id: "user-1",
      email: "alya@example.com",
      role: "student",
      isActive: true,
    });

    await UserService.updateUser("user-1", { role: "admin" }, "user-1");

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: {} }),
    );
    expect(auditLogServiceMock.logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "UPDATE" }),
    );
  });

  it("keeps isActive writable for the admin-gated toggle-status route", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-1",
      isActive: true,
    });
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "alya@example.com",
      role: "student",
      isActive: true,
    });
    prismaMock.user.update.mockResolvedValue({
      id: "user-1",
      email: "alya@example.com",
      role: "student",
      isActive: false,
    });

    await UserService.toggleUserStatus("user-1", "admin-1");

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } }),
    );
    expect(auditLogServiceMock.logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "DEACTIVATE" }),
    );
  });

  it("rejects deleting the currently logged-in user", async () => {
    await expect(
      UserService.deleteUser("user-1", "user-1", "admin-1"),
    ).rejects.toMatchObject({
      statusCode: 403,
      message: "Cannot delete your own account",
    });
  });

  it("imports users from csv and assigns the default temporary password", async () => {
    const csv = Buffer.from(
      "name,email,role\nAlya,alya@example.com,student\nBima,bima@example.com,lecturer\n",
    );
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.user.createMany.mockResolvedValue({ count: 2 });

    const result = await UserService.bulkImportUsersFromCsv(csv);

    expect(bcryptMock.hash).toHaveBeenCalledWith("TempPass123!", 10);
    expect(prismaMock.user.createMany).toHaveBeenCalledWith({
      data: [
        {
          name: "Alya",
          email: "alya@example.com",
          role: "student",
          password: "hashed-password",
        },
        {
          name: "Bima",
          email: "bima@example.com",
          role: "lecturer",
          password: "hashed-password",
        },
      ],
    });
    expect(result).toEqual({
      createdCount: 2,
      temporaryPassword: "TempPass123!",
    });
  });
});
