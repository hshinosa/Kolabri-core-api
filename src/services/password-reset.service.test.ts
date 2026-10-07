import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { update: vi.fn(), findUnique: vi.fn() },
    passwordResetToken: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(() => prismaMock),
}));

import { PasswordResetService } from "./password-reset.service.js";
import {
  _resetTokenRevocationForTests,
  isRevokedBefore,
  nowSeconds,
} from "../utils/tokenRevocation.js";

describe("PasswordResetService.resetPassword (H5/F5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetTokenRevocationForTests();
  });

  afterEach(() => {
    _resetTokenRevocationForTests();
  });

  it("revokes every previously issued token for the user", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue({
      email: "victim@example.com",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    prismaMock.user.update.mockResolvedValue({ id: "user-reset-1" });

    const result = await PasswordResetService.resetPassword(
      "reset-token",
      "NewPassword123!",
    );

    expect(result.message).toBe("Password reset successful");
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "victim@example.com" },
        select: { id: true },
      }),
    );
    expect(prismaMock.passwordResetToken.delete).toHaveBeenCalledWith({
      where: { token: "reset-token" },
    });

    // token lama (iat <= sekarang) mati …
    expect(await isRevokedBefore("user-reset-1", nowSeconds())).toBe(true);
    // … sedangkan login baru setelah detik berikutnya lolos
    expect(await isRevokedBefore("user-reset-1", nowSeconds() + 60)).toBe(
      false,
    );
  });

  it("rejects an invalid/expired reset token without touching sessions", async () => {
    prismaMock.passwordResetToken.findUnique.mockResolvedValue(null);

    await expect(
      PasswordResetService.resetPassword("bad-token", "Whatever123!"),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
