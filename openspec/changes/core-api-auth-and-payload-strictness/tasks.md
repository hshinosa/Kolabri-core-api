## 1. Pre-flight

- [ ] 1.1 Run baseline: `npm test`
- [ ] 1.2 Audit `authRateLimiter` config and usage sites
- [ ] 1.3 Audit AI Engine auth headers via grep

## 2. Tighten auth rate limits

- [ ] 2.1 Add `loginRateLimiter` (5/15min, skip successful)
- [ ] 2.2 Add `registerRateLimiter` (3/hour)
- [ ] 2.3 Update `src/routes/auth.routes.ts` to use specific limiters per route

## 3. Refine sendMessage validation

- [ ] 3.1 Update `sendMessageSchema` with `.refine()` for content OR attachments
- [ ] 3.2 Update handler to emit `validation_error` event on parse failure
- [ ] 3.3 Remove silent return at `src/socket/index.ts:429-431`

## 4. AI Engine auth unification

- [ ] 4.1 Audit AI Engine `app/api/middleware.py` or equivalent for auth header check
- [ ] 4.2 If inconsistent: unify to one header type
- [ ] 4.3 Update `src/services/aiEngine.service.ts` accordingly

## 5. Tests

- [ ] 5.1 Test: 6 failed logins in 15 min → 429
- [ ] 5.2 Test: 4 successful logins in 15 min → all pass (skipSuccessfulRequests)
- [ ] 5.3 Test: empty message + no attachments → validation_error event
- [ ] 5.4 Test: AI Engine auth header matches expectation

## 6. Verify

- [ ] 6.1 `npm test` passing
- [ ] 6.2 `openspec validate core-api-auth-and-payload-strictness --strict`
