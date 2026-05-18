## 1. Pre-flight

- [ ] 1.1 Run baseline: `npm test`
- [ ] 1.2 Verify `ioredis` and `@socket.io/redis-adapter` available
- [ ] 1.3 Add `REDIS_URL` to env schema (depends on `core-api-startup-config-validation`)

## 2. Phase 1: Redis client + HTTP rate limiter

- [ ] 2.1 Create `src/config/redis.ts` shared client
- [ ] 2.2 Install `rate-limit-redis`
- [ ] 2.3 Update `src/middleware/rateLimiter.ts` to use RedisStore
- [ ] 2.4 Run rate limit tests

## 3. Phase 2: Token blacklist

- [ ] 3.1 Refactor `src/services/auth.service.ts` blacklist Map → Redis
- [ ] 3.2 Use SET with EX (TTL = remaining JWT expiry)
- [ ] 3.3 Test: revoke on instance A, verify rejection on instance B

## 4. Phase 3: Socket.IO Redis adapter

- [ ] 4.1 Add `@socket.io/redis-adapter`
- [ ] 4.2 Wire pub/sub clients in `src/socket/index.ts`
- [ ] 4.3 Integration test: emit on instance A, verify delivery via instance B

## 5. Phase 4: Socket rate limiter + presence

- [ ] 5.1 Rewrite `src/utils/socketRateLimiter.ts` with Redis sorted sets
- [ ] 5.2 Move `roomUsers` Map to Redis SETs
- [ ] 5.3 Move `silenceTimers` to Redis with TTL or distributed cron

## 6. Tests

- [ ] 6.1 Multi-instance test scenario for rate limit
- [ ] 6.2 Presence cleanup on disconnect
- [ ] 6.3 Token revocation propagation

## 7. Verify

- [ ] 7.1 `npm test` passing
- [ ] 7.2 Manual: spin 2 instances, verify cross-instance broadcast
- [ ] 7.3 `openspec validate core-api-distributed-state-readiness --strict`
