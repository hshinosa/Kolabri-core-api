import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CircuitBreaker, withRetry, isRetryableError } from './circuitBreaker.js';
import { logger } from './logger.js';

vi.mock('./logger.js', () => ({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

describe('CircuitBreaker', () => {
    let cb: CircuitBreaker;

    beforeEach(() => {
        cb = new CircuitBreaker({ failureThreshold: 5, cooldownMs: 30000 });
    });

    it('starts in CLOSED state and passes through successful calls', async () => {
        const fn = vi.fn().mockResolvedValue('ok');
        const result = await cb.execute(fn);
        expect(result).toBe('ok');
        expect(cb.getState()).toBe('CLOSED');
    });

    it('opens after 5 consecutive failures', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('fail'));
        for (let i = 0; i < 5; i++) {
            await expect(cb.execute(fn)).rejects.toThrow('fail');
        }
        expect(cb.getState()).toBe('OPEN');
    });

    it('rejects immediately when circuit is OPEN without calling fn', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('fail'));
        for (let i = 0; i < 5; i++) {
            await expect(cb.execute(fn)).rejects.toThrow();
        }
        fn.mockClear();
        await expect(cb.execute(fn)).rejects.toThrow('circuit open');
        expect(fn).not.toHaveBeenCalled();
    });

    it('transitions to HALF_OPEN after cooldown and closes on success', async () => {
        vi.useFakeTimers();
        const fn = vi.fn().mockRejectedValue(new Error('fail'));
        for (let i = 0; i < 5; i++) {
            await expect(cb.execute(fn)).rejects.toThrow();
        }
        expect(cb.getState()).toBe('OPEN');

        vi.advanceTimersByTime(30001);
        fn.mockResolvedValue('ok');
        const result = await cb.execute(fn);
        expect(result).toBe('ok');
        expect(cb.getState()).toBe('CLOSED');
        vi.useRealTimers();
    });

    it('stays OPEN after failed probe in HALF_OPEN state', async () => {
        vi.useFakeTimers();
        const fn = vi.fn().mockRejectedValue(new Error('fail'));
        for (let i = 0; i < 5; i++) {
            await expect(cb.execute(fn)).rejects.toThrow();
        }
        vi.advanceTimersByTime(30001);
        await expect(cb.execute(fn)).rejects.toThrow();
        expect(cb.getState()).toBe('OPEN');
        vi.useRealTimers();
    });

    it('redacts credentials in logged circuit-breaker reasons', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('provider_context {"credential":"sk-secret-123"}'));
        for (let i = 0; i < 5; i++) {
            await expect(cb.execute(fn)).rejects.toThrow();
        }
        expect(logger.warn).toHaveBeenLastCalledWith(
            expect.stringContaining('[REDACTED]')
        );
        expect(logger.warn).not.toHaveBeenLastCalledWith(
            expect.stringContaining('sk-secret-123')
        );
    });
});

describe('withRetry', () => {
    it('returns result on first success', async () => {
        const fn = vi.fn().mockResolvedValue('done');
        const result = await withRetry(fn, 3);
        expect(result).toBe('done');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on retryable error and succeeds', async () => {
        const fn = vi.fn()
            .mockRejectedValueOnce(new Error('AI Engine responded with 503'))
            .mockResolvedValue('ok');
        const result = await withRetry(fn, 3);
        expect(result).toBe('ok');
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('does not retry on 4xx errors', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('AI Engine responded with 400'));
        await expect(withRetry(fn, 3)).rejects.toThrow('400');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('throws after max retries exhausted', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('AI Engine responded with 503'));
        await expect(withRetry(fn, 2)).rejects.toThrow('503');
        expect(fn).toHaveBeenCalledTimes(3);
    });
});

describe('isRetryableError', () => {
    it('returns true for 502/503/504', () => {
        expect(isRetryableError(new Error('AI Engine responded with 502'))).toBe(true);
        expect(isRetryableError(new Error('AI Engine responded with 503'))).toBe(true);
        expect(isRetryableError(new Error('AI Engine responded with 504'))).toBe(true);
    });

    it('returns false for 4xx', () => {
        expect(isRetryableError(new Error('AI Engine responded with 400'))).toBe(false);
        expect(isRetryableError(new Error('AI Engine responded with 404'))).toBe(false);
    });

    it('returns false for timeout/abort errors', () => {
        const abortErr = new Error('aborted');
        abortErr.name = 'AbortError';
        expect(isRetryableError(abortErr)).toBe(false);
    });

    it('returns true for network errors', () => {
        expect(isRetryableError(new Error('fetch failed'))).toBe(true);
    });
});
