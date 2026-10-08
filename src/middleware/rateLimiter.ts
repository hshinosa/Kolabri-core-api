import type { Request } from "express";
import rateLimit, { type Options } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { AuthenticatedRequest } from "./auth.js";
import { getRedis } from "../config/redis.js";

function buildStore(prefix: string): Options["store"] | undefined {
  const redis = getRedis();
  if (!redis) return undefined;
  return new RedisStore({
    prefix: `rl:${prefix}:`,
    // ioredis's `call(...)` accepts variadic args; cast at the boundary because
    // RedisStore expects an opaque RedisReply.
    sendCommand: (command: string, ...args: string[]) =>
      redis.call(command, ...args) as unknown as Promise<unknown>,
  } as unknown as ConstructorParameters<
    typeof RedisStore
  >[0]) as unknown as Options["store"];
}

// ---------------------------------------------------------------------------
// Saklar rate limit (rancangan Spesifikasi-Batas-RateLimit-Kolabri):
//   - RATE_LIMIT_DISABLED=1 : saklar DARURAT global (semua limiter mati).
//   - RL_<NAMA>_DISABLED=1  : matikan SATU limiter tanpa menyentuh yang lain
//     (contoh: RL_REGISTER_DISABLED=1). Semua HIDUP by default.
// ---------------------------------------------------------------------------
const RATE_LIMIT_DISABLED = process.env.RATE_LIMIT_DISABLED === "1";

function envFlag(name: string): boolean {
  return process.env[`RL_${name}_DISABLED`] === "1";
}

function disabled(name: string): boolean {
  return RATE_LIMIT_DISABLED || envFlag(name);
}

function envMax(name: string, fallback: number): number {
  return Number(process.env[name]) || fallback;
}

const ipOf = (req: Request): string => req.ip || "anonymous";

const userOrIp = (req: Request): string => {
  const authReq = req as unknown as AuthenticatedRequest;
  return authReq.user?.userId || req.ip || "anonymous";
};

const emailOf = (req: Request): string => {
  const body = (req.body ?? {}) as { email?: unknown };
  return typeof body.email === "string" && body.email
    ? body.email.toLowerCase()
    : "";
};

const standard = { standardHeaders: true, legacyHeaders: false } as const;

const authMessage = {
  error: {
    code: "AUTH_RATE_LIMIT_EXCEEDED",
    message: "Too many requests, please try again later",
  },
};

// ---------------------------------------------------------------------------
// Global — jaring pengaman (default 600/15m per userId|IP asli).
// ---------------------------------------------------------------------------
export const rateLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: () => envMax("RATE_LIMIT_MAX_REQUESTS", 600),
  store: buildStore("general"),
  skip: () => disabled("GLOBAL"),
  keyGenerator: userOrIp,
  message: {
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests, please try again later",
    },
  },
  ...standard,
});

// ---------------------------------------------------------------------------
// LOGIN — hanya KEGAGALAN yang dihitung, 2 lapis:
//   1. IP asli     : LOGIN_RATE_IP_MAX    / 15m (default 20)
//   2. email target: LOGIN_RATE_EMAIL_MAX / 15m (default 10)
// ---------------------------------------------------------------------------
const loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: () => envMax("LOGIN_RATE_IP_MAX", 20),
  store: buildStore("login-ip"),
  skip: () => disabled("LOGIN"),
  skipSuccessfulRequests: true,
  keyGenerator: (req) => "ip:" + ipOf(req),
  message: authMessage,
  ...standard,
});

const loginEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: () => envMax("LOGIN_RATE_EMAIL_MAX", 10),
  store: buildStore("login-email"),
  skip: (req) => disabled("LOGIN") || !emailOf(req),
  skipSuccessfulRequests: true,
  keyGenerator: (req) => "email:" + emailOf(req),
  message: authMessage,
  ...standard,
});

export const loginRateLimiter = [loginIpLimiter, loginEmailLimiter];

// ---------------------------------------------------------------------------
// REGISTER — IP asli: REGISTER_RATE_IP_MAX / jam (default 15, lega utk NAT);
//            email  : REGISTER_RATE_EMAIL_MAX / hari (default 3).
// ---------------------------------------------------------------------------
const registerIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: () => envMax("REGISTER_RATE_IP_MAX", 15),
  store: buildStore("register-ip"),
  skip: () => disabled("REGISTER"),
  keyGenerator: (req) => "ip:" + ipOf(req),
  message: authMessage,
  ...standard,
});

const registerEmailLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: () => envMax("REGISTER_RATE_EMAIL_MAX", 3),
  store: buildStore("register-email"),
  skip: (req) => disabled("REGISTER") || !emailOf(req),
  keyGenerator: (req) => "email:" + emailOf(req),
  message: authMessage,
  ...standard,
});

export const registerRateLimiter = [registerIpLimiter, registerEmailLimiter];

// ---------------------------------------------------------------------------
// FORGOT / PASSWORD RESET — email 3/jam; IP asli 10/jam.
// ---------------------------------------------------------------------------
const forgotIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: () => envMax("FORGOT_RATE_IP_MAX", 10),
  store: buildStore("forgot-ip"),
  skip: () => disabled("FORGOT"),
  keyGenerator: (req) => "ip:" + ipOf(req),
  message: authMessage,
  ...standard,
});

const forgotEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: () => envMax("FORGOT_RATE_EMAIL_MAX", 3),
  store: buildStore("forgot-email"),
  skip: (req) => disabled("FORGOT") || !emailOf(req),
  keyGenerator: (req) => "email:" + emailOf(req),
  message: authMessage,
  ...standard,
});

export const passwordResetLimiter = [forgotIpLimiter, forgotEmailLimiter];

// ---------------------------------------------------------------------------
// REFRESH — userId 30/15m; anonim (tanpa user) IP asli 100/15m.
// ---------------------------------------------------------------------------
const refreshUserLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: () => envMax("REFRESH_RATE_USER_MAX", 30),
  store: buildStore("refresh-user"),
  skip: (req) =>
    disabled("REFRESH") ||
    !(req as unknown as AuthenticatedRequest).user?.userId,
  keyGenerator: (req) => "user:" + userOrIp(req),
  message: authMessage,
  ...standard,
});

const refreshIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: () => envMax("REFRESH_RATE_IP_MAX", 100),
  store: buildStore("refresh-ip"),
  skip: () => disabled("REFRESH"),
  keyGenerator: (req) => "ip:" + ipOf(req),
  message: authMessage,
  ...standard,
});

export const refreshRateLimiter = [refreshUserLimiter, refreshIpLimiter];

// ---------------------------------------------------------------------------
// LOGOUT 10/menit; RESEND VERIFIKASI 3/jam; VERIFY KODE 10/jam.
// ---------------------------------------------------------------------------
export const logoutRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: () => envMax("LOGOUT_RATE_MAX", 10),
  store: buildStore("logout"),
  skip: () => disabled("LOGOUT"),
  keyGenerator: userOrIp,
  message: authMessage,
  ...standard,
});

export const resendVerifyRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: () => envMax("RESEND_RATE_MAX", 3),
  store: buildStore("resend"),
  skip: () => disabled("RESEND"),
  keyGenerator: userOrIp,
  message: authMessage,
  ...standard,
});

export const verifyCodeRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: () => envMax("VERIFY_RATE_MAX", 10),
  store: buildStore("verify"),
  skip: () => disabled("VERIFY"),
  keyGenerator: (req) => emailOf(req) || ipOf(req),
  message: authMessage,
  ...standard,
});

// ---------------------------------------------------------------------------
// Legacy limiter (kompatibilitas) — mengikuti flag GLOBAL.
// ---------------------------------------------------------------------------
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: () => envMax("AUTH_RATE_LIMIT_MAX", 50),
  store: buildStore("auth"),
  skip: () => disabled("GLOBAL"),
  keyGenerator: userOrIp,
  message: authMessage,
  ...standard,
});

// ---------------------------------------------------------------------------
// PREVIEW AI dosen 20/jam & EXPORT COURSE 5/jam — per-user (endpoint berat,
// dosen lain tidak boleh ikut terblokir).
// ---------------------------------------------------------------------------
export const previewRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: () => envMax("PREVIEW_RATE_LIMIT_MAX", 20),
  store: buildStore("preview"),
  skip: () => disabled("PREVIEW"),
  keyGenerator: userOrIp,
  message: authMessage,
  ...standard,
});

export const exportRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: () => envMax("EXPORT_RATE_MAX", 5),
  store: buildStore("export"),
  skip: () => disabled("EXPORT"),
  keyGenerator: userOrIp,
  message: authMessage,
  ...standard,
});

// ---------------------------------------------------------------------------
// Sisanya (di luar jalur auth utama) — mengikuti flag GLOBAL.
// ---------------------------------------------------------------------------
export const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  store: buildStore("ai"),
  skip: () => disabled("GLOBAL"),
  keyGenerator: userOrIp,
  message: {
    error: {
      code: "AI_RATE_LIMIT_EXCEEDED",
      message: "Too many AI requests, please slow down",
    },
  },
  ...standard,
});

export const testConnectionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  store: buildStore("test-connection"),
  skip: () => disabled("GLOBAL"),
  keyGenerator: userOrIp,
  message: {
    error: {
      code: "TEST_CONNECTION_RATE_LIMIT_EXCEEDED",
      message: "Too many test connection attempts, please try again later",
    },
  },
  ...standard,
});
