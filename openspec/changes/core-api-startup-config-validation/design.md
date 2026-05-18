# Design

## Approach

```typescript
// src/config/env.ts (NEW)
import { z } from "zod";

const envSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().url(),
    JWT_SECRET: z.string().min(32, "JWT_SECRET must be ≥32 chars"),
    JWT_EXPIRES_IN: z.string().default("24h"),
    CORE_API_SECRET: z.string().min(32, "CORE_API_SECRET required for webhook auth"),
    AI_ENGINE_URL: z.string().url(),
    AI_ENGINE_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    REDIS_URL: z.string().url().optional(),
    MONGO_URL: z.string().url(),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    CORS_ORIGINS: z.string(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
        const errors = result.error.flatten().fieldErrors;
        console.error("[STARTUP] Invalid environment variables:");
        for (const [key, msgs] of Object.entries(errors)) {
            console.error(`  ${key}: ${msgs?.join(", ")}`);
        }
        process.exit(1);
    }
    return result.data;
}

export const env = loadEnv();
```

```typescript
// src/server.ts (top of file)
import { env } from "./config/env"; // ← this triggers validation at import time
import { app } from "./app";

const port = env.PORT;
app.listen(port, () => {
    console.log(`[startup] listening on :${port}`);
    console.log(`[startup] node_env=${env.NODE_ENV}`);
    console.log(`[startup] ai_engine_url=${env.AI_ENGINE_URL}`);
});
```

## Migration Strategy

Phase 1 (this change): Add validator + import in server.ts. Existing `process.env.X` calls still work.

Phase 2 (optional follow-up): Replace `process.env.X` with `env.X` imports across codebase for type safety and centralized config.

## Test Strategy

```typescript
// tests/config/env.test.ts
test("missing CORE_API_SECRET fails boot", () => {
    delete process.env.CORE_API_SECRET;
    expect(() => loadEnv()).toThrow(/CORE_API_SECRET/);
});
```

Use `child_process.spawn` to test full boot exit code 1 when env invalid.
