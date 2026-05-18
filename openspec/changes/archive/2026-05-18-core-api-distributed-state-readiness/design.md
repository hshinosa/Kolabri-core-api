# Design

## Redis Adapter Pattern

Use `ioredis` (already common in Node ecosystem). Single Redis client shared across modules:

```typescript
// src/config/redis.ts
import Redis from "ioredis";
export const redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
});

redis.on("error", (err) => logger.error("redis_error", { err }));
```

## HTTP Rate Limiter

```typescript
// src/middleware/rateLimiter.ts
import { rateLimit } from "express-rate-limit";
import RedisStore from "rate-limit-redis";

export const authRateLimiter = rateLimit({
    store: new RedisStore({ sendCommand: (...args) => redis.call(...args) }),
    windowMs: 15 * 60 * 1000,
    max: 5, // ↓ from 50
    standardHeaders: true,
});
```

## Socket Rate Limiter (Redis Sorted Sets)

```typescript
// src/utils/socketRateLimiter.ts
async isAllowed(socketId: string, event: string): Promise<boolean> {
    const key = `socket:rate:${socketId}:${event}`;
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    await redis.zremrangebyscore(key, 0, windowStart);
    const count = await redis.zcard(key);
    if (count >= this.max) return false;
    
    await redis.zadd(key, now, `${now}-${Math.random()}`);
    await redis.expire(key, Math.ceil(this.windowMs / 1000));
    return true;
}
```

## Token Blacklist

```typescript
// src/services/auth.service.ts
async revokeToken(token: string, expiresIn: number) {
    await redis.set(`bl:${tokenHash(token)}`, "1", "EX", expiresIn);
}

async isRevoked(token: string): Promise<boolean> {
    return (await redis.exists(`bl:${tokenHash(token)}`)) === 1;
}
```

## Socket.IO Redis Adapter

```typescript
// src/socket/index.ts
import { createAdapter } from "@socket.io/redis-adapter";
import { redis } from "../config/redis";

const pubClient = redis.duplicate();
const subClient = redis.duplicate();
io.adapter(createAdapter(pubClient, subClient));
```

This makes `io.to(roomName).emit(...)` work across instances automatically.

## Presence

```typescript
// src/socket/presence.ts
async addToRoom(roomId: string, userId: string) {
    await redis.sadd(`presence:${roomId}`, userId);
    await redis.expire(`presence:${roomId}`, 24 * 3600); // safety net
}

async getRoomUsers(roomId: string): Promise<string[]> {
    return redis.smembers(`presence:${roomId}`);
}

async removeFromRoom(roomId: string, userId: string) {
    await redis.srem(`presence:${roomId}`, userId);
}
```

## Migration Strategy

Phase 1: HTTP rate limiter + token blacklist (lowest coupling)
Phase 2: Socket.IO Redis adapter (enables cross-instance broadcast)
Phase 3: Socket rate limiter (depends on Redis)
Phase 4: Presence + silence timers (most invasive)

Each phase shipped independently; service runs in single-instance mode if Phase 4 deferred.
