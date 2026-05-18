# Graceful Shutdown and Mongo Failure Mode

## Problem Statement

Two related lifecycle gaps:

1. **Shutdown** (`src/server.ts:33-40`) only calls `server.close()` then `process.exit(0)`. It does NOT close:
   - Prisma connection pool
   - MongoDB connection
   - Socket.IO server (active connections, intervals)
   - WebSocket heartbeat timers
   In production this can leak connections and lose in-flight requests.

2. **Mongo failure mode** (`src/config/mongodb.ts:10-14`) logs warning and lets app continue when Mongo is down. Comment says "chat logs will be skipped" but no skip logic exists in `src/socket/index.ts:306-316,469-488,732-742`. Result: chat handlers crash on `ChatLog.save()` if Mongo is down at request time.

## Proposed Solution

### Shutdown
- Wire SIGTERM/SIGINT handler that closes resources in order: HTTP → Socket.IO → Prisma → Mongo
- Force exit timeout to prevent indefinite hang
- Log each step

### Mongo Resilience
Either:
- A) Make `ChatLog.save()` calls fail-safe (try/catch + skip)
- B) Make Mongo connection required at boot (fail fast if unavailable)

Recommend B for chat-critical service. Document A as fallback if Mongo can be optional.

## Scope

- `src/server.ts` — graceful shutdown handler
- `src/config/mongodb.ts` — startup failure mode
- `src/socket/index.ts` — wrap `ChatLog.save()` calls if Mongo can be optional
- Tests for SIGTERM behavior
