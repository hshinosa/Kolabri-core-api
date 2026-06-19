## Why

The core-api test suite is currently failing (89 passed, 3 failed) due to test-vs-production signature drift. Recent uncommitted changes introduced provider-context resolution to AI service calls, updating production signatures in `aiEngine.service.ts` and `aiChat.controller.ts`, but corresponding test expectations were not updated. This blocks CI/CD and development confidence.

## What Changes

- **Category: stale-test-vs-new-code** — Update `aiChat.controller.test.ts` to assert the new 4-argument signature (including provider context object) instead of the old 3-argument signature for `personalChatStream` calls
- **Category: stale-test-vs-new-code (missing dependency mock)** — Fix `goal.integration.test.ts` by seeding/mocking `aiProvider` data so the newly-introduced provider resolution logic in `GoalService.createGoal` can resolve a provider context without throwing `TypeError`

All changes are test-only. No production code modifications. No breaking changes.

## Capabilities

### New Capabilities
- `ai-chat-and-goal-provider-tests`: Test suite alignment for AI provider context resolution. Covers signature drift fixes in `aiChat.controller.test.ts` (2 tests expecting old 3-arg signature) and missing provider mock in `goal.integration.test.ts` (1 test failing due to undefined `prisma.aiProvider`).

### Modified Capabilities
<!-- No existing spec requirements are changing; this is purely test maintenance -->

## Impact

**Affected Files:**
- `src/controllers/aiChat.controller.test.ts` — 2 test cases (~lines 193, 231)
- `src/services/goal.integration.test.ts` — 1 test case + test setup for aiProvider seeding

**Systems:**
- Test suite health (restores green CI)
- Developer workflow (unblocks local test runs)

**No Impact:**
- Production code (no source changes)
- APIs (no signature changes to public endpoints)
- Database schema (provider seeding is test-data only)
- Dependencies (no package changes)
