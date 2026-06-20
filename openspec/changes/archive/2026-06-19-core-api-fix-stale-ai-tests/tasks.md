- [x] 1.1 Read `src/services/aiEngine.service.ts` — CONFIRMED: production passes 5 args `(content, history, userName, providerContext, courseIds)` — spec's "4-arg" premise was wrong, actual drift is 4→5 args
- [x] 1.2 Read `src/controllers/aiChat.controller.ts` — CONFIRMED line 174-180: `personalChatStream(content, history, chat?.userName, providerContext, courseIds)` (5 args, courseIds = enrolled course codes from prisma.courseStudent.findMany)
- [x] 1.3 Read `prisma/schema.prisma` AiProvider — model confirmed at line 418 (fields: id, name, displayName, apiKey, baseUrl, isActive, fallbackOrder, config)
- [x] 1.4 Read `src/services/goal.integration.test.ts` — CONFIRMED: test is mock-based (vi.hoisted prismaMock), NOT real DB. So fix is adding `aiProvider`/`courseStudent` to prismaMock + mocking `providerResolutionService`, not seeding real DB.
- [x] 2.1 Line 193 assertion updated to 5-arg signature with `expect.any(Array)` as 5th arg (courseIds)
- [x] 2.2 Line 231 assertion updated to 5-arg signature with `expect.any(Array)` as 5th arg
- [x] 2.3 (N/A — no objectContaining needed; courseIds asserted as Array since real DB call returns [] in test env, assertion is loose but type-correct)
- [x] 2.4 (merged into 2.1)
- [x] 2.5 (merged into 2.2)
- [x] 2.6 Ran `npx vitest run src/controllers/aiChat.controller.test.ts` → 5/5 passed
- [x] 3.1 (N/A — test is mock-based, no real seed needed)
- [x] 3.2 (N/A — mock-based, vi.clearAllMocks in beforeEach handles cleanup)
- [x] 3.3 Added `providerResolutionService` mock (via vi.mock + vi.hoisted) + `courseStudent: { findMany: vi.fn().mockResolvedValue([]) }` to prismaMock + `resolveProviderContext.mockResolvedValue` in test case. Did NOT seed real AiProvider since test harness is fully mocked.
- [x] 3.4 (N/A — mock-based isolation)
- [x] 3.5 Confirmed: no hardcoded assumptions conflict with new mocks
- [x] 3.6 Ran `npx vitest run src/services/goal.integration.test.ts` → 10/10 passed
- [x] 4.1 Ran `npm test` → 91 test files, 742 tests, ALL PASSED (previously 89 passed / 3 failed)
- [x] 4.2 No new warnings introduced by changes
- [x] 4.3 Git diff confirms ONLY `src/controllers/aiChat.controller.test.ts` + `src/services/goal.integration.test.ts` modified by this change (other M files were pre-existing WIP by user before this session, untouched here)
- [x] 4.4 Assertion strength preserved — used `expect.any(Array)` for 5th arg (courseIds) rather than `expect.anything()`; top-level providerContext still asserted by reference identity

## Spec Deviations (documented for review)

- **Spec said 4-arg signature; reality is 5-arg** (production added `courseIds` as 5th arg to personalChatStream). Corrected during investigation; updated tasks 2.x accordingly.
- **Spec said seed real aiProvider in goal test; test is actually mock-based** (vi.hoisted prismaMock, no real DB). Fix became: add providerResolutionService vi.mock + courseStudent mock + resolveProviderContext mock return. Verified 10/10 pass.
