import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { ApiError } from "./errorHandler.js";
import prisma from "../config/database.js";
import { userActiveCache } from "../utils/userActiveCache.js";
import { isRevokedBefore } from "../utils/tokenRevocation.js";

export interface JwtPayload {
  userId: string;
  email: string;
  role: "student" | "lecturer" | "admin";
  /** H6: access token tidak punya klaim ini; refresh token membawa 'refresh'. */
  type?: "refresh" | "access";
  /** iat bawaan jsonwebtoken (unix detik) — dipakai cek revoked_before (H5). */
  iat?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
  sessionDiscussionId?: string;
  groupId?: string;
}

export async function verifyToken(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw ApiError.unauthorized("No token provided");
    }

    const token = authHeader.split(" ")[1];
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      throw ApiError.internal("JWT secret not configured");
    }

    const decoded = jwt.verify(token, secret) as JwtPayload;

    // H3 (F2): signature sah saja tidak cukup — token berbagi analytics
    // (payload {courseId, section, ...}) juga sah-signature tetapi bukan
    // kredensial user. Wajib ada klaim identitas yang valid, kalau tidak
    // prisma akan mengabaikan id:undefined dan req.user tanpa userId.
    if (typeof decoded.userId !== "string" || decoded.userId.trim() === "") {
      throw ApiError.unauthorized("Invalid token");
    }
    if (typeof decoded.role !== "string" || decoded.role.trim() === "") {
      throw ApiError.unauthorized("Invalid token");
    }

    // H6 (F3): refresh token tidak boleh dipakai sbg access token —
    // tolak walau signature valid (secret sama / bocor-serial).
    if (decoded.type === "refresh") {
      throw ApiError.unauthorized("Invalid token type");
    }

    // H5 (F2/F5): token yang terbit sebelum logout / reset password
    // (iat <= watermark revoked_before) sudah mati.
    if (await isRevokedBefore(decoded.userId, decoded.iat)) {
      throw ApiError.unauthorized("Token revoked");
    }

    // P2-02 (pass2 HIGH): role yang berlaku adalah kolom users.role TERBARU,
    // bukan klaim pada token lama — demote (mis. bulk-role-change) langsung
    // berlaku maksimal 30 dtk kemudian, tanpa menunggu token kedaluwarsa.
    let effectiveRole: NonNullable<JwtPayload["role"]> = decoded.role;
    const cached = userActiveCache.get(decoded.userId);
    if (cached === null) {
      const user = await prisma.user.findFirst({
        where: { id: decoded.userId, deletedAt: null, isActive: true },
        select: { id: true, role: true },
      });
      if (!user) {
        userActiveCache.set(decoded.userId, false);
        return next(ApiError.unauthorized("User not found"));
      }
      // kolom users.role (enum string) — klaim JWT memakai union yang sama.
      // Fallback ke klaim token bila kolom kosong (ketahanan, bukan bypass:
      // role hasil DB selalu menang saat ada).
      const dbRole = (user.role ?? decoded.role) as NonNullable<
        JwtPayload["role"]
      >;
      userActiveCache.set(decoded.userId, true, user.role ?? null);
      effectiveRole = dbRole;
    } else if (!cached.isActive) {
      return next(ApiError.unauthorized("User not found"));
    } else if (cached.role) {
      effectiveRole = cached.role as NonNullable<JwtPayload["role"]>;
    }

    req.user = { ...decoded, role: effectiveRole };
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      next(ApiError.unauthorized("Token expired"));
    } else if (error instanceof jwt.JsonWebTokenError) {
      next(ApiError.unauthorized("Invalid token"));
    } else {
      next(error);
    }
  }
}

export function checkRole(
  allowedRoles: Array<"student" | "lecturer" | "admin">,
) {
  return (
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction,
  ): void => {
    if (!req.user) {
      return next(ApiError.unauthorized("Not authenticated"));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        ApiError.forbidden(
          `Access denied. Required role: ${allowedRoles.join(" or ")}`,
        ),
      );
    }

    next();
  };
}

export const requireLecturer = checkRole(["lecturer", "admin"]);
export const requireStudent = checkRole(["student"]);
export const requireAuth = verifyToken;
