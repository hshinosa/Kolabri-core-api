# Design

## PII Field Whitelist

Allowed in logs:
- User IDs (UUID/CUID)
- Room IDs / chatSpace IDs
- Course IDs / Group IDs
- Event names
- Status codes
- Timestamps
- Request IDs

Forbidden in logs:
- Email addresses
- User names (display name OK if anonymized at aggregator)
- Message content (any preview)
- JWT tokens
- Refresh tokens
- Passwords (obviously)
- Phone numbers
- File contents
- Stack traces with user data

## Replacement Patterns

```typescript
// BEFORE
logger.info("User logged in", { email: user.email, userId: user.id });

// AFTER
logger.info("user_login", { userId: user.id });
```

```typescript
// BEFORE
logger.info(`Message sent: ${content.slice(0, 50)}`, { ... });

// AFTER
logger.info("message_sent", { messageId, roomId, userId, contentLength: content.length });
```

## Logger Wrapper with Redaction (Optional)

```typescript
// src/utils/logger.ts
const REDACT_FIELDS = ["email", "password", "token", "content", "messageContent"];

function redact(obj: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
        out[k] = REDACT_FIELDS.includes(k.toLowerCase()) ? "[REDACTED]" : v;
    }
    return out;
}

export const logger = {
    info: (msg: string, meta?: Record<string, unknown>) =>
        winston.info(msg, meta ? redact(meta) : undefined),
    error: (msg: string, meta?: Record<string, unknown>) =>
        winston.error(msg, meta ? redact(meta) : undefined),
    warn: (msg: string, meta?: Record<string, unknown>) =>
        winston.warn(msg, meta ? redact(meta) : undefined),
};
```

## Request ID Propagation

```typescript
// src/middleware/requestId.ts
export function requestIdMiddleware(req, res, next) {
    const requestId = req.headers["x-request-id"] || randomUUID();
    req.context = { requestId };
    res.setHeader("x-request-id", requestId);
    next();
}

// In errorHandler:
logger.error("unhandled_error", {
    requestId: req.context?.requestId,
    error: err.message,
    stack: err.stack,
});
```

## Static Test

```typescript
// tests/lint/no-pii-logs.test.ts
test("no email field in logger.* calls", () => {
    const matches = grep("email:", "src/");
    const violations = matches.filter(m => /logger\.(info|warn|error|debug)/.test(m.context));
    expect(violations).toEqual([]);
});
```
