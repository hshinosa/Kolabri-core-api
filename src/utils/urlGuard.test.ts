import { beforeAll, describe, expect, it } from "vitest";
import { lookup } from "node:dns/promises";

import {
  checkBaseUrlSafety,
  getBlockedUrlReason,
  isBlockedIpAddress,
} from "./urlGuard.js";

describe("urlGuard SSRF checks (H2)", () => {
  it("blocks private / loopback / link-local IPv4 ranges", () => {
    for (const ip of [
      "127.0.0.1",
      "127.255.255.254",
      "10.0.0.5",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "0.0.0.0",
      "100.64.0.1",
      "224.0.0.1",
      "255.255.255.255",
    ]) {
      expect(isBlockedIpAddress(ip), ip).toBe(true);
    }
    for (const ip of ["1.1.1.1", "8.8.8.8", "162.159.140.245", "104.16.0.1"]) {
      expect(isBlockedIpAddress(ip), ip).toBe(false);
    }
  });

  it("blocks loopback / ULA / link-local IPv6 ranges", () => {
    for (const ip of [
      "::1",
      "::",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "ff02::1",
      "::ffff:127.0.0.1",
      "::ffff:10.0.0.1",
    ]) {
      expect(isBlockedIpAddress(ip), ip).toBe(true);
    }
    for (const ip of ["2606:4700:7::f3", "2001:4860:4860::8888"]) {
      expect(isBlockedIpAddress(ip), ip).toBe(false);
    }
  });

  describe("getBlockedUrlReason (synchronous, no DNS)", () => {
    it("returns null for public http(s) endpoints", () => {
      expect(getBlockedUrlReason("https://api.openai.com/v1")).toBeNull();
      expect(getBlockedUrlReason("http://1.1.1.1/v1")).toBeNull();
    });

    it("returns a reason for internal targets", () => {
      expect(
        getBlockedUrlReason("http://127.0.0.1:9999/full-chain"),
      ).toBeTruthy();
      expect(getBlockedUrlReason("http://localhost:8080/v1")).toBeTruthy();
      expect(getBlockedUrlReason("http://10.0.0.5/v1")).toBeTruthy();
      expect(
        getBlockedUrlReason("http://169.254.169.254/latest/meta-data"),
      ).toBeTruthy();
      expect(
        getBlockedUrlReason("http://metadata.google.internal/"),
      ).toBeTruthy();
      expect(
        getBlockedUrlReason("http://kolabri-core-api-1:3000/api/health"),
      ).toBeTruthy();
      expect(getBlockedUrlReason("file:///etc/passwd")).toBeTruthy();
      expect(getBlockedUrlReason("not-a-url")).toBeTruthy();
    });
  });

  describe("checkBaseUrlSafety (synchronous + DNS)", () => {
    it("blocks internal literals without touching DNS", async () => {
      expect(await checkBaseUrlSafety("http://127.0.0.1:9999/v1")).toBeTruthy();
      expect(await checkBaseUrlSafety("http://10.0.0.5/v1")).toBeTruthy();
      expect(await checkBaseUrlSafety("http://169.254.169.254/")).toBeTruthy();
      expect(await checkBaseUrlSafety("http://localhost/v1")).toBeTruthy();
    });

    it("rejects hostnames that do not resolve (fail closed)", async () => {
      // `.invalid` is reserved by RFC 2606 — always NXDOMAIN.
      const reason = await checkBaseUrlSafety(
        "http://definitely-not-a-host.invalid/v1",
      );
      expect(reason).toBe("Base URL host does not resolve");
    });

    // DNS-dependent: skipped when the sandbox has no resolver (the
    // literal cases above still prove the guard).
    let dnsReady = false;
    beforeAll(async () => {
      try {
        await lookup("api.openai.com", { all: true });
        dnsReady = true;
      } catch {
        dnsReady = false;
      }
    });

    it("allows a public provider hostname that resolves publicly", async (ctx) => {
      if (!dnsReady) {
        ctx.skip();
      }
      expect(await checkBaseUrlSafety("https://api.openai.com/v1")).toBeNull();
    });

    it("blocks a hostname that resolves to a private address", async (ctx) => {
      if (!dnsReady) {
        ctx.skip();
      }
      // `localtest.me` resolves to 127.0.0.1 (public DNS name -> loopback).
      const reason = await checkBaseUrlSafety("http://localtest.me/v1");
      expect(reason).toContain("resolves to a private");
    });
  });
});
