import { describe, expect, it } from "vitest";

import {
  createAiProviderSchema,
  updateAiProviderSchema,
} from "./ai-provider.validator.js";

const baseProvider = {
  name: "ssrf-probe",
  displayName: "SSRF Probe",
  apiKey: "test-api-key-1234567890",
};

function parseBaseUrl(baseUrl: unknown) {
  return createAiProviderSchema.safeParse({ ...baseProvider, baseUrl });
}

describe("ai-provider baseUrlSchema SSRF guard (H2)", () => {
  it("rejects loopback, private and link-local IP literals", () => {
    const blocked = [
      "http://127.0.0.1:9999/full-chain", // live SSRF witness payload
      "http://127.0.0.1:13000/api/health",
      "http://10.0.0.5/v1",
      "http://172.16.0.1/v1",
      "http://172.31.255.255/v1",
      "http://192.168.1.1/v1",
      "http://169.254.169.254/latest/meta-data", // cloud metadata
      "http://0.0.0.0:8080/v1",
      "http://[::1]:8080/v1",
      "http://[fc00::1]/v1",
      "http://[fe80::1]/v1",
      "http://[::ffff:127.0.0.1]/v1",
    ];

    for (const baseUrl of blocked) {
      const result = parseBaseUrl(baseUrl);
      expect(result.success, `expected ${baseUrl} to be rejected`).toBe(false);
    }
  });

  it("rejects obfuscated IP spellings that WHATWG normalizes to loopback", () => {
    // Node normalizes these to 127.0.0.1 before the check runs.
    expect(parseBaseUrl("http://2130706433/").success).toBe(false);
    expect(parseBaseUrl("http://0x7f.1/").success).toBe(false);
  });

  it("rejects internal hostnames and non-http(s) schemes", () => {
    const blocked = [
      "http://localhost:8080/v1",
      "http://sub.localhost/v1",
      "http://metadata.google.internal/computeMetadata/v1/",
      "http://api.internal/v1",
      "http://printer.local/v1",
      "http://kolabri-core-api-1:3000/api/health", // docker service name
      "http://redis/v1",
      "file:///etc/passwd",
      "ftp://api.example.com/v1",
      "gopher://api.example.com/v1",
    ];

    for (const baseUrl of blocked) {
      const result = parseBaseUrl(baseUrl);
      expect(result.success, `expected ${baseUrl} to be rejected`).toBe(false);
    }
  });

  it("accepts public provider endpoints and empty values", () => {
    const allowed = [
      "https://api.openai.com/v1",
      "https://api.anthropic.com",
      "https://generativelanguage.googleapis.com/v1beta",
      "https://api.example.com/v1",
    ];

    for (const baseUrl of allowed) {
      const result = parseBaseUrl(baseUrl);
      expect(result.success, `expected ${baseUrl} to be accepted`).toBe(true);
      if (result.success) {
        expect(result.data.baseUrl).toBe(baseUrl);
      }
    }

    // Empty / absent base URL stays valid (provider default endpoint).
    expect(parseBaseUrl("").success).toBe(true);
    expect(parseBaseUrl(null).success).toBe(true);
    expect(parseBaseUrl(undefined).success).toBe(true);
  });

  it("applies the same guard on provider updates", () => {
    const result = updateAiProviderSchema.safeParse({
      displayName: "Probe",
      baseUrl: "http://127.0.0.1:9999/v1",
    });

    expect(result.success).toBe(false);

    const ok = updateAiProviderSchema.safeParse({
      baseUrl: "https://api.openai.com/v1",
    });
    expect(ok.success).toBe(true);
  });
});
