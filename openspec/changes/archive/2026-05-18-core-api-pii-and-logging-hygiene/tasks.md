## 1. Pre-flight

- [x] 1.1 Run baseline: `npm test`
- [x] 1.2 Audit: `grep -rn "console\." src/ | grep -v test`
- [x] 1.3 Audit: `grep -rn "email:" src/ | grep "logger\."`

## 2. Replace console.* in production code

- [x] 2.1 `src/middleware/errorHandler.ts:57-60` — use logger.error
- [x] 2.2 Audit other `console.*` usages (only `src/server.ts` env-error early bail remains; logger not yet ready at that point)
- [x] 2.3 ESLint already rules `no-console` (warn) with `[warn,error,info]` allowed — kept

## 3. Strip PII from logs

- [x] 3.1 `src/socket/index.ts:231,386,530,581,650` — replace email/content with userId/roomId
- [x] 3.2 Audit auth flow logs (`src/websocket/server.ts` connect/disconnect now use userId)
- [x] 3.3 Audit user CRUD logs (no email logging found)

## 4. Optional: Logger redaction wrapper

- [ ] 4.1 Add `src/utils/logger.ts` redaction layer (deferred — current strict-PII removal sufficient for spec)
- [ ] 4.2 Define field blocklist (deferred)
- [ ] 4.3 Wire wrapper in modules importing logger (deferred)

## 5. Request ID propagation

- [ ] 5.1 Verify `requestId` middleware exists or add it (deferred — out of scope of immediate logging hygiene)
- [ ] 5.2 Include `requestId` in errorHandler logs (deferred)
- [ ] 5.3 Include in socket auth logs (deferred)

## 6. Strip emoji from production logs

- [x] 6.1 `src/server.ts:28-30` — emoji removed (now uses `env.PORT` etc.)
- [x] 6.2 `src/socket/index.ts:654` — emoji removed
- [x] 6.3 `src/config/mongodb.ts:9-13` — emoji removed
- [x] 6.4 Audit `console.log` (CLI scripts can keep emoji)

## 7. Tests

- [x] 7.1 Static test: grep for PII fields in logger calls (no `email` references in logger.* outside tests/blackbox)
- [ ] 7.2 Test: redaction wrapper drops blocked fields (deferred with task 4.x)

## 8. Verify

- [x] 8.1 `npm test` passing for affected suites (env, errorHandler, cache); pre-existing failures unrelated
- [x] 8.2 `grep "console\." src/middleware src/services src/socket | wc -l` is 0 in production code (only `src/server.ts` early bail before logger init)
- [x] 8.3 `openspec validate core-api-pii-and-logging-hygiene --strict`
