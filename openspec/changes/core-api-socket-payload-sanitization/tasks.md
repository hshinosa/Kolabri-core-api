## 1. Pre-flight

- [ ] 1.1 Run baseline: `npm test`
- [ ] 1.2 Read `src/socket/index.ts` send_message handler (~L436-487)
- [ ] 1.3 Audit existing sanitize utilities: `src/utils/sanitize*`

## 2. Add sanitization library

- [ ] 2.1 `npm install isomorphic-dompurify zod`
- [ ] 2.2 Verify SSR compatibility (Node.js usage)

## 3. Create sanitizer functions

- [ ] 3.1 `src/utils/sanitize.ts` — add `sanitizeMessageContent(content)` function
- [ ] 3.2 Same — add `sanitizeAttachmentMeta(meta)` function
- [ ] 3.3 Define allowed tags/attrs whitelist
- [ ] 3.4 Add length limits

## 4. Create payload validators

- [ ] 4.1 `src/validators/socket.ts` (new) — zod schemas for socket events
- [ ] 4.2 `sendMessageSchema`, `deleteMessageSchema`, `joinRoomSchema`

## 5. Apply to socket handlers

- [ ] 5.1 `send_message` — validate via schema, sanitize content + attachments
- [ ] 5.2 `delete_message` — validate via schema
- [ ] 5.3 Other socket events with user input

## 6. Tests

- [ ] 6.1 `<script>` payload stripped from persisted + broadcast
- [ ] 6.2 `javascript:` URL rejected
- [ ] 6.3 Oversized content rejected
- [ ] 6.4 Path traversal in filename neutralized
- [ ] 6.5 Legit markdown preserved

## 7. Verify

- [ ] 7.1 `npm test` passing
- [ ] 7.2 Manual: emit malicious payload, inspect DB → confirms sanitization
- [ ] 7.3 `openspec validate core-api-socket-payload-sanitization --strict`
