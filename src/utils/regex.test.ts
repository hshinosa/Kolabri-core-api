import { describe, expect, it } from "vitest";

import { escapeRegExp } from "./regex.js";

describe("escapeRegExp", () => {
  it("turns wildcard input into a literal pattern", () => {
    const pattern = new RegExp(escapeRegExp(".*"), "i");
    expect(pattern.test("anything at all")).toBe(false);
    expect(pattern.test("literal .* text")).toBe(true);
  });

  it("escapes character-class input so it can compile", () => {
    // `[a-` is an invalid regex — Mongo answered HTTP 500 on it live.
    expect(() => new RegExp(escapeRegExp("[a-"))).not.toThrow();
    const pattern = new RegExp(escapeRegExp("Big.O"), "i");
    expect(pattern.test("Big-O wins")).toBe(false);
    expect(pattern.test("Big.O wins")).toBe(true);
  });

  it("escapes every regex metacharacter", () => {
    const specials = ".*+?^${}()|[]\\";
    const escaped = escapeRegExp(specials);
    expect(() => new RegExp(escaped)).not.toThrow();
    expect(new RegExp(escaped).test(specials)).toBe(true);
  });
});
