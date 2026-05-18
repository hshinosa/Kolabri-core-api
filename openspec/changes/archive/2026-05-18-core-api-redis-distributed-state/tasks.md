## 1. Pre-flight

- [x] 1.1 Confirm Phase 1 foundation in place: `src/config/redis.ts` exports `getRedis()`
- [x] 1.2 Run baseline `npx vitest run` and capture passing count

## 2. Install dependencies

- [x] 2.1 `npm install rate-limit-redis@^4 @socket.io/redis-adapter` (rate-limit-redis v5 requires express-rate-limit ≥8.5; project is on 7.5.1, so pinned to v4 line)
- [x] 2.2 Verify versions in `package.json` — `rate-limit-redis@^4.3.1`, `@socket.io/redis-adapter@^8.3.0`, `ioredis@^5.10.1`

## 3. HTTP rate limiter

- [x] 3.1 Added `buildStore(prefix)` helper in `src/middleware/rateLimiter.ts` reading `getRedis()`
- [x] 3.2 Applied `store: buildStore(...)` to all six rate limiter constructors with distinct prefixes (`general`, `auth`, `login`, `register`, `ai`, `test-connection`) so counters never collide
- [x] 3.3 Existing `rateLimiter.test.ts` (2 tests) still passes — confirms in-memory fallback intact when `REDIS_URL` is unset
- [x] 3.4 New `rateLimiter.redis.test.ts` (2 tests) covers both branches: null-redis fallback and mocked-redis path constructing the limiter with a Redis-backed store; fake redis answers `SCRIPT LOAD` so RedisStore initialization completes

## 4. Token blacklist

- [x] 4.1 Replaced module-level `tokenBlacklist = new Set<string>()` with `revokeToken(hash, ttl)` and `isRevoked(hash)` in `src/services/auth.service.ts`
- [x] 4.2 Added SHA-256 hashing helper for raw tokens (storing hashes only, never the raw JWT)
- [x] 4.3 Wired `revokeToken` into `logout()` — TTL computed via `jwt.decode(refreshToken).exp - now`, falling back to 7-day default
- [x] 4.4 Wired `isRevoked` into `refreshAccessToken()` precondition; updated `isTokenBlacklisted()` to async returning `Promise<boolean>`
- [x] 4.5 Updated `auth.service.test.ts` to `await AuthService.isTokenBlacklisted(...)`; existing 5 tests pass

## 5. Socket.IO Redis adapter

- [x] 5.1 Imported `createAdapter` from `@socket.io/redis-adapter` and `getRedis` in `src/socket/index.ts`
- [x] 5.2 After `new Server(...)` and `setSocketEmitter(...)`, conditional block: `if (redis) { io.adapter(createAdapter(redis.duplicate(), redis.duplicate())) }`
- [x] 5.3 Logged `Socket.IO Redis adapter active` when adapter is installed
- [x] 5.4 `lsp_diagnostics` clean
- [x] 5.5 Socket.IO test suite still 22 tests passing (no behavior change when REDIS_URL is unset)

## 6. Verify

- [x] 6.1 `npx tsc --noEmit` clean
- [x] 6.2 `npx vitest run` shows 414 pass / 1 skipped / 0 failed across 59 test files; new Redis-store tests included
- [x] 6.3 `openspec validate core-api-redis-distributed-state --strict`
