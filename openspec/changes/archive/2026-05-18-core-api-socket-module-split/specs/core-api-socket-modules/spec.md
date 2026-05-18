## ADDED Requirements

### Requirement: Pure logic and authentication MUST live in dedicated modules

`AuthenticatedSocket`, `ChatHistoryItem`, JWT-based authentication middleware, and the engagement-keyword analysis helpers MUST live in dedicated sibling files under `src/socket/`. Specifically: `types.ts` MUST own the shared interfaces, `auth.ts` MUST own `authMiddleware`, and `engagement.ts` MUST own `analyzeEngagement` plus its keyword constants.

#### Scenario: Modules import from src/socket/ siblings

- **WHEN** a developer reads `src/socket/index.ts`
- **THEN** the file imports `AuthenticatedSocket`, `ChatHistoryItem` from `./types.js`
- **AND** imports `authMiddleware` from `./auth.js`
- **AND** imports `analyzeEngagement` from `./engagement.js`

#### Scenario: types.ts is dependency-free of business logic

- **GIVEN** `src/socket/types.ts`
- **WHEN** the file is loaded
- **THEN** it imports only from `socket.io`, `../middleware/auth.js`, and `../models/ChatLog.js` (type-only)
- **AND** it exports both `AuthenticatedSocket` and `ChatHistoryItem`

### Requirement: Behavior MUST be preserved across the split

The split MUST be a pure refactor. All existing socket integration tests SHALL pass without modification.

#### Scenario: Existing tests pass after extraction

- **GIVEN** `src/socket/socket.integration.test.ts` and `src/socket/rooms.test.ts`
- **WHEN** `npx vitest run src/socket` runs against the post-extraction tree
- **THEN** all 22 tests pass with the same assertions
- **AND** the full vitest suite (`npx vitest run`) reports zero regressions vs. baseline

### Requirement: Further decomposition MUST be tracked

Sections 5-7 of the original tasks (`presence.ts`, `messages.ts`, `rooms.ts register()`, `interventions.ts`) MUST be tracked as deferred work in the change's tasks.md with the rationale for the deferral, so the next iteration has clear scope.

#### Scenario: Deferred work documented

- **WHEN** a developer opens `openspec/changes/core-api-socket-module-split/tasks.md`
- **THEN** sections 5, 6, 7 explicitly state "DEFERRED" with rationale
- **AND** an "Honest Assessment" section explains what was achieved versus the original aspirational target
