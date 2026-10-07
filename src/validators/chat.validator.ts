import { z } from "zod";

/**
 * Chat REST query schemas — NoSQL operator injection hardening (fix H1).
 *
 * `ChatLog.sessionDiscussionId` is always a PostgreSQL UUID (session
 * discussions table; the socket layer already enforces the same invariant in
 * `socket.validator.ts`). Express' extended query parser turns
 * `conversation_id[$in][]=...` into an object, and `req.query` is never
 * sanitized (`middleware/sanitize.ts` only touches `req.body`) — so the type
 * must be enforced here, before the value reaches a Mongo filter.
 */
export const conversationIdSchema = z
  .string()
  .uuid("conversation_id must be a valid UUID");

export const chatSearchQuerySchema = z.object({
  conversation_id: conversationIdSchema,
  // Raw user input compiled by MongoDB `$regex` — bound the length so a
  // pathological pattern stays cheap to evaluate.
  q: z
    .string()
    .trim()
    .min(2, "q (min 2 chars) required")
    .max(200, "q must be less than 200 characters"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const chatPinnedQuerySchema = z.object({
  conversation_id: conversationIdSchema,
});

export type ChatSearchQuery = z.infer<typeof chatSearchQuerySchema>;
export type ChatPinnedQuery = z.infer<typeof chatPinnedQuerySchema>;
