import { describe, expect, it } from "vitest";

import {
  chatPinnedQuerySchema,
  chatSearchQuerySchema,
  conversationIdSchema,
} from "./chat.validator.js";

const UUID = "2366e9f1-08e7-4aa9-b707-939e357afedd";
const OTHER_UUID = "9d3e85bd-be51-4fce-8b99-da8eb39282ee";

describe("chat query schemas (NoSQL operator injection guard, H1)", () => {
  it("accepts a plain UUID conversation_id with a normal query", () => {
    const result = chatSearchQuerySchema.safeParse({
      conversation_id: UUID,
      q: "notation",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.conversation_id).toBe(UUID);
      expect(result.data.q).toBe("notation");
      expect(result.data.limit).toBe(20);
    }
  });

  it("rejects the object produced by conversation_id[$in][]=... payloads", () => {
    // qs parses `conversation_id[$in][]=<uuid>&conversation_id[$in][]=<uuid>`
    // into { $in: [...] } — this was the live authorization-bypass payload.
    const result = chatSearchQuerySchema.safeParse({
      conversation_id: { $in: [UUID, OTHER_UUID] },
      q: "notation",
    });

    expect(result.success).toBe(false);
    expect(conversationIdSchema.safeParse({ $in: [UUID] }).success).toBe(false);
  });

  it("rejects array conversation_id (repeated query key)", () => {
    const result = chatSearchQuerySchema.safeParse({
      conversation_id: [UUID, OTHER_UUID],
      q: "notation",
    });

    expect(result.success).toBe(false);
  });

  it("rejects non-UUID strings and operator objects in q", () => {
    expect(
      chatSearchQuerySchema.safeParse({ conversation_id: "cs-1", q: "hello" })
        .success,
    ).toBe(false);
    expect(
      chatSearchQuerySchema.safeParse({ conversation_id: UUID, q: { $gt: "" } })
        .success,
    ).toBe(false);
    expect(
      chatPinnedQuerySchema.safeParse({ conversation_id: { $ne: null } })
        .success,
    ).toBe(false);
  });

  it("enforces the q length bounds (min 2, max 200)", () => {
    expect(
      chatSearchQuerySchema.safeParse({ conversation_id: UUID, q: "a" })
        .success,
    ).toBe(false);
    expect(
      chatSearchQuerySchema.safeParse({ conversation_id: UUID, q: "ok" })
        .success,
    ).toBe(true);
    expect(
      chatSearchQuerySchema.safeParse({
        conversation_id: UUID,
        q: "a".repeat(201),
      }).success,
    ).toBe(false);
    expect(
      chatSearchQuerySchema.safeParse({
        conversation_id: UUID,
        q: "a".repeat(200),
      }).success,
    ).toBe(true);
  });

  it("rejects out-of-range limits instead of passing NaN to Mongo", () => {
    expect(
      chatSearchQuerySchema.safeParse({
        conversation_id: UUID,
        q: "hello",
        limit: "abc",
      }).success,
    ).toBe(false);
    expect(
      chatSearchQuerySchema.safeParse({
        conversation_id: UUID,
        q: "hello",
        limit: "1000",
      }).success,
    ).toBe(false);
    expect(
      chatSearchQuerySchema.safeParse({
        conversation_id: UUID,
        q: "hello",
        limit: "5",
      }).success,
    ).toBe(true);
  });
});
