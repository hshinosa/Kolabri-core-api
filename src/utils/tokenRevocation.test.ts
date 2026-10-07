import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetTokenRevocationForTests,
  getRevokedBefore,
  isRefreshUsed,
  isRevokedBefore,
  markRefreshUsed,
  nowSeconds,
  setRevokedBefore,
} from "./tokenRevocation.js";

describe("tokenRevocation (H5/H6)", () => {
  beforeEach(() => {
    _resetTokenRevocationForTests();
  });

  afterEach(() => {
    _resetTokenRevocationForTests();
    vi.useRealTimers();
  });

  it("watermark works inclusively: iat <= watermark is dead", async () => {
    const wm = nowSeconds();
    await setRevokedBefore("u1", wm);

    expect(await isRevokedBefore("u1", wm - 1)).toBe(true);
    expect(await isRevokedBefore("u1", wm)).toBe(true);
    expect(await isRevokedBefore("u1", wm + 1)).toBe(false);
  });

  it("returns false when there is no watermark or no iat", async () => {
    expect(await isRevokedBefore("nobody", nowSeconds())).toBe(false);
    expect(await isRevokedBefore("u-no-iat", undefined)).toBe(false);
  });

  it("watermark is monotonic (never lowered)", async () => {
    await setRevokedBefore("u2", 1000);
    await setRevokedBefore("u2", 500);

    expect(await getRevokedBefore("u2")).toBe(1000);
  });

  it("watermark expires after its TTL", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date("2026-10-07T00:00:00Z"));

    await setRevokedBefore("u3", nowSeconds(), 60);
    expect(await isRevokedBefore("u3", nowSeconds())).toBe(true);

    vi.advanceTimersByTime(61_000);
    expect(await getRevokedBefore("u3")).toBeNull();
    expect(await isRevokedBefore("u3", nowSeconds())).toBe(false);
  });

  it("tracks rotated refresh jtis for reuse detection", async () => {
    expect(await isRefreshUsed("jti-1")).toBe(false);

    await markRefreshUsed("jti-1", 3600);
    expect(await isRefreshUsed("jti-1")).toBe(true);
    expect(await isRefreshUsed("jti-2")).toBe(false);
  });

  it("used-marker expires with its TTL", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date("2026-10-07T00:00:00Z"));

    await markRefreshUsed("jti-ttl", 60);
    expect(await isRefreshUsed("jti-ttl")).toBe(true);

    vi.advanceTimersByTime(61_000);
    expect(await isRefreshUsed("jti-ttl")).toBe(false);
  });

  it("reset helper clears all in-process state", async () => {
    await setRevokedBefore("u4", nowSeconds());
    await markRefreshUsed("jti-4", 60);

    _resetTokenRevocationForTests();

    expect(await getRevokedBefore("u4")).toBeNull();
    expect(await isRefreshUsed("jti-4")).toBe(false);
  });
});
