# Baseline Typecheck and Test Hygiene

## Problem Statement

Repository currently has accumulated baseline failures that mask real regressions:

### 1. TypeScript errors (11 total)

```
src/config/redis.ts(4,13): TS2709 Cannot use namespace 'Redis' as a type
src/config/redis.ts(7,53): TS2709 Cannot use namespace 'Redis' as a type
src/config/redis.ts(17,22): TS2351 This expression is not constructable
src/config/redis.ts(23,29): TS7006 Parameter 'err' implicitly has an 'any' type
src/config/redis.ts(39,29): TS2709 Cannot use namespace 'Redis' as a type
src/socket/socket.integration.test.ts(38,23): TS2683 'this' implicitly has type 'any'
src/socket/socket.integration.test.ts(39,10): TS2683 'this' implicitly has type 'any'
src/socket/socket.integration.test.ts(40,10): TS2683 'this' implicitly has type 'any'
src/socket/socket.integration.test.ts(49,54): TS2683 'this' implicitly has type 'any'
src/utils/socketRateLimiter.test.ts(12,5): TS2304 Cannot find name 'afterEach'
```

`redis.ts` errors are the namespace-vs-default-export issue with `ioredis` ESM types. Test errors are missing imports / unbound `this` in mock constructor functions.

### 2. Test timeouts (5 total)

```
chatSpace.service.test.ts > closes a session for a student group member  → 5000ms timeout
chatSpace.integration.test.ts > closes a session for the lecturer who owns the course  → 5000ms
chatSpace.integration.test.ts > closes a session for a student group member  → 5000ms
goal.service.test.ts > creates a shared goal for a chat space when validation passes  → 5000ms
goal.integration.test.ts > creates goal with valid Bloom verb  → 5000ms
```

Root cause: `ChatSpaceService.closeSession` calls `ChatLog.find(...).sort().limit().lean()` and `aiEngineService.generateSummary(...)`; `GoalService.createGoal` calls `aiEngineService.validateGoalContent(...)`. Test mocks don't provide implementations for those collaborators, so awaited promises never settle.

### 3. OpenSpec validation failures (2 changes)

```
core-api-logic-listener-tracking      ✗ specs/socket-send-message/spec.md     no delta sections
core-api-webhook-ai-notifications     ✗ specs/webhook-ai-intervention/spec.md no delta sections
```

Both changes are functionally archived (their implementations exist in code) but the spec files lack the required `## ADDED Requirements` / `## MODIFIED Requirements` headers that OpenSpec strict-validation expects.

## Proposed Solution

1. Fix `src/config/redis.ts` ioredis import (default import for runtime + type)
2. Type the `ChatLog` / `SilenceEvent` mock constructors in `socket.integration.test.ts`
3. Add missing `afterEach` import in `socketRateLimiter.test.ts`
4. Provide test mocks for MongoDB `ChatLog.find` chain + `aiEngineService.generateSummary` / `validateGoalContent` in chatSpace + goal tests so timeouts resolve to deterministic completions
5. Add `## ADDED Requirements` headers to the two failing OpenSpec spec files

## Scope

- `src/config/redis.ts` — fix typing + imports
- `src/socket/socket.integration.test.ts` — type mock constructors
- `src/utils/socketRateLimiter.test.ts` — fix missing import
- `src/services/chatSpace.service.test.ts` — add MongoDB + AI engine mocks
- `src/services/chatSpace.integration.test.ts` — add MongoDB + AI engine mocks
- `src/services/goal.service.test.ts` — add AI engine mock
- `src/services/goal.integration.test.ts` — add AI engine mock
- `openspec/changes/core-api-logic-listener-tracking/specs/socket-send-message/spec.md` — add delta header
- `openspec/changes/core-api-webhook-ai-notifications/specs/webhook-ai-intervention/spec.md` — add delta header

## Out of Scope

- Behavioral changes to `closeSession` / `createGoal` — fix mocks, not the services
- Restructuring how mocks are organized across the test suite
- Backfilling integration tests that don't exist yet
