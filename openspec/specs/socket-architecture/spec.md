# socket-architecture Specification

## Purpose
TBD - created by archiving change core-api-socket-module-decomposition. Update Purpose after archive.
## Requirements
### Requirement: socket/index.ts MUST be wiring only

`src/socket/index.ts` SHALL contain only Socket.IO server setup and handler registration. It MUST NOT contain auth, authorization, persistence, or business logic.

#### Scenario: New socket event type

- Given a developer adds a new Socket.IO event handler
- When they implement the handler
- Then the handler MUST live in a topic-specific module under `src/socket/`
- And `src/socket/index.ts` MUST only register the handler factory
- And `wc -l src/socket/index.ts` MUST remain under 100

### Requirement: Services MUST NOT import getIO

Service modules SHALL NOT import the Socket.IO `Server` instance or `getIO` directly. Services that need to emit events MUST use a `SocketEmitter` adapter.

#### Scenario: Service emits event

- Given `ChatSpaceService` needs to broadcast `session_closed`
- When the service emits the event
- Then it MUST call `getSocketEmitter().emit(room, event, payload)`
- And it MUST NOT import from `src/socket/`

### Requirement: Type safety MUST be preserved

Socket modules SHALL NOT use `as any` or `as Record<string, unknown>` type assertions. Event payloads MUST be typed via interfaces in `src/socket/types.ts`.

#### Scenario: Type assertion attempt

- Given a developer is tempted to use `as any` for a Prisma payload
- When the code is committed
- Then a lint rule or `tsc` strict mode MUST reject the cast
- And the developer MUST instead define a proper type in `src/socket/types.ts`

