# ai-chat-and-goal-provider-tests Specification

## Purpose
TBD - created by archiving change core-api-fix-stale-ai-tests. Update Purpose after archive.
## Requirements
### Requirement: AI chat controller tests SHALL assert 4-argument signature for personalChatStream calls

The test suite for `aiChat.controller` SHALL verify that `personalChatStream` is invoked with four arguments: message text, prior conversation history, user name, and a resolved provider context object. Tests MUST assert the complete signature including the provider context structure, not weaken assertions to `expect.anything()`.

**Root Cause Classification**: stale-test-vs-new-code (signature drift)

**Affected File**: `src/controllers/aiChat.controller.test.ts`

**Context**: Production code was updated to resolve AI provider configuration (credentials, execution settings) and pass it as a 4th argument to `personalChatStream`. Two existing tests continue to assert the old 3-argument signature, causing failures.

#### Scenario: Streaming chat message with resolved provider context

- **WHEN** the test 'streams a message, resolves provider context, forwards prior history, and persists the assistant reply' (around line 193) executes
- **THEN** the test SHALL assert `mockAiEngineService.personalChatStream` was called with exactly 4 arguments:
  - Argument 1: message text (string, e.g., 'Hi there')
  - Argument 2: prior conversation history (array of message objects)
  - Argument 3: user name (string, e.g., 'Alice')
  - Argument 4: provider context object with structure `{ auth: { type: 'api-key', credential: <string> }, execution: { ... } }`

#### Scenario: Fallback to canned message with resolved provider context

- **WHEN** the test 'falls back to a canned assistant message when the stream is unavailable' (around line 231) executes
- **THEN** the test SHALL assert `mockAiEngineService.personalChatStream` was called with exactly 4 arguments:
  - Argument 1: message text (string)
  - Argument 2: prior conversation history (array)
  - Argument 3: user name (string)
  - Argument 4: provider context object with structure `{ auth: { type: 'api-key', credential: <string> }, execution: { ... } }`
- **AND** the test SHALL verify the fallback behavior (canned message persisted) still functions correctly with the updated signature

### Requirement: Goal integration tests SHALL seed aiProvider data to support provider resolution

The integration test suite for `GoalService` SHALL seed at least one active `aiProvider` record in the test database so that provider resolution logic invoked during `createGoal` can successfully query `prisma.aiProvider.findMany()` without encountering undefined references.

**Root Cause Classification**: stale-test-vs-new-code (missing mock for newly-introduced dependency)

**Affected File**: `src/services/goal.integration.test.ts`

**Context**: `GoalService.createGoal` now invokes `ProviderResolutionService.executeWithFallback`, which queries `prisma.aiProvider` to resolve an AI provider context. The integration test's Prisma setup does not seed `aiProvider` data, causing `prisma.aiProvider` to be undefined at runtime and the test to fail with `TypeError: Cannot read properties of undefined (reading 'findMany')`.

#### Scenario: Goal creation with Bloom taxonomy verb and provider resolution

- **WHEN** the test 'Flow 3: Goal Setting + Bloom Taxonomy > creates goal with valid Bloom verb' executes
- **THEN** the test setup SHALL seed at least one `aiProvider` record with:
  - `isActive: true` (so it is returned by `listActiveProvidersByFallbackOrder`)
  - `fallbackOrder` set to a valid integer (e.g., 1)
  - All required fields per the `AiProvider` Prisma schema (name, type, configuration, credentials as applicable)
- **AND** the test SHALL execute `GoalService.createGoal` without throwing `TypeError`
- **AND** the test SHALL verify the goal is created successfully with the expected Bloom taxonomy verb

#### Scenario: Test cleanup isolates aiProvider seed data

- **WHEN** the goal integration test completes (success or failure)
- **THEN** the seeded `aiProvider` record SHALL be cleaned up (via transaction rollback, database reset, or explicit deletion) so it does not affect other tests
- **AND** subsequent tests SHALL start with a clean `aiProvider` state per the existing test isolation pattern in the file

### Requirement: Test fixes SHALL preserve assertion strength and coverage

All test updates to fix signature drift or missing mocks SHALL maintain or improve assertion strength. Tests MUST NOT weaken to `expect.anything()`, `expect.any()`, or skip assertions to make tests pass.

#### Scenario: Provider context shape is fully asserted in aiChat tests

- **WHEN** updating `aiChat.controller.test.ts` to assert the 4th argument (provider context)
- **THEN** the test SHALL assert the provider context object structure, not use `expect.anything()`
- **AND** the assertion SHALL verify at minimum:
  - `auth.type` is a string (e.g., 'api-key')
  - `auth.credential` is a non-empty string
  - `execution` object is present (even if sub-fields use `expect.objectContaining()` for flexibility)

#### Scenario: aiProvider seed data matches production schema in goal tests

- **WHEN** seeding `aiProvider` data in `goal.integration.test.ts`
- **THEN** the seeded record SHALL conform to the `AiProvider` Prisma model schema
- **AND** the seeded record SHALL include all non-nullable fields required by the schema
- **AND** the seeded record SHALL use realistic test values (e.g., `name: 'Test Provider'`, `type: 'openai'`, `isActive: true`) that reflect production data shapes

