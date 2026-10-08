import http from "node:http";

import express from "express";
import { afterAll, describe, expect, it } from "vitest";

// Env global HARUS terpasang sebelum module rateLimiter dimuat —
// RATE_LIMIT_DISABLED dibaca sekali saat module load, bukan per-request,
// sehingga uji ini berdiri sendiri di file terpisah dengan top-level import.
process.env.RATE_LIMIT_DISABLED = "1";
process.env.VITEST_RATE_LIMIT_REAL = "1";

const mod = await import("./rateLimiter.js");

async function createServer() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.defineProperty(req, "ip", {
      value: `vitest-global-${Date.now()}`,
      configurable: true,
    });
    next();
  });
  for (const limiter of mod.registerRateLimiter) {
    app.use(limiter);
  }
  app.post("/x", (_req, res) => {
    res.statusCode = 400;
    res.end("{}");
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  return { server, url: `http://127.0.0.1:${address.port}/x` };
}

describe("saklar global RATE_LIMIT_DISABLED", () => {
  afterAll(() => {
    delete process.env.RATE_LIMIT_DISABLED;
    delete process.env.VITEST_RATE_LIMIT_REAL;
  });

  it("mematikan semua limiter (30x register lolos tanpa 429)", async () => {
    const { server, url } = await createServer();
    try {
      for (let i = 0; i < 30; i++) {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: `g${i}@x.id` }),
        });
        expect(res.status).toBe(400);
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
