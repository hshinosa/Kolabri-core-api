# Design

## Module Boundaries

### `src/socket/index.ts` (wiring only, ~50 LOC)
```typescript
export function setupSocketIO(httpServer) {
    const io = new Server(httpServer, { ... });
    io.use(authMiddleware);
    io.on("connection", (socket) => {
        registerRoomHandlers(io, socket);
        registerMessageHandlers(io, socket);
        registerInterventionHandlers(io, socket);
        registerPresenceHandlers(io, socket);
    });
    return io;
}
```

### `src/socket/auth.ts`
```typescript
export const authMiddleware: Middleware = async (socket, next) => {
    const token = socket.handshake.auth?.token;
    const decoded = verifyJwt(token);
    const user = await prisma.user.findFirst({
        where: { id: decoded.userId, deletedAt: null, isActive: true },
        select: { id: true },
    });
    if (!user) return next(new Error("unauthorized"));
    socket.data.userId = user.id;
    next();
};
```

### `src/socket/rooms.ts`
```typescript
export const roomNames = {
    chatSpace: (id: string) => id,
    user: (id: string) => `user_${id}`,
};

export function registerRoomHandlers(io, socket) {
    socket.on("join_room", async ({ roomId }) => { ... });
    socket.on("leave_room", async ({ roomId }) => { ... });
}
```

### `src/socket/messages.ts`
- `send_message` with authorization (per `core-api-socket-message-authorization`)
- `delete_message` with room match check
- `edit_message` if exists
- `typing` indicator

### `src/socket/interventions.ts`
- AI quality update emits
- Engagement signal handling
- Webhook→socket bridge

### `src/socket/presence.ts`
- Online user tracking
- Silence timers
- Heartbeat / disconnect cleanup

## Service-to-Socket Decoupling

```typescript
// src/utils/socketEmitter.ts (NEW)
export interface SocketEmitter {
    emit(room: string, event: string, payload: unknown): void;
}

let _emitter: SocketEmitter | null = null;
export function setSocketEmitter(emitter: SocketEmitter) {
    _emitter = emitter;
}
export function getSocketEmitter(): SocketEmitter {
    if (!_emitter) throw new Error("socket emitter not initialized");
    return _emitter;
}
```

```typescript
// src/socket/index.ts (wires emitter)
const emitter: SocketEmitter = {
    emit: (room, event, payload) => io.to(room).emit(event, payload),
};
setSocketEmitter(emitter);
```

```typescript
// src/services/chatSpace.service.ts (uses emitter)
import { getSocketEmitter } from "../utils/socketEmitter";
// instead of: import { getIO } from "../socket";

const emitter = getSocketEmitter();
emitter.emit(roomNames.chatSpace(id), "session_closed", payload);
```

## Migration Order

1. Extract auth.ts (lowest risk)
2. Extract rooms.ts + roomNames helper
3. Extract presence.ts
4. Extract messages.ts (largest module)
5. Extract interventions.ts
6. Add socketEmitter adapter
7. Refactor services to use adapter
