import bcrypt from "bcrypt";
import { createHash, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import prisma from "../config/database.js";
import { ApiError } from "../middleware/errorHandler.js";
import { RegisterInput, LoginInput } from "../validators/auth.validator.js";
import { JwtPayload } from "../middleware/auth.js";
import { getRedis } from "../config/redis.js";
import {
  getRevokedBefore,
  getRotatedRefresh,
  isRefreshUsed,
  isRevokedBefore,
  markRefreshUsed,
  nowSeconds,
  saveRotatedRefresh,
  setRevokedBefore,
} from "../utils/tokenRevocation.js";

const SALT_ROUNDS = 10;

// Process-local fallback for revoked tokens when Redis is unavailable.
const inMemoryBlacklist = new Set<string>();

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function revokeToken(token: string, ttlSeconds: number): Promise<void> {
  const hash = hashToken(token);
  const redis = getRedis();
  if (redis) {
    const ttl = Math.max(1, Math.floor(ttlSeconds));
    await redis.set(`bl:${hash}`, "1", "EX", ttl);
    return;
  }
  inMemoryBlacklist.add(hash);
  setTimeout(
    () => inMemoryBlacklist.delete(hash),
    Math.max(1000, ttlSeconds * 1000),
  ).unref();
}

async function isRevoked(token: string): Promise<boolean> {
  const hash = hashToken(token);
  const redis = getRedis();
  if (redis) {
    return (await redis.exists(`bl:${hash}`)) === 1;
  }
  return inMemoryBlacklist.has(hash);
}

function getRefreshTokenTtlSeconds(refreshToken: string): number {
  try {
    const decoded = jwt.decode(refreshToken) as { exp?: number } | null;
    if (decoded?.exp) {
      const remaining = decoded.exp - Math.floor(Date.now() / 1000);
      return remaining > 0 ? remaining : 60;
    }
  } catch {
    // fall through
  }
  return 60 * 60 * 24 * 7;
}

export interface RefreshTokenPayload {
  userId: string;
  email: string;
  role: "student" | "lecturer" | "admin";
  type: "refresh";
  /** serial unik per refresh token — basis rotasi & deteksi reuse (H6). */
  jti?: string;
  iat?: number;
}

export class AuthService {
  /**
   * Register a new user
   */
  static async register(data: RegisterInput) {
    // Check if email already exists
    const existingUser = await prisma.user.findFirst({
      where: { email: data.email },
    });

    if (existingUser) {
      throw ApiError.conflict("Email already registered");
    }

    const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashedPassword,
        role: data.role,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    // Generate access and refresh tokens for auto-login after registration
    const accessToken = this.generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const refreshToken = this.generateRefreshToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      refreshToken,
      user,
    };
  }

  /**
   * Login user and return JWT token
   */
  static async login(data: LoginInput) {
    // Find user by email
    const user = await prisma.user.findFirst({
      where: { email: data.email, deletedAt: null },
    });

    if (!user) {
      throw ApiError.unauthorized("Invalid email or password");
    }

    if (!user.isActive) {
      throw ApiError.forbidden("Account is deactivated");
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(data.password, user.password);

    if (!isValidPassword) {
      throw ApiError.unauthorized("Invalid email or password");
    }

    // Token baru harus iat > watermark revocation terakhir (logout/reset),
    // kalau tidak, re-login di detik yang sama dengan logout ikut dianggap
    // mati oleh verifyToken (regresi T1 pasca-fix H5).
    const watermark = await getRevokedBefore(user.id);
    const now = nowSeconds();
    const tokenIat =
      watermark !== null && now <= watermark ? watermark + 1 : now;

    // Generate access and refresh tokens
    const accessToken = this.generateAccessToken(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
      },
      tokenIat,
    );

    const refreshToken = this.generateRefreshToken(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
      },
      tokenIat,
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  /**
   * Get current user profile
   */
  static async getProfile(userId: string) {
    const user = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw ApiError.notFound("User not found");
    }

    return user;
  }

  /**
   * Generate access token (short-lived)
   * Default: 1 day. Can be overridden via JWT_EXPIRES_IN env (e.g. "1d", "24h", "1440m").
   */
  private static generateAccessToken(
    payload: JwtPayload,
    iat?: number,
  ): string {
    const secret = process.env.JWT_SECRET;
    const expiresIn = process.env.JWT_EXPIRES_IN || "1d";

    if (!secret) {
      throw ApiError.internal("JWT secret not configured");
    }

    const signOptions: jwt.SignOptions = { expiresIn } as jwt.SignOptions;
    if (process.env.NODE_ENV === "test" || process.env.VITEST) {
      signOptions.jwtid = `${payload.userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    const body = iat !== undefined ? { ...payload, iat } : payload;
    return jwt.sign(body, secret, signOptions);
  }

  /**
   * Generate refresh token (long-lived: 7 days)
   */
  private static generateRefreshToken(
    payload: Omit<JwtPayload, "type">,
    iat?: number,
  ): string {
    const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

    if (!secret) {
      throw ApiError.internal("JWT secret not configured");
    }

    const refreshPayload: RefreshTokenPayload = {
      ...payload,
      type: "refresh",
      ...(iat !== undefined ? { iat } : {}),
    };

    // jti = serial rotasi: refresh token dicatat di `auth:refresh:<jti>`
    // begitu dipakai refresh; kemunculan ulang = reuse (H6/F4).
    return jwt.sign(refreshPayload, secret, {
      expiresIn: "7d",
      jwtid: `rt-${randomUUID()}`,
    } as jwt.SignOptions);
  }

  /**
   * Refresh access token using refresh token
   */
  static async refreshAccessToken(refreshToken: string) {
    const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

    if (!secret) {
      throw ApiError.internal("JWT secret not configured");
    }

    if (await isRevoked(refreshToken)) {
      // H6 (F4): refresh token yang sudah dirotasi dipakai ulang = kemungkinan
      // dicuri → cabut SELURUH sesi user (watermark revoked_before = sekarang).
      const unverified = jwt.decode(refreshToken) as {
        jti?: string;
        userId?: string;
      } | null;
      if (unverified?.jti && (await isRefreshUsed(unverified.jti))) {
        // F3: permintaan refresh PARALEL (multi-tab / XHR serentak) memakai
        // jti yang sama dalam grace window singkat — bukan pencurian.
        const graceToken = await getRotatedRefresh(unverified.jti);
        if (graceToken) {
          try {
            const g = jwt.verify(
              refreshToken,
              secret,
            ) as RefreshTokenPayload;
            if (g.type === "refresh" && g.userId) {
              const access = this.generateAccessToken({
                userId: g.userId,
                email: g.email,
                role: g.role,
              });
              return { accessToken: access, refreshToken: graceToken };
            }
          } catch {
            // token rusak → jatuh ke jalur reuse asli di bawah
          }
        }
        if (unverified.userId) {
          await setRevokedBefore(unverified.userId);
        }
        throw ApiError.unauthorized("Refresh token reuse detected");
      }
      throw ApiError.unauthorized("Token has been revoked");
    }

    try {
      const decoded = jwt.verify(refreshToken, secret) as RefreshTokenPayload;

      // Verify it's a refresh token
      if (decoded.type !== "refresh") {
        throw ApiError.unauthorized("Invalid token type");
      }

      // H5 (F5): refresh token terbit sebelum logout / reset password = mati
      if (await isRevokedBefore(decoded.userId, decoded.iat)) {
        throw ApiError.unauthorized("Token revoked");
      }

      // Verify user still exists and is active
      const user = await prisma.user.findFirst({
        where: { id: decoded.userId, deletedAt: null },
      });

      if (!user || !user.isActive) {
        throw ApiError.unauthorized("User not found or inactive");
      }

      // H6 (F4): ROTASI — refresh lama dicabut + ditandai jti-nya (deteksi
      // reuse), refresh baru dikembalikan bersama access token baru.
      const ttl = getRefreshTokenTtlSeconds(refreshToken);
      await revokeToken(refreshToken, ttl);
      if (decoded.jti) {
        await markRefreshUsed(decoded.jti, ttl);
      }

      // Generate new access token
      const newAccessToken = this.generateAccessToken({
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
      });

      const newRefreshToken = this.generateRefreshToken({
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
      });

      // F3: simpan hasil rotasi singkat utk permintaan paralel dgn jti lama
      if (decoded.jti) {
        await saveRotatedRefresh(decoded.jti, newRefreshToken);
      }

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      };
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw ApiError.unauthorized("Invalid refresh token");
      } else if (error instanceof jwt.TokenExpiredError) {
        throw ApiError.unauthorized("Refresh token expired");
      }
      throw error;
    }
  }

  /**
   * Logout: cabut refresh token ini + (H5/F2) matikan semua JWT user yang
   * terbit ≤ detik ini lewat watermark `auth:revoked_before:<userId>`,
   * sehingga access JWT lama ikut 401 di verifyToken.
   */
  static async logout(refreshToken: string) {
    const ttl = getRefreshTokenTtlSeconds(refreshToken);
    await revokeToken(refreshToken, ttl);

    const decoded = jwt.decode(refreshToken) as { userId?: string } | null;
    if (decoded && typeof decoded.userId === "string" && decoded.userId) {
      // TTL ≥ sisa umur refresh token, minimal 1 jam (fixplan H5).
      await setRevokedBefore(
        decoded.userId,
        Math.floor(Date.now() / 1000),
        Math.max(ttl, 60 * 60),
      );
    }

    return {
      message: "Logged out successfully",
    };
  }

  static async isTokenBlacklisted(token: string): Promise<boolean> {
    return isRevoked(token);
  }
}
