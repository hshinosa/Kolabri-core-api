import { describe, expect, it } from 'vitest';
import {
    AiEngineHttpError,
    AiEngineNetworkError,
    AiEngineTimeoutError,
    CircuitBreaker,
    isBreakerFailure,
} from './circuitBreaker.js';

describe('isBreakerFailure', () => {
    it('does NOT count 4xx HTTP errors (except 429)', () => {
        expect(isBreakerFailure(new AiEngineHttpError(400, 'bad'))).toBe(false);
        expect(isBreakerFailure(new AiEngineHttpError(401, 'unauth'))).toBe(false);
        expect(isBreakerFailure(new AiEngineHttpError(404, 'nf'))).toBe(false);
        expect(isBreakerFailure(new AiEngineHttpError(422, 'invalid'))).toBe(false);
    });

    it('counts 429 as failure (upstream overload)', () => {
        expect(isBreakerFailure(new AiEngineHttpError(429, 'rl'))).toBe(true);
    });

    it('counts 5xx HTTP errors', () => {
        expect(isBreakerFailure(new AiEngineHttpError(500, 'oops'))).toBe(true);
        expect(isBreakerFailure(new AiEngineHttpError(502, 'bg'))).toBe(true);
        expect(isBreakerFailure(new AiEngineHttpError(503, 'unavailable'))).toBe(true);
    });

    it('counts network and timeout errors', () => {
        expect(isBreakerFailure(new AiEngineNetworkError('ECONNREFUSED'))).toBe(true);
        expect(isBreakerFailure(new AiEngineTimeoutError())).toBe(true);
    });

    it('parses status from legacy "responded with N" error messages', () => {
        expect(isBreakerFailure(new Error('AI Engine responded with 422: bad'))).toBe(false);
        expect(isBreakerFailure(new Error('AI Engine responded with 503: down'))).toBe(true);
    });
});

describe('CircuitBreaker.execute', () => {
    it('does not open the circuit when only 4xx errors occur', async () => {
        const breaker = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000, name: 't' });
        for (let i = 0; i < 5; i++) {
            await expect(
                breaker.execute(async () => {
                    throw new AiEngineHttpError(422, 'invalid');
                }),
            ).rejects.toBeInstanceOf(AiEngineHttpError);
        }
        expect(breaker.getState()).toBe('CLOSED');
    });

    it('opens the circuit on consecutive network errors', async () => {
        const breaker = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000, name: 't' });
        for (let i = 0; i < 3; i++) {
            await expect(
                breaker.execute(async () => {
                    throw new AiEngineNetworkError('ECONNREFUSED');
                }),
            ).rejects.toBeInstanceOf(AiEngineNetworkError);
        }
        expect(breaker.getState()).toBe('OPEN');
    });

    it('bypassCircuit lets calls through without affecting counters', async () => {
        const breaker = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 1000, name: 't' });
        for (let i = 0; i < 5; i++) {
            await expect(
                breaker.execute(
                    async () => {
                        throw new AiEngineNetworkError('down');
                    },
                    { bypassCircuit: true },
                ),
            ).rejects.toBeInstanceOf(AiEngineNetworkError);
        }
        expect(breaker.getState()).toBe('CLOSED');
    });
});
