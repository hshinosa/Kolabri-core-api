## 1. Pre-flight

- [ ] 1.1 Run baseline: `npm test`
- [ ] 1.2 Read `src/utils/circuitBreaker.ts`, `src/services/aiEngine.service.ts`

## 2. Add error classification

- [ ] 2.1 Create `AiEngineHttpError`, `AiEngineNetworkError`, `AiEngineTimeoutError` classes
- [ ] 2.2 Update `aiEngine.service.ts` to throw these instead of generic Error
- [ ] 2.3 Add `isRetryable()` helper in `circuitBreaker.ts`

## 3. Update CircuitBreaker.execute

- [ ] 3.1 Wrap try/catch with classification
- [ ] 3.2 Only call `recordFailure` for retryable errors
- [ ] 3.3 Add `bypassCircuit` flag

## 4. Wire trackActivity through breaker

- [ ] 4.1 `aiEngine.service.ts:740-748` — wrap with `this.resilient(...)`

## 5. Isolate health check

- [ ] 5.1 `isAvailable()` uses `bypassCircuit: true` flag
- [ ] 5.2 Health probe failures NOT counted in main breaker

## 6. Update logging

- [ ] 6.1 Format: `Circuit breaker ${next}: ${reason}`
- [ ] 6.2 Include consecutive failure count
- [ ] 6.3 Include endpoint name

## 7. Tests

- [ ] 7.1 Test: 422 response → CLOSED
- [ ] 7.2 Test: network error → OPEN after threshold
- [ ] 7.3 Test: trackActivity timeout counted
- [ ] 7.4 Test: health check probe not counted

## 8. Verify

- [ ] 8.1 `npm test` passing
- [ ] 8.2 `openspec validate core-api-circuit-breaker-correctness --strict`
