# Redis Distributed State (Phases 2-4)

## Problem Statement

Phase 1 of `core-api-distributed-state-readiness` shipped the foundation: a fail-open `getRedis()` client wired into bootstrap and graceful shutdown. Three downstream consumers still operate on per-process state, which becomes inconsistent under multi-instance deployment:

| State | Location | Failure mode |
|---|---|---|
| HTTP rate limiter | `src/middleware/rateLimiter.ts` | `express-rate-limit` default memory store; per-process counters; attacker rotates instances to evade limit |
| Token blacklist | `src/services/auth.service.ts:11` `tokenBlacklist = new Set<string>()` | Logout on instance A; revoked token still accepted by instance B; restart loses every revocation |
| Socket.IO broadcast | `src/socket/index.ts:179 new Server(...)` no adapter | `io.to(room).emit(...)` on instance A is invisible to clients connected to instance B |

## Proposed Solution

For each consumer, depend on `getRedis()` from `src/config/redis.ts` and gate the Redis-backed code path behind `if (redis)`. When `REDIS_URL` is unset, the existing in-memory implementation continues to run (single-instance correct).

1. **HTTP rate limiter** — install `rate-limit-redis`; when `redis !== null`, build the limiter with `RedisStore({ sendCommand: (...args) => redis.call(...args) })`; otherwise keep current memory store
2. **Token blacklist** — replace the `Set<string>` with two functions `revokeToken(token, ttlSeconds)` and `isRevoked(token)` that proxy to Redis SET with EX when available, falling back to the in-memory set otherwise
3. **Socket.IO Redis adapter** — install `@socket.io/redis-adapter`; when `redis !== null`, call `io.adapter(createAdapter(redis.duplicate(), redis.duplicate()))`

All three are opt-in: tests stay deterministic with `REDIS_URL=` unset.

## Scope

- `package.json` — add `rate-limit-redis`, `@socket.io/redis-adapter`
- `src/middleware/rateLimiter.ts` — build limiters via factory that checks `getRedis()`
- `src/services/auth.service.ts` — extract blacklist behind module-private `revokeToken`/`isRevoked` helpers; route through Redis when available
- `src/socket/index.ts:179` — call `io.adapter(...)` when Redis is initialized
- Tests for each: behavior preserved when Redis is absent; Redis path covered with mocked client

## Out of Scope

- Socket rate limiter (`src/utils/socketRateLimiter.ts`) — Redis migration deferred until usage patterns observed
- Online presence Redis SETs — deferred
- Silence timer distribution — deferred (cron-equivalent design needed)
- Multi-region Redis cluster topology
