# Design

## Graceful Shutdown

```typescript
// src/server.ts
const httpServer = app.listen(env.PORT);
const io = setupSocketIO(httpServer);

const SHUTDOWN_TIMEOUT_MS = 30_000;
let shuttingDown = false;

async function gracefulShutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}, starting graceful shutdown`);

    const forceExit = setTimeout(() => {
        logger.error("Force exit after shutdown timeout");
        process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    try {
        // Stop accepting new connections
        await new Promise<void>((res, rej) => {
            httpServer.close(err => err ? rej(err) : res());
        });
        logger.info("HTTP server closed");

        // Close Socket.IO (disconnect all clients)
        await new Promise<void>(res => {
            io.close(() => res());
        });
        logger.info("Socket.IO closed");

        // Stop heartbeat / interval timers (if any)
        // ...

        // Close Prisma
        await prisma.$disconnect();
        logger.info("Prisma disconnected");

        // Close Mongo
        await mongoose.connection.close();
        logger.info("Mongo disconnected");

        clearTimeout(forceExit);
        process.exit(0);
    } catch (err) {
        logger.error("Shutdown error", { error: err });
        process.exit(1);
    }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
```

## Mongo Resilience: Option B (Recommended)

```typescript
// src/config/mongodb.ts
export async function connectMongo() {
    await mongoose.connect(env.MONGO_URL, { ... });
    logger.info("Connected to MongoDB");
}

// src/server.ts
async function bootstrap() {
    await connectMongo(); // throws on failure → process exits
    // ... rest of startup
}

bootstrap().catch(err => {
    logger.error("Bootstrap failed", { error: err });
    process.exit(1);
});
```

## Mongo Resilience: Option A (Fallback)

If Mongo CAN be optional:

```typescript
// src/socket/index.ts
async function safeChatLogSave(data) {
    if (!mongoose.connection.readyState) {
        logger.warn("Mongo unavailable, skipping chat log");
        return;
    }
    try {
        await ChatLog.create(data);
    } catch (err) {
        logger.error("Mongo write failed", { error: err });
    }
}
```

## Test Strategy

- Test shutdown handler: spawn child, send SIGTERM, verify exit 0 within timeout
- Test Mongo unavailable: mock connection state, verify safe-save handles gracefully
