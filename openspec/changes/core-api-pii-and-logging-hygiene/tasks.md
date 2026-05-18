## 1. Pre-flight

- [ ] 1.1 Run baseline: `npm test`
- [ ] 1.2 Audit: `grep -rn "console\." src/ | grep -v test`
- [ ] 1.3 Audit: `grep -rn "email:" src/ | grep "logger\."`

## 2. Replace console.* in production code

- [ ] 2.1 `src/middleware/errorHandler.ts:57-60` — use logger.error
- [ ] 2.2 Audit other `console.*` usages
- [ ] 2.3 Add ESLint rule `no-console` for `src/**` (allow in test/scripts)

## 3. Strip PII from logs

- [ ] 3.1 `src/socket/index.ts:231,386,530,581,650` — replace email/content with userId/roomId
- [ ] 3.2 Audit auth flow logs (login attempts, password reset)
- [ ] 3.3 Audit user CRUD logs

## 4. Optional: Logger redaction wrapper

- [ ] 4.1 Add `src/utils/logger.ts` redaction layer
- [ ] 4.2 Define field blocklist
- [ ] 4.3 Wire wrapper in modules importing logger

## 5. Request ID propagation

- [ ] 5.1 Verify `requestId` middleware exists or add it
- [ ] 5.2 Include `requestId` in errorHandler logs
- [ ] 5.3 Include in socket auth logs

## 6. Strip emoji from production logs

- [ ] 6.1 `src/server.ts:28-30` — remove emoji
- [ ] 6.2 `src/socket/index.ts:654` — same
- [ ] 6.3 `src/config/mongodb.ts:9-13` — same
- [ ] 6.4 Audit `console.log` (CLI scripts can keep emoji)

## 7. Tests

- [ ] 7.1 Static test: grep for PII fields in logger calls
- [ ] 7.2 Test: redaction wrapper drops blocked fields

## 8. Verify

- [ ] 8.1 `npm test` passing
- [ ] 8.2 `grep "console\." src/middleware src/services src/socket | wc -l` is 0
- [ ] 8.3 `openspec validate core-api-pii-and-logging-hygiene --strict`
