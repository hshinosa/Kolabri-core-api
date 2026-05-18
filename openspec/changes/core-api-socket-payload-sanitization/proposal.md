# Socket.IO Payload Sanitization

## Problem Statement

HTTP routes are protected by `sanitizeBody` middleware (`src/app.ts:71`). Socket.IO messages and attachments are NOT sanitized before being persisted to MongoDB and broadcast to other clients (`src/socket/index.ts:469-515`).

If the frontend ever renders chat content via markdown, `dangerouslySetInnerHTML`, or any HTML pipeline:
- Stored XSS through chat messages
- Persistent attack vector via DB-stored payloads
- Replayed on every page load

## Proposed Solution

Apply equivalent sanitization for Socket.IO payloads before:
1. Persisting messages/attachments to MongoDB or Postgres
2. Broadcasting to room members

Specifically:
- HTML/JS escape: strip or escape `<script>`, `<iframe>`, event handlers
- URL validation: reject `javascript:`, `data:`, prefer `http://` / `https://` for embedded links
- Length limits: enforce max content length, max attachment size
- Whitelist: allow only safe markdown if markdown is the rendering target

## Scope

- `src/socket/index.ts` — wrap message/attachment writes with sanitizer
- `src/utils/sanitize.ts` — extend HTTP sanitizer for socket payloads if needed
- Validators: `src/validators/socket.ts` for socket message schemas
- Tests for XSS payload rejection

## Out of Scope

- Frontend rendering pipeline (separate concern)
- File upload security (covered elsewhere)
