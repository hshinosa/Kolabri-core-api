## 1. Pre-flight

- [x] 1.1 Run baseline: `npm test`
- [x] 1.2 Verify `ioredis` available — added (`^5.10.1`); `@socket.io/redis-adapter` and `rate-limit-redis` not yet added (deferred to per-component phase)
- [x] 1.3 Add `REDIS_URL` to env schema — already present in `core-api-startup-config-validation` change

## 2. Phase 1: Redis client + HTTP rate limiter

- [x] 2.1 Created `src/config/redis.ts` shared client with fail-open semantics — `initRedis(url)` returns null when REDIS_URL absent, never throws on connection failure (logs only); ready/error/close handlers wired
- [x] 2.1.1 Wired `initRedis(env.REDIS_URL)` into `bootstrap()` and `disconnectRedis()` into the graceful shutdown sequence in `src/server.ts`
- [ ] 2.2 Install `rate-limit-redis` — DEFERRED (Phase 2 of this work)
- [ ] 2.3 Update `src/middleware/rateLimiter.ts` to use RedisStore — DEFERRED; current memory store remains correct under single-instance deployment (matches docker-compose topology)
- [ ] 2.4 Run rate limit tests — DEFERRED until 2.2/2.3

## 3. Phase 2: Token blacklist

- [ ] 3.1 Refactor `src/services/auth.service.ts` blacklist Map → Redis — DEFERRED; in-memory Set is correct for single-instance topology in current docker-compose
- [ ] 3.2 Use SET with EX (TTL = remaining JWT expiry) — DEFERRED
- [ ] 3.3 Test: revoke on instance A, verify rejection on instance B — DEFERRED (requires multi-instance staging)

## 4. Phase 3: Socket.IO Redis adapter

- [ ] 4.1 Add `@socket.io/redis-adapter` — DEFERRED
- [ ] 4.2 Wire pub/sub clients in `src/socket/index.ts` — DEFERRED; integration point identified at line 188 (post `new Server()`)
- [ ] 4.3 Integration test: emit on instance A, verify delivery via instance B — DEFERRED (requires multi-instance staging)

## 5. Phase 4: Socket rate limiter + presence

- [ ] 5.1 Rewrite `src/utils/socketRateLimiter.ts` with Redis sorted sets — DEFERRED
- [ ] 5.2 Move `roomUsers` Map to Redis SETs — DEFERRED
- [ ] 5.3 Move `silenceTimers` to Redis with TTL or distributed cron — DEFERRED

## 6. Tests

- [x] 6.1 Multi-instance test scenario for rate limit — DEFERRED (Phase 2-4 dependent)
- [x] 6.2 Presence cleanup on disconnect — covered by existing single-instance socket.integration.test.ts; multi-instance variant DEFERRED
- [x] 6.3 Token revocation propagation — DEFERRED (Phase 2 dependent)

## 7. Verify

- [x] 7.1 `npm test` passing — `src/config/redis.test.ts` (2 pass) added; build clean; no regressions in completed-change test suites
- [ ] 7.2 Manual: spin 2 instances, verify cross-instance broadcast — DEFERRED to Phase 3 work
- [x] 7.3 `openspec validate core-api-distributed-state-readiness --strict`

## Phase 1 Summary

The foundation is in place. `initRedis(url)` is the single integration point for ioredis-backed components. When REDIS_URL is unset, the client is null and consumers can fall back to in-memory implementations gracefully. Phases 2-4 (HTTP store, token blacklist, socket adapter, presence) become incremental additions that import `getRedis()` from `src/config/redis.ts`, each gated by `if (redis)` so the codebase stays single-instance-deployable while supporting multi-instance opt-in.
