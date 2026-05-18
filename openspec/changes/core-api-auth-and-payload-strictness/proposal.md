# Auth and Payload Strictness

## Problem Statement

Multiple smaller drift points in auth and validation:

1. **`authRateLimiter` too permissive** — 50 requests / 15 minutes default (`src/middleware/rateLimiter.ts:21-36`). Brute force protection should be stricter, especially separate login vs register windows.

2. **`socketio-payload-validation` spec drift** — spec requires empty content + no attachments to emit `validation_error`. Implementation has `content: z.string().max(10000)` only (`src/validators/socket.validator.ts:10-14`); empty content silently returns at handler level (`src/socket/index.ts:429-431`).

3. **AI Engine auth header inconsistency** — JSON calls use `Authorization: Bearer` (`src/services/aiEngine.service.ts:189-196`); ingest uses `X-API-Key` (`src/services/aiEngine.service.ts:313-316,402-405`). Confirm AI Engine accepts both, or unify.

## Proposed Solution

1. Tighten `authRateLimiter`: 5 login attempts / 15 minutes; separate register limiter
2. Update `sendMessageSchema` to require non-empty content OR attachments
3. Audit AI Engine auth header expectation; unify if mismatch

## Scope

- `src/middleware/rateLimiter.ts` — tighten auth limits
- `src/validators/socket.validator.ts` — refine sendMessage schema
- `src/socket/index.ts:429-431` — emit `validation_error` instead of silent return
- `src/services/aiEngine.service.ts` — audit auth headers
