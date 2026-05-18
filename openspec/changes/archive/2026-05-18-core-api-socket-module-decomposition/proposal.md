# Socket.IO Module Decomposition

## Problem Statement

`src/socket/index.ts` is 1084 LOC and mixes 7 concerns:
- Authentication (JWT verify + DB check)
- Authorization (room membership, message ownership)
- Room state (join, leave, presence)
- Chat persistence (Mongo + Postgres writes)
- Heuristic NLP (engagement signal)
- AI Engine orchestration (intervention, quality)
- Online presence and silence timers

Plus tight coupling: `ChatSpaceService` imports `getIO` from socket (`src/services/chatSpace.service.ts:3`), socket imports services. Service layer becomes transport-aware.

## Proposed Solution

Decompose into focused modules:

```
src/socket/
├── index.ts          # wiring only — auth middleware + register handlers
├── auth.ts           # JWT verify + DB check + isActive
├── rooms.ts          # join/leave + roomNames helper
├── messages.ts       # send_message, delete_message handlers
├── interventions.ts  # AI quality/engagement handlers
├── presence.ts       # online users, silence timers
└── types.ts          # shared event types
```

Plus introduce `socketEmitter` adapter so services don't import `getIO`.

## Scope

- Split `src/socket/index.ts` into ~6 focused files
- Create `src/utils/socketEmitter.ts` event publisher
- Refactor `ChatSpaceService` to depend on `socketEmitter` not `getIO`
- Tests preserved

## Out of Scope

- Behavioral changes
- Socket protocol changes
