import http from "node:http";

import express from "express";
import { describe, expect, it } from "vitest";

// Bukti prasyarat "kunci rate limit per-IP asli" (rancangan §3 Desain 1):
// app.ts memakai app.set('trust proxy', 'loopback') — koneksi dari loopback
// (nginx/app satu host) DIPERCAYA membawa X-Forwarded-For = IP asli client,
// sehingga req.ip (dipakai keyGenerator limiter) = IP asli, bukan IP nginx.
describe("trust proxy loopback", () => {
  async function startApp() {
    const app = express();
    app.set("trust proxy", "loopback"); // sama dengan app.ts
    app.get("/ip", (req, res) => {
      res.json({ ip: req.ip });
    });

    const server = http.createServer(app);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", () => resolve()),
    );
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    return { server, url: `http://127.0.0.1:${address.port}/ip` };
  }

  it("req.ip = IP asli dari X-Forwarded-For (hop loopback dipercaya)", async () => {
    const { server, url } = await startApp();
    try {
      const res = await fetch(url, {
        headers: { "X-Forwarded-For": "203.0.113.10" },
      });
      const body = (await res.json()) as { ip: string };
      expect(body.ip).toBe("203.0.113.10");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("tanpa X-Forwarded-For, req.ip tetap alamat peer (tetap terdefinisi)", async () => {
    const { server, url } = await startApp();
    try {
      const res = await fetch(url);
      const body = (await res.json()) as { ip: string };
      expect(body.ip).toBe("127.0.0.1");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("kasus produksi: dua XFF berbeda = dua bucket rate limit berbeda", async () => {
    const { server, url } = await startApp();
    try {
      const a = (await (
        await fetch(url, { headers: { "X-Forwarded-For": "198.51.100.7" } })
      ).json()) as { ip: string };
      const b = (await (
        await fetch(url, { headers: { "X-Forwarded-For": "198.51.100.8" } })
      ).json()) as { ip: string };
      expect(a.ip).not.toBe(b.ip);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
