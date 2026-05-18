# Design

## Auth Rate Limit Tightening

```typescript
// src/middleware/rateLimiter.ts
export const loginRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: "too_many_login_attempts" },
    standardHeaders: true,
    skipSuccessfulRequests: true, // only count failed attempts
});

export const registerRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    message: { error: "too_many_register_attempts" },
});
```

```typescript
// src/routes/auth.routes.ts
router.post("/login", loginRateLimiter, ...);
router.post("/register", registerRateLimiter, ...);
```

## Send Message Schema Refinement

```typescript
// src/validators/socket.validator.ts
export const sendMessageSchema = z
    .object({
        roomId: z.string().min(1),
        content: z.string().max(10_000).default(""),
        replyTo: z.object({...}).optional(),
        attachments: z.array(attachmentSchema).max(10).default([]),
    })
    .refine(
        (data) => data.content.trim().length > 0 || data.attachments.length > 0,
        { message: "Message must have content or attachments" }
    );
```

```typescript
// src/socket/messages.ts (after decomposition)
const result = sendMessageSchema.safeParse(payload);
if (!result.success) {
    socket.emit("validation_error", {
        event: "send_message",
        errors: result.error.flatten().fieldErrors,
    });
    return;
}
```

## AI Engine Auth Audit

Confirm with AI Engine spec which auth header is expected:

```bash
# Check AI Engine routes
grep -rn "Bearer\|X-API-Key" /path/to/ai-engine/app/api/
```

If AI Engine accepts both: keep current. If only one: unify.

If unified to `Authorization: Bearer <core-api-secret>`:

```typescript
// src/services/aiEngine.service.ts
private getAuthHeaders(): HeadersInit {
    return {
        "Authorization": `Bearer ${env.AI_ENGINE_SECRET}`,
        "Content-Type": "application/json",
    };
}
```
