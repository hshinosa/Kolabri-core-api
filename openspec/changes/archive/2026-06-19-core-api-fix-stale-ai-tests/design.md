## Context

**Background:**
Recent development added provider-context resolution to AI service calls in core-api. The production code in `src/services/aiEngine.service.ts` and `src/controllers/aiChat.controller.ts` was updated to resolve AI provider configuration (credentials, execution context) and pass it as a 4th argument to `personalChatStream` calls. Similarly, `GoalService.createGoal` now invokes provider resolution via `ProviderResolutionService.executeWithFallback`, which queries `prisma.aiProvider` to find active providers.

**Current State:**
- Production code: Updated with provider-context resolution (uncommitted changes in git diff)
- Test suite: Out of sync, asserting old signatures/missing mocks
  - `aiChat.controller.test.ts`: 2 tests expect 3-arg signature, production now uses 4-arg
  - `goal.integration.test.ts`: 1 test fails with `TypeError: Cannot read properties of undefined (reading 'findMany')` because `prisma.aiProvider` is not seeded/mocked in the test harness

**Constraints:**
- Test-only changes: No production code modifications allowed
- Maintain test coverage: Do not weaken assertions to `expect.anything()` — assert real shapes
- Follow existing test patterns: Use the prisma/mock patterns already established in each test file

**Stakeholders:**
- Developers running `npm test` locally (blocked by 3 failures)
- CI/CD pipeline (red due to test failures)

## Goals / Non-Goals

**Goals:**
1. Restore test suite to green (89 passed, 0 failed)
2. Update test expectations in `aiChat.controller.test.ts` to assert the new 4-argument signature including provider context object
3. Fix `goal.integration.test.ts` by seeding or mocking `aiProvider` data so provider resolution succeeds
4. Preserve test coverage and assertion strength (no weakening to `expect.anything()`)

**Non-Goals:**
- Production code changes (the provider-context resolution logic is already correct)
- Refactoring test architecture (use existing patterns in each file)
- Adding new test cases (scope limited to fixing existing failures)
- Schema migrations or seed script updates (test-data seeding only)

## Decisions

### Decision 1: Assert Full Provider Context Shape in aiChat.controller.test.ts

**Choice:** Update the two failing tests (~lines 193, 231) to assert a complete 4th argument matching the resolved provider context structure: `{ auth: { type: 'api-key', credential: 'sk-test' }, execution: { ... } }`.

**Rationale:**
- Maintains strong assertions (tests verify the contract, not just "something was passed")
- Documents the expected provider context shape for future maintainers
- Catches regressions if provider resolution logic changes incorrectly

**Alternatives Considered:**
- **Weaken to `expect.anything()`**: Rejected — loses test value, doesn't verify the provider context is correctly resolved
- **Mock at a higher level (avoid provider resolution)**: Rejected — production code path includes resolution, test should exercise it

**Implementation Notes:**
- Read the current production code in `aiEngine.service.ts` / `aiChat.controller.ts` to extract the exact provider context shape being passed
- Update both test cases to expect `mockAiEngineService.personalChatStream` called with 4 arguments: `(message, priorHistory, userName, providerContext)`
- Use a test fixture or inline object for `providerContext` matching the shape resolved in production

### Decision 2: Seed aiProvider Data in goal.integration.test.ts

**Choice:** Add `aiProvider` seed data to the test setup in `goal.integration.test.ts` so `prisma.aiProvider.findMany()` returns at least one active provider during goal creation.

**Rationale:**
- Follows the existing pattern in the file (integration tests use a real Prisma client against a test database)
- Minimal change: just add provider seed data to the existing setup
- Mirrors production behavior (provider resolution expects at least one active provider)

**Alternatives Considered:**
- **Mock ProviderRepository**: Rejected — this is an integration test with a real Prisma client; mocking would require refactoring the test harness architecture (out of scope)
- **Skip provider resolution in tests**: Rejected — production code always resolves provider context during goal creation; tests should exercise that path

**Implementation Notes:**
- Locate the test setup section (likely a `beforeEach` or `beforeAll` block that seeds test data)
- Add `prisma.aiProvider.create()` calls to seed at least one active provider with required fields (check `prisma/schema.prisma` for `AiProvider` model shape)
- Verify the seeded provider has `isActive: true` and `fallbackOrder` set so `listActiveProvidersByFallbackOrder` returns it

### Decision 3: Root-Cause Classification for Documentation

**Choice:** Classify both issues as **stale-test-vs-new-code**:
- `aiChat.controller.test.ts`: Tests not updated when production signature changed (signature drift)
- `goal.integration.test.ts`: Test harness missing mock/seed for newly-introduced dependency (missing mock for new dep)

**Rationale:**
- Accurately documents the failure mode for retrospectives and future reference
- Distinguishes from pre-existing bugs or WIP-incomplete-refactor categories
- Guides prevention strategy (e.g., enforce test updates in PR reviews when signatures change)

## Risks / Trade-offs

**[Risk]** Seeding aiProvider in goal.integration.test.ts might conflict with other tests if they share the same test database instance.
→ **Mitigation:** Follow the existing cleanup pattern in the test file (e.g., `beforeEach` setup + `afterEach` teardown). If the test uses transaction rollback or database reset between tests, the seeded provider will be isolated per test.

**[Risk]** The provider context shape in aiChat.controller.test.ts might evolve as provider resolution matures, requiring test updates again.
→ **Mitigation:** Extract the provider context fixture into a shared test helper (e.g., `fixtures/providerContext.ts`) so future updates are centralized. (Implementation of this helper is a follow-up improvement, not blocking this change.)

**[Risk]** If the exact provider context shape is complex or includes dynamic values (timestamps, UUIDs), asserting the full shape might make tests brittle.
→ **Mitigation:** Use `expect.objectContaining()` for nested objects if needed, asserting only the stable fields (e.g., `auth.type`, `auth.credential`) while allowing flexibility on volatile fields. Read the production code to identify which fields are stable.

**[Trade-off]** Test-only changes mean the root cause (lack of test updates during feature development) is not addressed.
→ **Acceptance:** Process improvements (e.g., "update tests before committing signature changes") are outside the scope of this technical change. This change restores green CI; process improvements are a team/workflow concern.

## Migration Plan

N/A — Test-only changes, no deployment or migration required. Developers can run `npm test` locally to verify the fixes before committing.

## Open Questions

1. **Provider context shape in production**: Need to read `src/services/aiEngine.service.ts` and `src/controllers/aiChat.controller.ts` to extract the exact structure of the 4th argument being passed. (Answerable by reading uncommitted git diff.)

2. **aiProvider model shape in Prisma schema**: Need to read `prisma/schema.prisma` to identify required fields for seeding a valid `AiProvider` record. (Answerable by reading schema file.)

3. **Existing test setup pattern in goal.integration.test.ts**: Need to read the test file to understand how test data is currently seeded (direct Prisma calls, seed functions, fixtures?) so the aiProvider seeding follows the same pattern. (Answerable by reading test file.)

All questions are resolvable by reading existing code/schema — no external dependencies or stakeholder decisions required.
