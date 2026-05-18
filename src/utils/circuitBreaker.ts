import { logger } from './logger.js';

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerOptions {
    failureThreshold?: number;
    cooldownMs?: number;
}

export class CircuitBreaker {
    private state: CircuitState = 'CLOSED';
    private consecutiveFailures = 0;
    private openedAt: number | null = null;
    private readonly failureThreshold: number;
    private readonly cooldownMs: number;

    constructor(options: CircuitBreakerOptions = {}) {
        this.failureThreshold = options.failureThreshold ?? 5;
        this.cooldownMs = options.cooldownMs ?? 30000;
    }

    async execute<T>(fn: () => Promise<T>): Promise<T> {
        if (this.state === 'OPEN') {
            const elapsed = Date.now() - (this.openedAt ?? 0);
            if (elapsed >= this.cooldownMs) {
                this.transitionTo('HALF_OPEN');
            } else {
                throw new Error('AI service temporarily unavailable (circuit open)');
            }
        }

        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }

    private onSuccess(): void {
        if (this.state === 'HALF_OPEN') {
            this.transitionTo('CLOSED');
        }
        this.consecutiveFailures = 0;
    }

    private onFailure(): void {
        this.consecutiveFailures++;
        if (this.state === 'HALF_OPEN') {
            this.transitionTo('OPEN');
            return;
        }
        if (this.consecutiveFailures >= this.failureThreshold) {
            this.transitionTo('OPEN');
        }
    }

    private transitionTo(next: CircuitState): void {
        const prev = this.state;
        this.state = next;
        if (next === 'OPEN') {
            this.openedAt = Date.now();
        } else if (next === 'CLOSED') {
            this.consecutiveFailures = 0;
            this.openedAt = null;
        }
        logger.warn(`Circuit breaker: ${prev} → ${next}`);
    }

    getState(): CircuitState {
        return this.state;
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
});
