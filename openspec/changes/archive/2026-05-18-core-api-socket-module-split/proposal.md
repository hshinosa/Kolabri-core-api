# Socket Module Split

## Problem Statement

`src/socket/index.ts` is 1142 LOC and mixes seven concerns: JWT auth, room state, message persistence, engagement heuristics, AI engine orchestration, presence + silence timers, and admin tooling helpers. Symptoms:

- Type signatures repeated across handlers (every payload typed inline)
- Test setup mocks 6 collaborators because one file owns everything
- New socket events accumulate in this file by default — file is now an anti-pattern attractor
- The earlier `core-api-socket-module-decomposition` change shipped only the `socketEmitter` decoupling and the `roomNames` helper; sections 2-5 (auth/rooms/messages/interventions/presence extraction) were deferred

## Proposed Solution

Decompose into focused modules under `src/socket/`:

```
src/socket/
├── index.ts          # wiring only — Server + adapter + middleware + register handlers (~80 LOC)
├── auth.ts           # JWT verify + Prisma user lookup + isActive
├── rooms.ts          # join_room, leave_room, roomNames (existing)
├── messages.ts       # send_message + delete_message + typing
├── interventions.ts  # AI question handling, silence timers, intervention triggers
├── presence.ts       # currentRoom tracking + disconnect cleanup
└── types.ts          # AuthenticatedSocket + payload shape exports
```

Each handler module exports a single `register(io, socket)` function that the wiring file calls inside `io.on('connection', ...)`.

Behavioral guarantee: handler logic is moved verbatim. Authorization checks, sanitization, error emission, logging — all preserved byte-equivalent. Only file boundaries change.

## Scope

- Split 7 modules out of `src/socket/index.ts`
- Move shared state (`silenceTimers`, `lastInterventionTime`, `roomUsers`) into the module that owns the behavior
- Update existing socket integration test if it imports private symbols (it imports through `vi.mock`, so no change expected)
- Run full vitest + tsc verification at every extraction step

## Out of Scope

- Behavioral changes — pure refactor
- Test additions beyond what's needed to verify equivalence
- Replacement of `as any` casts in the existing handlers
- Migration to TypeScript-typed socket events (e.g., `Server<ClientToServerEvents>`)

## Risk Notes

This is a 1142 → ~80 LOC restructuring. Risks:

1. Closure leakage — top-level constants in `index.ts` (e.g., `silenceTimers`) shared across handler functions; must move alongside their consumers
2. Import cycles — handler modules import `aiEngineService`; wiring imports handlers; should not cycle
3. Test mock paths — `vi.mock('../socket/index.js')` is no longer used (replaced by `socketEmitter` in completed work), so the split won't break tests through that channel
