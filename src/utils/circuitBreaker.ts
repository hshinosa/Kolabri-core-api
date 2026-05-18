import { logger } from './logger.js';

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerOptions {
    failureThreshold?: number;
    cooldownMs?: number;
    name?: string;
}

interface ExecuteOptions {
    bypassCircuit?: boolean;
    isFailure?: (error: unknown) => boolean;
}

export class AiEngineHttpError extends Error {
    constructor(public status: number, message: string) {
        super(message);
        this.name = 'AiEngineHttpError';
    }
}

export class AiEngineNetworkError extends Error {
    constructor(message: string, public cause?: unknown) {
        super(message);
        this.name = 'AiEngineNetworkError';
    }
}

export class AiEngineTimeoutError extends Error {
    constructor(message = 'AI Engine request timed out') {
        super(message);
        this.name = 'AiEngineTimeoutError';
    }
}

// 4xx (except 429) means the *caller* sent a bad request; the upstream is
// healthy, so do NOT count toward breaker failures. 429 indicates upstream
// is overloaded; we treat it as a real failure.
export function isBreakerFailure(error: unknown): boolean {
    if (error instanceof AiEngineHttpError) {
        if (error.status >= 400 && error.status < 500 && error.status !== 429) {
            return false;
        }
        return true;
    }
    if (error instanceof AiEngineNetworkError) return true;
    if (error instanceof AiEngineTimeoutError) return true;
    if (error instanceof Error) {
        if (error.name === 'AbortError' || error.name === 'TimeoutError') return true;
        if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) return true;
        const match = error.message.match(/responded with (\d+)/);
        if (match) {
            const status = Number(match[1]);
            if (status >= 400 && status < 500 && status !== 429) return false;
            return true;
        }
    }
    return true;
}

export class CircuitBreaker {
    private state: CircuitState = 'CLOSED';
    private consecutiveFailures = 0;
    private openedAt: number | null = null;
    private readonly failureThreshold: number;
    private readonly cooldownMs: number;
    private readonly name: string;

    constructor(options: CircuitBreakerOptions = {}) {
        this.failureThreshold = options.failureThreshold ?? 5;
        this.cooldownMs = options.cooldownMs ?? 30000;
        this.name = options.name ?? 'circuit';
    }

    async execute<T>(fn: () => Promise<T>, options: ExecuteOptions = {}): Promise<T> {
        if (options.bypassCircuit) {
            return fn();
        }

        if (this.state === 'OPEN') {
            const elapsed = Date.now() - (this.openedAt ?? 0);
            if (elapsed >= this.cooldownMs) {
                this.transitionTo('HALF_OPEN', 'cooldown elapsed');
            } else {
                throw new Error('AI service temporarily unavailable (circuit open)');
            }
        }

        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            const counts = options.isFailure ? options.isFailure(error) : isBreakerFailure(error);
            if (counts) {
                this.onFailure(error);
            }
            throw error;
        }
    }

    private onSuccess(): void {
        if (this.state === 'HALF_OPEN') {
            this.transitionTo('CLOSED', 'probe succeeded');
        }
        this.consecutiveFailures = 0;
    }

    private onFailure(error: unknown): void {
        this.consecutiveFailures++;
        const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        if (this.state === 'HALF_OPEN') {
            this.transitionTo('OPEN', `probe failed (${reason})`);
            return;
        }
        if (this.consecutiveFailures >= this.failureThreshold) {
            this.transitionTo('OPEN', `${this.consecutiveFailures} consecutive failures (${reason})`);
        }
    }

    private transitionTo(next: CircuitState, reason: string): void {
        this.state = next;
        if (next === 'OPEN') {
            this.openedAt = Date.now();
        } else if (next === 'CLOSED') {
            this.consecutiveFailures = 0;
            this.openedAt = null;
        }
        logger.warn(`Circuit breaker ${next} [${this.name}]: ${reason} (failures=${this.consecutiveFailures})`);
    }

    getState(): CircuitState {
        return this.state;
    }

    reset(): void {
        this.state = 'CLOSED';
        this.consecutiveFailures = 0;
        this.openedAt = null;
    }
}

const RETRYABLE_STATUS = new Set([502, 503, 504]);

export async function withRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    isRetryable?: (error: unknown) => boolean
): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            const retryable = isRetryable ? isRetryable(error) : isRetryableError(error);
            if (!retryable || attempt === maxRetries) {
                throw error;
            }

            const delay = 1000 * Math.pow(2, attempt) + Math.floor(Math.random() * 1000);
            await sleep(delay);
        }
    }

    throw lastError;
}

export function isRetryableError(error: unknown): boolean {
    if (error instanceof AiEngineHttpError) {
        return RETRYABLE_STATUS.has(error.status);
    }
    if (error instanceof AiEngineNetworkError) return true;
    if (error instanceof Error) {
        if (error.name === 'AbortError' || error.name === 'TimeoutError') return false;
        if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) return true;
        const match = error.message.match(/responded with (\d+)/);
        if (match) {
            return RETRYABLE_STATUS.has(Number(match[1]));
        }
    }
    return false;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export const aiEngineCircuitBreaker = new CircuitBreaker({
    failureThreshold: 5,
    cooldownMs: 30000,
    name: 'ai-engine',
});
