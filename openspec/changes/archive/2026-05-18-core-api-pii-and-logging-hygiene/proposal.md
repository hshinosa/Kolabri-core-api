# PII and Logging Hygiene

## Problem Statement

Multiple logging issues:

1. **`console.error` instead of logger** — `src/middleware/errorHandler.ts:57-60` uses `console.error` in non-production. Bypasses Winston, log format, structured fields.

2. **PII / sensitive data logged**:
   - User emails: `src/socket/index.ts:231,386,530,581,650`
   - Message content previews: same locations
   - Tokens (potentially) in error logs
   - Production logs may end up in centralized log aggregator with email addresses → privacy concerns in logs

3. **Emoji in logs**: `src/server.ts:28-30`, `src/socket/index.ts:654`, `src/config/mongodb.ts:9-13`. Noisy in production log aggregators (often render incorrectly).

## Proposed Solution

1. Replace all `console.error/log/warn` with `logger.*` in production code
2. Adopt PII safelist: log user IDs, room IDs, NEVER emails or message content
3. Add request ID to all log entries
4. Strip emoji from logs (keep in CLI scripts only)

## Scope

- `src/middleware/errorHandler.ts` — replace console.error
- All `src/socket/index.ts` PII logs — change emails to userIds, drop message previews
- All `src/server.ts`, `src/config/*.ts` startup logs — strip emoji
- Add log redaction helper if needed

## Out of Scope

- Centralized log aggregator setup
- Audit log requirements (separate domain)
