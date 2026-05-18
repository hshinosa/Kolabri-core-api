## 1. Pre-flight

- [x] 1.1 Run baseline: `npm test`
- [x] 1.2 Audit `authRateLimiter` config and usage sites
- [x] 1.3 Audit AI Engine auth headers via grep

## 2. Tighten auth rate limits

- [x] 2.1 Add `loginRateLimiter` (5/15min, skip successful)
- [x] 2.2 Add `registerRateLimiter` (3/hour)
- [x] 2.3 Update `src/routes/auth.routes.ts` to use specific limiters per route

## 3. Refine sendMessage validation

- [x] 3.1 Update `sendMessageSchema` with `.refine()` for content OR attachments
- [x] 3.2 Handler emits `validation_error` event on parse failure (already wired via `emitValidationError`)
- [x] 3.3 Removed silent return at `src/socket/index.ts:429-431`; now schema-level rejection

## 4. AI Engine auth unification

- [x] 4.1 Audit AI Engine `app/middleware/auth.py` — only accepts `Authorization: Bearer ...`
- [x] 4.2 Unified to `Authorization: Bearer` for ingest + ingest/batch (was previously `X-API-Key`, silently failing)
- [x] 4.3 Updated `src/services/aiEngine.service.ts:315,404`

## 5. Tests

- [ ] 5.1 Test: 6 failed logins in 15 min → 429 (deferred — express-rate-limit integration test infra not in repo)
- [ ] 5.2 Test: 4 successful logins in 15 min → all pass (skipSuccessfulRequests) (deferred)
- [x] 5.3 Test: empty message + no attachments → schema rejects with `Message must have content or at least one attachment`
- [x] 5.4 Test: AI Engine auth header unified to Bearer

## 6. Verify

- [x] 6.1 `npm test` — affected suites passing (validators 6/6, rateLimiter 2/2)
- [x] 6.2 `openspec validate core-api-auth-and-payload-strictness --strict`
