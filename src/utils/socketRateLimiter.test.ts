import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SocketRateLimiter } from "./socketRateLimiter.js";
import { pickRateEvent } from "./socketRateLimiter.js";

// Batas sesuai Spesifikasi-Batas-RateLimit-Kolabri §4:
//   send_message 120/menit · send_message_ai 180/menit (paling longgar)
//   join_room 30/menit · load_more_messages 30/menit
describe("SocketRateLimiter", () => {
  let limiter: SocketRateLimiter;

  beforeEach(() => {
    limiter = new SocketRateLimiter();
    vi.useFakeTimers();
    delete process.env.SOCKET_MSG_RATE_MAX;
    delete process.env.SOCKET_AI_RATE_MAX;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.SOCKET_MSG_RATE_MAX;
    delete process.env.SOCKET_AI_RATE_MAX;
  });

  it("allows 120 send_message events within 60s", () => {
    for (let i = 0; i < 120; i++) {
      expect(limiter.isAllowed("socket-1", "send_message")).toBe(true);
    }
  });

  it("blocks the 121st send_message within 60s", () => {
    for (let i = 0; i < 120; i++) {
      limiter.isAllowed("socket-1", "send_message");
    }
    expect(limiter.isAllowed("socket-1", "send_message")).toBe(false);
  });

  it("allows again after the 60s window resets", () => {
    for (let i = 0; i < 120; i++) {
      limiter.isAllowed("socket-1", "send_message");
    }
    expect(limiter.isAllowed("socket-1", "send_message")).toBe(false);

    vi.advanceTimersByTime(60001);
    expect(limiter.isAllowed("socket-1", "send_message")).toBe(true);
  });

  it("send_message_ai is the most lenient: 180/min, separate from plain messages", () => {
    // Penuhkan kuota pesan biasa — tidak boleh mempengaruhi kuota AI.
    for (let i = 0; i < 120; i++) {
      limiter.isAllowed("socket-1", "send_message");
    }
    expect(limiter.isAllowed("socket-1", "send_message")).toBe(false);

    // Kuota AI masih penuh (180).
    for (let i = 0; i < 180; i++) {
      expect(limiter.isAllowed("socket-1", "send_message_ai")).toBe(true);
    }
    expect(limiter.isAllowed("socket-1", "send_message_ai")).toBe(false);
  });

  it("honours SOCKET_AI_RATE_MAX / SOCKET_MSG_RATE_MAX env overrides", async () => {
    // EVENT_LIMITS dibaca saat module load — re-import setelah set env.
    process.env.SOCKET_AI_RATE_MAX = "5";
    process.env.SOCKET_MSG_RATE_MAX = "7";
    vi.resetModules();
    const { SocketRateLimiter: Custom } = await import("./socketRateLimiter.js");
    const custom = new Custom();
    for (let i = 0; i < 5; i++) {
      expect(custom.isAllowed("s", "send_message_ai")).toBe(true);
    }
    expect(custom.isAllowed("s", "send_message_ai")).toBe(false);
    for (let i = 0; i < 7; i++) {
      expect(custom.isAllowed("s", "send_message")).toBe(true);
    }
    expect(custom.isAllowed("s", "send_message")).toBe(false);
  });

  it("cleanup removes all state for socket", () => {
    for (let i = 0; i < 120; i++) {
      limiter.isAllowed("socket-1", "send_message");
    }
    limiter.cleanup("socket-1");
    expect(limiter.isAllowed("socket-1", "send_message")).toBe(true);
  });

  it("recordViolation returns total violations in 1 minute", () => {
    expect(limiter.recordViolation("socket-1")).toBe(1);
    expect(limiter.recordViolation("socket-1")).toBe(2);
    expect(limiter.recordViolation("socket-1")).toBe(3);
  });

  it("recordViolation reaches disconnect threshold at 3", () => {
    limiter.recordViolation("socket-1");
    limiter.recordViolation("socket-1");
    const count = limiter.recordViolation("socket-1");
    expect(count).toBeGreaterThanOrEqual(limiter.disconnectThreshold);
  });

  it("allows unknown events without rate limiting", () => {
    for (let i = 0; i < 100; i++) {
      expect(limiter.isAllowed("socket-1", "unknown_event")).toBe(true);
    }
  });

  it("blocks load_more_messages after 30 requests within 60s", () => {
    for (let i = 0; i < 30; i++) {
      expect(limiter.isAllowed("socket-1", "load_more_messages")).toBe(true);
    }

    expect(limiter.isAllowed("socket-1", "load_more_messages")).toBe(false);
  });

  it("pickRateEvent: mention @ai memilih limit AI yang lebih longgar", () => {
    expect(pickRateEvent("@ai jelaskan Big-O")).toBe("send_message_ai");
    expect(pickRateEvent("tolong bantu @ai ya")).toBe("send_message_ai");
    expect(pickRateEvent("apa kabar semuanya?")).toBe("send_message");
    expect(pickRateEvent(undefined)).toBe("send_message");
    expect(pickRateEvent("aibon merek cat")).toBe("send_message");
  });
});
