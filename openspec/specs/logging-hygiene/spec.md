# logging-hygiene Specification

## Purpose
TBD - created by archiving change core-api-pii-and-logging-hygiene. Update Purpose after archive.
## Requirements
### Requirement: Production code MUST use logger, not console

All log calls in `src/` (excluding tests and CLI scripts) SHALL use the Winston logger. Direct `console.*` calls MUST NOT exist in production code.

#### Scenario: Error handler logs unhandled error

- Given an unhandled error reaches the global error handler
- When the handler logs the error
- Then it MUST use `logger.error(...)`
- And it MUST NOT use `console.error(...)`
- And the log MUST include `requestId` from request context

### Requirement: PII MUST NOT appear in logs

Log entries SHALL NOT contain email addresses, message content, JWT tokens, passwords, or phone numbers. User identification MUST use opaque IDs (UUID/CUID).

#### Scenario: Socket.IO message handler logs send

- Given a user sends a message
- When the handler logs the action
- Then the log MUST include `userId`, `roomId`, `messageId`, `contentLength`
- And MUST NOT include `email`, `displayName`, or any portion of the message content

#### Scenario: Auth flow logs failure

- Given a login attempt fails
- When the handler logs the failure
- Then the log MUST include `userId` (if known) or hashed identifier
- And MUST NOT include the submitted email or password

### Requirement: Logs MUST include request correlation ID

Every error log SHALL include `requestId` so log entries can be traced back to a specific HTTP request.

#### Scenario: Error log without explicit requestId

- Given an error handler logs an exception
- When the log entry is emitted
- Then it MUST include `requestId` from `req.context` or socket data
- And the request response MUST include the same `x-request-id` header

