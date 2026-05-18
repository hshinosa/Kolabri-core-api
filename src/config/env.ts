import { z } from 'zod';

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    MONGODB_URL: z.string().min(1, 'MONGODB_URL is required'),

    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_EXPIRES_IN: z.string().default('7d'),
    JWT_REFRESH_SECRET: z.string().min(32).optional(),

    AI_ENGINE_URL: z.string().url('AI_ENGINE_URL must be a valid URL'),
    AI_ENGINE_SECRET: z.string().optional().default(''),

    CORE_API_SECRET: z.string().min(16, 'CORE_API_SECRET must be at least 16 characters'),

    CLIENT_URL: z.string().url('CLIENT_URL must be a valid URL').default('http://localhost:8080'),

    ENCRYPTION_KEY: z
        .string()
        .length(32, 'ENCRYPTION_KEY must be exactly 32 characters')
        .optional(),

    MAX_FILE_SIZE_MB: z.coerce.number().int().positive().default(10),
    UPLOAD_DIR: z.string().default('./uploads'),

    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),

    REDIS_URL: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv = process.env) {
    return envSchema.safeParse(source);
}

export function formatEnvError(error: z.ZodError): string {
    const lines = error.issues.map((issue) => {
        const path = issue.path.join('.');
        return `  - ${path || '<root>'}: ${issue.message}`;
    });
    return `Invalid environment configuration:\n${lines.join('\n')}`;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
    const result = parseEnv(source);
    if (!result.success) {
        throw new Error(formatEnvError(result.error));
    }
    return result.data;
}

// Cache so importers see one validated snapshot. Tests mutating process.env
// between cases must call _resetEnvCache() to re-read.
let cached: Env | null = null;
export function getEnv(): Env {
    if (!cached) {
        cached = loadEnv();
    }
    return cached;
}

export function _resetEnvCache(): void {
    cached = null;
}
