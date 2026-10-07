import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";

const { prismaMock, bcryptMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  },
  bcryptMock: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

vi.mock("../config/database.js", () => ({
  default: prismaMock,
}));

vi.mock("bcrypt", () => ({
  default: bcryptMock,
}));

import { AuthService } from "./auth.service.js";
import {
  _resetTokenRevocationForTests,
  isRevokedBefore,
} from "../utils/tokenRevocation.js";

describe("AuthService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetTokenRevocationForTests();
    process.env.JWT_SECRET = "test-secret";
    process.env.JWT_REFRESH_SECRET = "refresh-secret";
  });

  afterEach(() => {
    _resetTokenRevocationForTests();
    delete process.env.JWT_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
  });

  it("registers a new user and returns access and refresh tokens", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    bcryptMock.hash.mockResolvedValue("hashed-password");
    prismaMock.user.create.mockResolvedValue({
      id: "user-1",
      name: "Alya",
      email: "alya@example.com",
      role: "student",
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
    });

    const result = await AuthService.register({
      name: "Alya",
      email: "alya@example.com",
      password: "secret123",
      role: "student",
    });

    expect(bcryptMock.hash).toHaveBeenCalledWith("secret123", 10);
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ password: "hashed-password" }),
      }),
    );
    expect(result.user.id).toBe("user-1");
    expect(typeof result.accessToken).toBe("string");
    expect(typeof result.refreshToken).toBe("string");
  });

  it("rejects login when the password does not match", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-1",
      name: "Alya",
      email: "alya@example.com",
      password: "stored-hash",
      role: "student",
      isActive: true,
    });
    bcryptMock.compare.mockResolvedValue(false);

    await expect(
      AuthService.login({ email: "alya@example.com", password: "wrong-pass" }),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: "Invalid email or password",
    });
  });

  it("returns a new access token from a valid refresh token", async () => {
    const refreshToken = jwt.sign(
      {
        userId: "user-1",
        email: "alya@example.com",
        role: "student",
        type: "refresh",
      },
      process.env.JWT_REFRESH_SECRET as string,
      { expiresIn: "1h" },
    );
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-1",
      email: "alya@example.com",
      role: "student",
      isActive: true,
    });

    const result = await AuthService.refreshAccessToken(refreshToken);

    expect(result).toEqual({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });
    expect(result.refreshToken).not.toBe(refreshToken);
    const decoded = jwt.verify(
      result.accessToken,
      process.env.JWT_SECRET as string,
    ) as jwt.JwtPayload;
    expect(decoded.userId).toBe("user-1");
    expect(decoded.email).toBe("alya@example.com");
  });

  it("revokes refresh tokens on logout", async () => {
    const refreshToken = "refresh-token-1";

    const result = await AuthService.logout(refreshToken);

    expect(result).toEqual({ message: "Logged out successfully" });
    expect(await AuthService.isTokenBlacklisted(refreshToken)).toBe(true);
  });

  it("rejects revoked refresh tokens before verification", async () => {
    const refreshToken = "refresh-token-2";
    await AuthService.logout(refreshToken);

    await expect(
      AuthService.refreshAccessToken(refreshToken),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: "Token has been revoked",
    });
  });

  // ---- H6 (F3/F4): type refresh + rotasi + deteksi reuse ----

  it("issues refresh tokens with type=refresh and a unique jti", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-1",
      email: "alya@example.com",
      role: "student",
      isActive: true,
      password: "stored-hash",
    });
    bcryptMock.compare.mockResolvedValue(true);

    const login1 = await AuthService.login({
      email: "alya@example.com",
      password: "secret123",
    });
    const login2 = await AuthService.login({
      email: "alya@example.com",
      password: "secret123",
    });

    const d1 = jwt.decode(login1.refreshToken) as jwt.JwtPayload;
    const d2 = jwt.decode(login2.refreshToken) as jwt.JwtPayload;
    expect(d1.type).toBe("refresh");
    expect(typeof d1.jti).toBe("string");
    expect(d1.jti).not.toBe(d2.jti);

    // access token TIDAK membawa type=refresh
    const access = jwt.decode(login1.accessToken) as jwt.JwtPayload;
    expect(access.type).toBeUndefined();
  });

  it("rotates refresh tokens: chain refresh works, old token reuse kills session", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-1",
      email: "alya@example.com",
      role: "student",
      isActive: true,
      password: "stored-hash",
    });
    bcryptMock.compare.mockResolvedValue(true);

    const login = await AuthService.login({
      email: "alya@example.com",
      password: "secret123",
    });
    const originalRefresh = login.refreshToken;

    // refresh #1 → refresh token BARU dikembalikan (rotasi)
    const first = await AuthService.refreshAccessToken(originalRefresh);
    expect(first.refreshToken).toBeDefined();
    expect(first.refreshToken).not.toBe(originalRefresh);
    expect(first.accessToken).not.toBe(login.accessToken);

    // refresh #2 dengan token BARU → tetap lolos
    const second = await AuthService.refreshAccessToken(first.refreshToken);
    expect(second.refreshToken).toBeDefined();
    expect(second.refreshToken).not.toBe(first.refreshToken);

    // token LAMA dipakai ulang → reuse detected (bukan cuma "revoked")
    await expect(
      AuthService.refreshAccessToken(originalRefresh),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: "Refresh token reuse detected",
    });

    // seluruh sesi user dicabut: token terbaru pun ikut mati
    await expect(
      AuthService.refreshAccessToken(second.refreshToken),
    ).rejects.toMatchObject({
      statusCode: 401,
      message: "Token revoked",
    });
    expect(await isRevokedBefore("user-1", Math.floor(Date.now() / 1000))).toBe(
      true,
    );
  });

  // ---- H5 (F2): logout mencabut access JWT lama ----

  it("logout revokes every token issued up to the logout moment", async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: "user-1",
      email: "alya@example.com",
      role: "student",
      isActive: true,
      password: "stored-hash",
    });
    bcryptMock.compare.mockResolvedValue(true);

    const login = await AuthService.login({
      email: "alya@example.com",
      password: "secret123",
    });
    const access = jwt.decode(login.accessToken) as jwt.JwtPayload;
    expect(access.iat).toBeDefined();

    // sebelum logout: token sah
    expect(await isRevokedBefore("user-1", access.iat)).toBe(false);

    await AuthService.logout(login.refreshToken);

    // sesudah logout: access JWT lama (F2) & refresh lama ikut mati
    expect(await isRevokedBefore("user-1", access.iat)).toBe(true);
    expect(await AuthService.isTokenBlacklisted(login.refreshToken)).toBe(true);

    // login ULANG (detik berikutnya) → token baru lolos lagi
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const relogin = await AuthService.login({
      email: "alya@example.com",
      password: "secret123",
    });
    const newAccess = jwt.decode(relogin.accessToken) as jwt.JwtPayload;
    expect(await isRevokedBefore("user-1", newAccess.iat)).toBe(false);
  });
});
