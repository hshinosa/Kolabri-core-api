## 1. Pre-flight

- [x] 1.1 Run baseline: `npm test`
- [x] 1.2 Read `src/utils/circuitBreaker.ts`, `src/services/aiEngine.service.ts`

## 2. Add error classification

- [x] 2.1 Created `AiEngineHttpError`, `AiEngineNetworkError`, `AiEngineTimeoutError` classes
- [ ] 2.2 Update `aiEngine.service.ts` to throw these instead of generic Error (deferred — `isBreakerFailure` parses generic `responded with N` messages, so the runtime behavior is correct without changing every callsite; future change can migrate)
- [x] 2.3 Added `isBreakerFailure()` helper in `circuitBreaker.ts`

## 3. Update CircuitBreaker.execute

- [x] 3.1 Wrapped catch with classification via `isBreakerFailure`
- [x] 3.2 Only call `recordFailure` when `isBreakerFailure` returns true (4xx-non-429 ignored)
- [x] 3.3 Added `bypassCircuit` option

## 4. Wire trackActivity through breaker

- [x] 4.1 `aiEngine.service.ts:740-748` — wrapped with `this.resilient(..., false)` so timeouts/network errors are counted

## 5. Isolate health check

- [x] 5.1 `isAvailable()` uses `bypassCircuit: true`
- [x] 5.2 Health probe failures are NOT counted in main breaker

## 6. Update logging

- [x] 6.1 New format: `Circuit breaker ${next} [${name}]: ${reason} (failures=${count})`
- [x] 6.2 Includes consecutive failure count
- [x] 6.3 Includes breaker name (`ai-engine`)

## 7. Tests

- [x] 7.1 Test: 422 response → CLOSED (6 such errors don't open the breaker)
- [x] 7.2 Test: network error → OPEN after threshold
- [ ] 7.3 Test: trackActivity timeout counted (deferred — covered by integration `isBreakerFailure` for `TimeoutError`)
- [x] 7.4 Test: bypassCircuit (proxies health-check pattern) does not affect counter

## 8. Verify

- [x] 8.1 `npm test` for affected suites passes (circuitBreaker 13 + classification 8 + aiEngine.service 23)
- [x] 8.2 `openspec validate core-api-circuit-breaker-correctness --strict`
