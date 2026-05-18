# AI Circuit Breaker Correctness

## MODIFIED Requirements

### Requirement: Circuit breaker MUST count only retryable failures

The circuit breaker SHALL classify errors before incrementing failure count. Non-retryable errors (HTTP 4xx, validation, parsing) MUST NOT trigger the breaker.

#### Scenario: 4xx validation error

- Given AI Engine returns HTTP 422 for a malformed request
- When the service catches the error
- Then `breaker.state` MUST remain unchanged
- And the failure count MUST NOT be incremented
- And the error MUST still propagate to the caller

#### Scenario: Network error

- Given AI Engine connection fails with network error
- When the service catches the error
- Then the breaker MUST count this as a failure
- And after threshold consecutive network errors, breaker MUST transition to OPEN

### Requirement: All AI Engine calls MUST go through circuit breaker

Every AI Engine HTTP call SHALL be wrapped with circuit breaker logic, including `trackActivity`. No direct `fetch` or `fetchWithTimeout` to AI Engine MAY exist outside the breaker.

#### Scenario: trackActivity goes through breaker

- Given the breaker is OPEN
- When `trackActivity` is invoked
- Then the call MUST short-circuit with `CircuitOpenError`
- And no HTTP request MUST be made

### Requirement: Health checks MUST NOT pollute breaker state

The `isAvailable` health check SHALL bypass the failure counter. A failed health probe MUST NOT contribute to opening the breaker.

#### Scenario: Health probe with breaker open

- Given the breaker is OPEN
- When `isAvailable()` is called
- Then the probe MUST execute (bypass open-state rejection)
- And probe failure MUST NOT increment the failure counter

### Requirement: Breaker transitions MUST log with reason

State transition logs SHALL use format `Circuit breaker [state]: [reason]` and include consecutive failure count.

#### Scenario: Breaker opens

- Given the breaker just transitioned to OPEN
- When the transition is logged
- Then the log message MUST contain "Circuit breaker OPEN: <reason>"
- And metadata MUST include `consecutiveFailures` count and endpoint name
