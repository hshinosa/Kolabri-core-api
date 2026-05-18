# Design

## Module Contracts

Every handler module exports:

```typescript
export function register(io: Server, socket: AuthenticatedSocket): void {
    socket.on('event_name', async (data) => { ... });
}
```

`index.ts` wires them:

```typescript
io.use(authMiddleware);
io.on('connection', (socket) => {
    registerRoomHandlers(io, socket);
    registerMessageHandlers(io, socket);
    registerInterventionHandlers(io, socket);
    registerPresenceHandlers(io, socket);
});
```

## auth.ts

```typescript
export const authMiddleware: ServerMiddleware = async (socket, next) => {
    const token = socket.handshake.auth?.token ?? socket.handshake.query?.token;
    if (!token) return next(new Error('Authentication required'));

    let decoded: JwtPayload;
    try {
        decoded = jwt.verify(token as string, env.JWT_SECRET) as JwtPayload;
    } catch {
        return next(new Error('Invalid token'));
    }

    const cached = userActiveCache.get(decoded.userId);
    if (cached === false) return next(new Error('User inactive'));

    if (cached !== true) {
        const user = await prisma.user.findFirst({
            where: { id: decoded.userId, deletedAt: null, isActive: true },
            select: { id: true },
        });
        if (!user) {
            userActiveCache.set(decoded.userId, false);
            return next(new Error('User inactive'));
        }
        userActiveCache.set(decoded.userId, true);
    }

    socket.user = decoded;
    next();
};
```

## messages.ts

Owns `send_message`, `delete_message`, `typing`. Already-validated handlers move byte-equivalent. Local helpers `analyzeEngagement`, `handleAIQuestion` move alongside.

## interventions.ts

Owns silence detection — module-private state:

```typescript
const silenceTimers = new Map<string, NodeJS.Timeout>();
const lastInterventionTime = new Map<string, number>();
const SILENCE_TIMEOUT_MS = 60_000;
```

Exports `resetSilenceTimer`, `triggerIntervention`. Currently called from `messages.ts`. Wire by importing from interventions.ts back into messages.ts.

## presence.ts

`socket.currentRoom` cleanup on disconnect. Module-private `roomUsers` Map (still in-memory pending future Redis migration in `core-api-redis-distributed-state`).

## types.ts

```typescript
import type { Socket } from 'socket.io';
import type { JwtPayload } from '../middleware/auth.js';

export interface AuthenticatedSocket extends Socket {
    user?: JwtPayload;
    currentRoom?: string;
}
```

All handler modules import `AuthenticatedSocket` from here.

## index.ts (post-split)

```typescript
import { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { logger } from '../utils/logger.js';
import { setSocketEmitter } from '../utils/socketEmitter.js';
import { getRedis } from '../config/redis.js';
import { authMiddleware } from './auth.js';
import { register as registerRoomHandlers } from './rooms.js';
import { register as registerMessageHandlers } from './messages.js';
import { register as registerInterventionHandlers } from './interventions.js';
import { register as registerPresenceHandlers } from './presence.js';

let io: Server;

export function initSocketIO(server: HttpServer): Server {
    io = new Server(server, { /* config */ });

    setSocketEmitter({ emit: (room, event, payload) => io.to(room).emit(event, payload) });

    const redis = getRedis();
    if (redis) {
        // adapter wired here when REQ-RDS-03 ships
    }

    io.use(authMiddleware);
    io.on('connection', (socket) => {
        registerRoomHandlers(io, socket);
        registerMessageHandlers(io, socket);
        registerInterventionHandlers(io, socket);
        registerPresenceHandlers(io, socket);
    });

    return io;
}

export function getIO(): Server { ... }
```

Target: under 100 LOC.

## Migration Order

1. Create `types.ts` — move `AuthenticatedSocket` interface
2. Create `auth.ts` — move authMiddleware; verify socket.integration.test.ts still green
3. Create `presence.ts` — move disconnect cleanup
4. Create `interventions.ts` — move silenceTimers + intervention helpers
5. Create `messages.ts` — move send/delete/typing handlers
6. Update `rooms.ts` — add register() exporting current join/leave from index.ts
7. Slim `index.ts` to wiring only

After every step: `npx tsc --noEmit` clean + `npx vitest run src/socket` green.
