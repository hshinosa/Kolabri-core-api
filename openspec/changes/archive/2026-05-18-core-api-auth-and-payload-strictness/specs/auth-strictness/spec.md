# Auth and Payload Strictness

## ADDED Requirements

### Requirement: Login rate limit MUST be strict

Login endpoint rate limit SHALL be at most 5 failed attempts per 15 minutes per IP. Successful logins SHALL NOT count against the limit.

#### Scenario: Brute force attempt

- Given an attacker tries 6 wrong passwords within 15 minutes
- When the 6th attempt arrives
- Then the response MUST be 429 Too Many Requests
- And `Retry-After` header MUST be present

#### Scenario: Legitimate user with typos

- Given a user makes 3 failed attempts then 1 successful login
- When they make additional successful logins
- Then those MUST NOT count against the 5-attempt limit (skipSuccessfulRequests)

### Requirement: Send message MUST require content or attachment

The `send_message` Socket.IO event SHALL reject payloads with empty content AND no attachments via `validation_error` event.

#### Scenario: Empty message

- Given a user emits `send_message` with `content=""` and `attachments=[]`
- When the server validates
- Then the server MUST emit `validation_error` event with reason
- And MUST NOT silently return without feedback

### Requirement: AI Engine auth header MUST be consistent

Core API SHALL use a single auth header convention for all AI Engine calls (either all `Authorization: Bearer` OR all `X-API-Key`). The chosen convention MUST match what AI Engine middleware expects.

#### Scenario: AI Engine endpoint call

- Given Core API calls any AI Engine endpoint
- When the request is built
- Then the auth header MUST follow the unified convention
- And AI Engine MUST accept the call without 401
