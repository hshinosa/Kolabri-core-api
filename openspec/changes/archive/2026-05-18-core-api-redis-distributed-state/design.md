# Design

## Pattern: Conditional Redis Path

Every consumer follows the same shape:

```typescript
import { getRedis } from '../config/redis.js';

export async function someOperation(args) {
    const redis = getRedis();
    if (redis) {
        // Redis path
    } else {
        // In-memory fallback
    }
}
```

Tests can mock `getRedis()` to return either `null` (default) or an `ioredis-mock` instance.

## HTTP Rate Limiter

`express-rate-limit` allows providing a `store` factory. Build limiters lazily so `getRedis()` is read at request-handler-construction time, not at module load:

```typescript
// src/middleware/rateLimiter.ts
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedis } from '../config/redis.js';

function buildStore() {
    const redis = getRedis();
    if (!redis) return undefined;
    return new RedisStore({
        sendCommand: (...args: string[]) => redis.call(...args) as Promise<unknown>,
    });
}

export const rateLimiter = rateLimit({
    windowMs: ...,
    max: ...,
    store: buildStore(),
    ...
});
```

Caveat: `buildStore()` runs once at module import. Server bootstrap calls `initRedis(env.REDIS_URL)` BEFORE importing routes (server.ts already does), so the store reflects the runtime state.

## Token Blacklist

Replace per-process Set:

```typescript
// src/services/auth.service.ts
const inMemoryBlacklist = new Set<string>();

export async function revokeToken(tokenHash: string, ttlSeconds: number): Promise<void> {
    const redis = getRedis();
    if (redis) {
        await redis.set(`bl:${tokenHash}`, '1', 'EX', ttlSeconds);
    } else {
        inMemoryBlacklist.add(tokenHash);
        setTimeout(() => inMemoryBlacklist.delete(tokenHash), ttlSeconds * 1000).unref();
    }
}

export async function isRevoked(tokenHash: string): Promise<boolean> {
    const redis = getRedis();
    if (redis) {
        return (await redis.exists(`bl:${tokenHash}`)) === 1;
    }
    return inMemoryBlacklist.has(tokenHash);
}
```

Token hash uses SHA-256 of the raw JWT (avoid storing the JWT itself in Redis).

TTL = remaining JWT lifetime: parse `exp` claim, subtract `Math.floor(Date.now() / 1000)`.

## Socket.IO Redis Adapter

```typescript
// src/socket/index.ts (inside initSocketIO, after `io = new Server(...)`)
import { createAdapter } from '@socket.io/redis-adapter';
import { getRedis } from '../config/redis.js';

const baseRedis = getRedis();
if (baseRedis) {
    const pub = baseRedis.duplicate();
    const sub = baseRedis.duplicate();
    io.adapter(createAdapter(pub, sub));
    logger.info('Socket.IO Redis adapter active');
}
```

`baseRedis.duplicate()` creates a connection that shares the original config but its own pub/sub state — required because Redis pub/sub blocks the client from issuing other commands.

## Verification

- Tests with `REDIS_URL` unset must still pass — in-memory fallback is preserved
- Tests with mocked `getRedis()` returning a fake ioredis instance must exercise the Redis branch
- Manual cross-instance verification deferred to staging (out of scope for code-level work)
