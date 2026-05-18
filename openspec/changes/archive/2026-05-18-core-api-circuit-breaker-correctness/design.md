# Design

## Error Classification

```typescript
// src/utils/circuitBreaker.ts
function isRetryable(error: unknown): boolean {
    if (error instanceof TimeoutError) return true;
    if (error instanceof NetworkError) return true;
    if (error instanceof HttpError && error.status >= 500) return true;
    return false; // 4xx, validation, parsing → don't count
}

async execute(fn) {
    try {
        return await fn();
    } catch (err) {
        if (isRetryable(err)) {
            this.recordFailure(err);
        }
        throw err;
    }
}
```

## Custom Error Classes

```typescript
// src/utils/aiEngineErrors.ts
export class AiEngineHttpError extends Error {
    constructor(public status: number, message: string) { super(message); }
}

// In aiEngine.service.ts
if (!response.ok) {
    throw new AiEngineHttpError(response.status, await response.text());
}
```

## trackActivity Wrap

```typescript
async trackActivity(payload) {
    return this.resilient(
        async () => fetchWithTimeout(...),
        true, // record failures
        "trackActivity"
    );
}
```

## Health Check Isolation

Add `bypassCircuit: true` flag to `resilient()`:
```typescript
async isAvailable(): Promise<boolean> {
    try {
        await this.resilient(() => fetchWithTimeout(...), false, "health");
        return true;
    } catch {
        return false;
    }
}
```

When `bypassCircuit: true`, the breaker NEITHER counts failures NOR rejects calls in OPEN state — health probe always allowed.

## Log Format Alignment

```typescript
// src/utils/circuitBreaker.ts
private transition(next: State, reason: string) {
    logger.warn(`Circuit breaker ${next}: ${reason}`, {
        prev: this.state,
        next,
        reason,
        consecutiveFailures: this.failures,
    });
    this.state = next;
}
```

## Test Strategy

```typescript
test("4xx response does not increment breaker", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 422, text: () => "validation" });
    for (let i = 0; i < 10; i++) {
        await expect(aiEngine.askQuestion(...)).rejects.toThrow();
    }
    expect(breaker.state).toBe("CLOSED");
});

test("network error opens breaker after threshold", async () => {
    mockFetch.mockRejectedValue(new NetworkError());
    for (let i = 0; i < 5; i++) {
        await expect(aiEngine.askQuestion(...)).rejects.toThrow();
    }
    expect(breaker.state).toBe("OPEN");
});
```
