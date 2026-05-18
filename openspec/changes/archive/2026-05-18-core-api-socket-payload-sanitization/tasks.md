## 1. Pre-flight

- [x] 1.1 Run baseline: `npm test`
- [x] 1.2 Read `src/socket/index.ts` send_message handler
- [x] 1.3 Audit existing sanitize utilities — `src/middleware/sanitize.ts` uses `xss` package; `src/utils/helpers.ts:79 sanitizeString`

## 2. Add sanitization library

- [x] 2.1 Reuse existing `xss` package (already in deps; consistent with HTTP path); skipped isomorphic-dompurify to avoid dep bloat
- [x] 2.2 SSR compatible — `xss` is pure JS, no DOM dependency

## 3. Create sanitizer functions

- [x] 3.1 `src/utils/sanitize.ts` — `sanitizeMessageContent(content)` with allowlist whitelist
- [x] 3.2 Same — `sanitizeAttachment(meta)` and `sanitizeAttachments(meta[])`
- [x] 3.3 Defined allowed tags/attrs whitelist (b, i, em, strong, code, pre, p, br, a[href])
- [x] 3.4 Length limits — content max 10k, attachment name max 200, file size max 50MB

## 4. Create payload validators

- [x] 4.1 `src/validators/socket.validator.ts` already had zod schemas (joinRoom/sendMessage/typing/deleteMessage)
- [x] 4.2 `sendMessageSchema`, `deleteMessageSchema`, `joinRoomSchema` already in place

## 5. Apply to socket handlers

- [x] 5.1 `send_message` — wraps content via `sanitizeMessageContent`, attachments via `sanitizeAttachments`, replyTo.content also sanitized; uses `safeContent` for ChatLog write, broadcast, AI engagement, @AI mention check
- [x] 5.2 `delete_message` — schema validation already in place; no user content to sanitize beyond IDs
- [x] 5.3 Other socket events — typing schema already validates; no rich content elsewhere

## 6. Tests

- [x] 6.1 `<script>` payload stripped — covered in `src/utils/sanitize.test.ts`
- [x] 6.2 `javascript:` URL rejected — covered (anchor href + attachment URL)
- [x] 6.3 Oversized content rejected — `message_too_long` throw test
- [x] 6.4 Path traversal in filename neutralized — covered
- [x] 6.5 Legit markdown preserved — `<b>`/`<em>` retention test (full markdown rendering is frontend concern)

## 7. Verify

- [x] 7.1 `npm test` passing — 16 sanitize tests + 22 socket tests green
- [ ] 7.2 Manual: emit malicious payload, inspect DB → DEFERRED to staging QA
- [x] 7.3 `openspec validate core-api-socket-payload-sanitization --strict`
