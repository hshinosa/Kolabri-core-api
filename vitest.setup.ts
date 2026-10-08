import "dotenv/config";

import { vi } from "vitest";

// Tests import app.ts (not server.ts, the only entry that loads dotenv), so
// load .env here the same way server.ts does — JWT_SECRET & friends must be
// present for auth integration tests. dotenv never overrides vars already in
// process.env (e.g. DATABASE_URL passed by CI/container).

const passThrough = (_req: unknown, _res: unknown, next: () => void) => next();

function useRealRateLimiters(): boolean {
  return process.env.VITEST_RATE_LIMIT_REAL === "1";
}

vi.mock("./src/middleware/rateLimiter.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./src/middleware/rateLimiter.js")>();
  type Limiter = (typeof actual)["rateLimiter"];

  const wrapOne = (real: Limiter): Limiter =>
    ((req, res, next) => {
      if (useRealRateLimiters()) {
        return real(req, res, next);
      }
      return passThrough(req, res, next);
    }) as Limiter;

  // Dukung dua bentuk export: middleware tunggal MAUPUN array multi-lapis
  // (mis. loginRateLimiter = [lapis IP, lapis email] — spesifikasi rate limit
  // baru). Semua export module dibungkus otomatis sehingga export baru ikut
  // terkendali oleh VITEST_RATE_LIMIT_REAL.
  const wrapAny = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map((item) => wrapOne(item as Limiter))
      : wrapOne(value as Limiter);

  return Object.fromEntries(
    Object.entries(actual).map(([name, value]) => [name, wrapAny(value)]),
  ) as typeof actual;
});
