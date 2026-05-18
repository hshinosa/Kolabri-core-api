# AI Circuit Breaker Correctness

## Problem Statement

Multiple drift points between `core-api-ai-engine-resilience` spec and implementation:

1. **HTTP 4xx triggers breaker** — service throws on `!response.ok`, breaker counts client errors as failures (`src/services/aiEngine.service.ts:281,627,764`, `src/utils/circuitBreaker.ts:36-38`)
2. **`trackActivity` bypasses breaker** — direct `fetchWithTimeout` call (`src/services/aiEngine.service.ts:740-748`)
3. **Health check via breaker** — repeated `isAvailable` calls increment failure count when probe fails (`src/services/aiEngine.service.ts:237-247`)
4. **Log format drift** — spec says `Circuit breaker [state]: [reason]` but impl logs `Circuit breaker: ${prev} → ${next}` without reason (`src/utils/circuitBreaker.ts:69`)

Effect: breaker can open due to 400/422 validation errors, blocking all AI traffic. Health checks pollute counters. trackActivity failures invisible to breaker.

## Proposed Solution

1. Differentiate retryable vs non-retryable failures in `CircuitBreaker.execute`
2. Wrap `trackActivity` with breaker (or document explicit non-breaker exemption)
3. Make health check counts not pollute breaker state
4. Update log format to match spec

## Scope

- `src/utils/circuitBreaker.ts` — error classification
- `src/services/aiEngine.service.ts` — wrap `trackActivity`, separate health check counter
- Logging format alignment
- Tests for 4xx-not-counted, trackActivity-counted, health-isolated
