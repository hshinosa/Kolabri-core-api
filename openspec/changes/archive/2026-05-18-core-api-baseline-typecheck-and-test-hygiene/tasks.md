## 1. Pre-flight

- [x] 1.1 Run baseline: `npx tsc --noEmit` and capture all errors
- [x] 1.2 Run baseline: `npx vitest run` and capture all failures
- [x] 1.3 Run baseline: `openspec validate --all --strict`

## 2. Fix Redis import

- [x] 2.1 Update `src/config/redis.ts` to use named `Redis` import; instantiate with `new Redis(url, ...)` (the named export from ioredis is constructable under `esModuleInterop: true` + `NodeNext`)
- [x] 2.2 Verify with `lsp_diagnostics`
- [x] 2.3 Re-run `src/config/redis.test.ts` (2 pass)

## 3. Fix test typing errors

- [x] 3.1 `src/utils/socketRateLimiter.test.ts` — added `afterEach` to vitest import
- [x] 3.2 `src/socket/socket.integration.test.ts` — typed `this: Record<string, unknown>` and `data: Record<string, unknown>` in `ChatLog` and `SilenceEvent` mock constructor functions
- [x] 3.3 Verify with `npx tsc --noEmit` (zero errors)
- [x] 3.4 Bonus: exported `EngagementAnalysisResponse` and `ProcessMiningExportResponse` from `aiEngine.service.ts` to fix 2 baseline TS4050 errors in `analytics.service.ts`

## 4. Resolve test timeouts

- [x] 4.1 `chatSpace.service.test.ts` — added `vi.mock('../models/ChatLog.js')` with chained-builder shape; added `vi.mock('./aiEngine.service.js')` with `generateSummary` resolved; updated assertion to expect `summary: null` field
- [x] 4.2 `chatSpace.integration.test.ts` — same mocks as 4.1; assertions updated for `summary: null`
- [x] 4.3 `goal.service.test.ts` — added `vi.mock('./aiEngine.service.js')` with `validateGoal` returning `{ success: true, is_valid: true, feedback: undefined, socratic_hint: undefined, missing_criteria: [] }` and `refineGoal`
- [x] 4.4 `goal.integration.test.ts` — same as 4.3
- [x] 4.5 Re-run impacted tests; verified zero timeouts

## 5. Fix OpenSpec spec headers

- [x] 5.1 `core-api-logic-listener-tracking/specs/socket-send-message/spec.md` — replaced `### Requirements` with `## ADDED Requirements`; converted `### REQ-XX` to `### Requirement:` and ensured every requirement has at least one `#### Scenario:` block; bodies use SHALL/MUST
- [x] 5.2 `core-api-webhook-ai-notifications/specs/webhook-ai-intervention/spec.md` — same treatment
- [x] 5.3 `core-api-goal-ai-validation/specs/goal-creation/spec.md` — same treatment (newly discovered during final validate)
- [x] 5.4 `core-api-chatspace-summary/specs/chatspace-close/spec.md` — same treatment (newly discovered during final validate)
- [x] 5.5 Re-run validation for each — all pass

## 6. Verify

- [x] 6.1 `npx tsc --noEmit` returns zero errors
- [x] 6.2 `npx vitest run` shows no timeouts; 412 pass / 1 skipped / 0 failed across 58 test files
- [x] 6.3 `openspec validate --all --strict` reports 34 passed / 0 failed
- [x] 6.4 `openspec validate core-api-baseline-typecheck-and-test-hygiene --strict`
