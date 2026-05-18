# Distributed State Readiness

## Problem Statement

Multiple stateful components are in-memory only, breaking under multi-instance deployment:

| State | Location | Impact at multi-instance |
|---|---|---|
| HTTP rate limiter | `src/middleware/rateLimiter.ts` (default memory store) | Limits per-process, attacker rotates instances |
| Socket rate limiter | `src/utils/socketRateLimiter.ts` Maps | Same |
| Token blacklist | `src/services/auth.service.ts:10-11,232-245` | Logout doesn't propagate; revoked tokens still valid on other instances; restart loses all revocations |
| Online presence | `src/socket/index.ts:31-42` `roomUsers` Map | Each instance sees only its own connections |
| Silence timers | `src/socket/index.ts` `silenceTimers` Map | Timer fires on wrong instance, message not delivered |
| Last intervention time | `src/socket/index.ts` Map | Intervention frequency calc broken |

## Proposed Solution

Move state to Redis-backed stores:

1. `express-rate-limit` with `rate-limit-redis` store
2. Socket rate limiter rewritten with Redis sorted sets
3. Token blacklist via Redis SET with TTL
4. Socket.IO Redis adapter for cross-instance broadcast
5. Presence via Redis SETs keyed by room

## Scope

- Add Redis dependency (already present? verify)
- `src/middleware/rateLimiter.ts` — Redis store
- `src/utils/socketRateLimiter.ts` — Redis-backed implementation
- `src/services/auth.service.ts` blacklist — Redis with TTL
- Socket.IO Redis adapter wiring in `src/socket/index.ts`
- `src/socket/presence.ts` — Redis presence

## Out of Scope

- Multi-region deployment
- Redis Cluster setup
- Data migration from existing in-memory state
