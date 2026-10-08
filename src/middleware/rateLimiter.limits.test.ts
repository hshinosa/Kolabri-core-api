import http from "node:http";

import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Uji spesifikasi batas rate limit (Spesifikasi-Batas-RateLimit-Kolabri §2):
//   - login : gagal saja (skipSuccessfulRequests), lapis IP (20/15m) + email (10/15m)
//   - register: lapis IP (15/jam) + email (3/hari)
//   - saklar per-limiter RL_LOGIN_DISABLED (non-global)

type RateLimiterModule = typeof import("./rateLimiter.js");

const loginHandler = (req: http.IncomingMessage, res: http.ServerResponse) => {
  const body = (req as unknown as { body?: { password?: string } }).body ?? {};
  if (body.password === "benar") {
    res.statusCode = 200;
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.statusCode = 401;
  res.end(JSON.stringify({ error: "invalid" }));
};

async function createServer(
  limiters: express.RequestHandler[],
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
  bucket: string,
) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.defineProperty(req, "ip", { value: bucket, configurable: true });
    next();
  });
  for (const limiter of limiters) {
    app.use(limiter);
  }
  app.post("/x", handler);

  const server = http.createServer(app);
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  return { server, url: `http://127.0.0.1:${address.port}/x` };
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function post(
  url: string,
  payload: Record<string, unknown>,
): Promise<number> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.status;
}

describe("spesifikasi rate limit auth", () => {
  let mod: RateLimiterModule;

  beforeEach(async () => {
    vi.resetModules();
    delete process.env.RL_LOGIN_DISABLED;
    delete process.env.RL_REGISTER_DISABLED;
    process.env.VITEST_RATE_LIMIT_REAL = "1";
    mod = await import("./rateLimiter.js");
  });

  afterEach(() => {
    delete process.env.RL_LOGIN_DISABLED;
    delete process.env.RL_REGISTER_DISABLED;
  });

  it("login: lapis email memblokir percobaan ke-11 utk satu email (max 10/15m), email lain tetap lolos", async () => {
    const bucket = `vitest-email-${Date.now()}`;
    const { server, url } = await createServer(
      mod.loginRateLimiter,
      loginHandler,
      bucket,
    );
    try {
      for (let i = 0; i < 10; i++) {
        expect(await post(url, { email: "a@x.id", password: "salah" })).toBe(
          401,
        );
      }
      expect(await post(url, { email: "a@x.id", password: "salah" })).toBe(429);

      // email berbeda: lapis email terpisah, lapis IP (20) masih cukup
      for (let i = 0; i < 5; i++) {
        expect(await post(url, { email: "b@x.id", password: "salah" })).toBe(
          401,
        );
      }
    } finally {
      await closeServer(server);
    }
  });

  it("login: keberhasilan TIDAK dihitung (skipSuccessfulRequests) di kedua lapis", async () => {
    const bucket = `vitest-success-${Date.now()}`;
    const { server, url } = await createServer(
      mod.loginRateLimiter,
      loginHandler,
      bucket,
    );
    try {
      for (let i = 0; i < 10; i++) {
        expect(await post(url, { email: "c@x.id", password: "benar" })).toBe(
          200,
        );
      }
      // hitungan email masih nol -> 10 kegagalan pertama tetap 401, ke-11 baru 429
      for (let i = 0; i < 10; i++) {
        expect(await post(url, { email: "c@x.id", password: "salah" })).toBe(
          401,
        );
      }
      expect(await post(url, { email: "c@x.id", password: "salah" })).toBe(429);
    } finally {
      await closeServer(server);
    }
  });

  it("register: lapis email memblokir percobaan ke-4 utk satu email (max 3/hari)", async () => {
    const bucket = `vitest-reg-${Date.now()}`;
    const { server, url } = await createServer(
      mod.registerRateLimiter,
      (_req, res) => {
        res.statusCode = 400;
        res.end("{}");
      },
      bucket,
    );
    try {
      for (let i = 0; i < 3; i++) {
        expect(await post(url, { email: "daftar@x.id" })).toBe(400);
      }
      expect(await post(url, { email: "daftar@x.id" })).toBe(429);

      // email lain masih di bawah batas IP (15/jam)
      expect(await post(url, { email: "lain@x.id" })).toBe(400);
    } finally {
      await closeServer(server);
    }
  });

  it("saklar per-limiter RL_LOGIN_DISABLED mematikan login SAJA, register tetap hidup (non-global)", async () => {
    process.env.RL_LOGIN_DISABLED = "1";
    vi.resetModules();
    const mod2 = await import("./rateLimiter.js");

    const bucket = `vitest-flag-${Date.now()}`;
    const loginSrv = await createServer(
      mod2.loginRateLimiter,
      loginHandler,
      bucket,
    );
    const regSrv = await createServer(
      mod2.registerRateLimiter,
      (_req, res) => {
        res.statusCode = 400;
        res.end("{}");
      },
      bucket + "-reg",
    );
    try {
      // login: semua lolos melewati batas (15x gagal tanpa 429)
      for (let i = 0; i < 15; i++) {
        expect(
          await post(loginSrv.url, { email: "d@x.id", password: "salah" }),
        ).toBe(401);
      }
      // register: MASIH membatasi (email ke-4 tetap 429)
      for (let i = 0; i < 3; i++) {
        expect(await post(regSrv.url, { email: "flag@x.id" })).toBe(400);
      }
      expect(await post(regSrv.url, { email: "flag@x.id" })).toBe(429);
    } finally {
      await closeServer(loginSrv.server);
      await closeServer(regSrv.server);
    }
  });

  // Catatan: uji saklar GLOBAL (RATE_LIMIT_DISABLED) ada di
  // rateLimiter.globalflag.test.ts — env-nya harus terpasang SEBELUM module
  // dimuat, jadi tidak bisa diuji di dalam test yang sudah memuat module.
});
