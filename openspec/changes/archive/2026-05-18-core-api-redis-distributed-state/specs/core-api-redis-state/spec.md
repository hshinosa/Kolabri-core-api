## ADDED Requirements

### Requirement: HTTP rate limiter uses Redis store when available

When `getRedis()` returns a non-null client, every Express rate limiter in `src/middleware/rateLimiter.ts` MUST be constructed with a `RedisStore` backed by that client. When `getRedis()` returns null, the limiters SHALL fall back to the default in-memory store.

#### Scenario: Redis available

- **GIVEN** `REDIS_URL` is set and `initRedis()` has been called
- **WHEN** the rate limiter middleware is constructed
- **THEN** `RedisStore` is used and counters are visible across all processes sharing that Redis

#### Scenario: Redis unavailable

- **GIVEN** `REDIS_URL` is unset
- **WHEN** the rate limiter middleware is constructed
- **THEN** the in-memory store is used (current behavior preserved for single-instance deployment)

### Requirement: Token blacklist propagates across instances when Redis is available

`AuthService` SHALL expose `revokeToken(tokenHash, ttlSeconds)` and `isRevoked(tokenHash)` which MUST use Redis SET/EXISTS with TTL when `getRedis()` is non-null. Otherwise both MUST delegate to a process-local Set with timer-based expiry.

#### Scenario: Cross-instance revocation with Redis

- **GIVEN** instance A has called `revokeToken('abc...', 900)` against shared Redis
- **WHEN** instance B receives a request bearing the matching JWT
- **AND** instance B calls `isRevoked('abc...')`
- **THEN** instance B sees the token as revoked and rejects the request

#### Scenario: Single-instance fallback

- **GIVEN** Redis is not configured
- **WHEN** `revokeToken` is called
- **THEN** the token hash is held in the process-local Set
- **AND** `isRevoked` returns true within the same process for the TTL window

### Requirement: Socket.IO uses Redis adapter when available

`initSocketIO` MUST call `io.adapter(createAdapter(pubClient, subClient))` whenever `getRedis()` returns non-null. The pub/sub clients SHALL be duplicated from the base client. When Redis is unavailable, no adapter SHALL be installed (default in-memory adapter).

#### Scenario: Cross-instance broadcast with Redis

- **GIVEN** Redis is configured and two server instances are running
- **AND** client X is connected to instance A and joined room R
- **AND** client Y is connected to instance B and joined room R
- **WHEN** instance A calls `io.to(R).emit('event', payload)`
- **THEN** both client X and client Y receive `event` with the payload

#### Scenario: Single-instance fallback

- **GIVEN** Redis is not configured
- **WHEN** `initSocketIO` runs
- **THEN** no adapter is installed
- **AND** `io.to(R).emit(...)` continues to deliver to local sockets only
