import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SocketRateLimiter } from './socketRateLimiter.js';

describe('SocketRateLimiter', () => {
    let limiter: SocketRateLimiter;

    beforeEach(() => {
        limiter = new SocketRateLimiter();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('allows 10 send_message events within 10s', () => {
        for (let i = 0; i < 10; i++) {
            expect(limiter.isAllowed('socket-1', 'send_message')).toBe(true);
        }
    });

    it('blocks the 11th send_message within 10s', () => {
        for (let i = 0; i < 10; i++) {
            limiter.isAllowed('socket-1', 'send_message');
        }
        expect(limiter.isAllowed('socket-1', 'send_message')).toBe(false);
    });

    it('allows again after window resets', () => {
        for (let i = 0; i < 10; i++) {
            limiter.isAllowed('socket-1', 'send_message');
        }
        expect(limiter.isAllowed('socket-1', 'send_message')).toBe(false);

        vi.advanceTimersByTime(10001);
        expect(limiter.isAllowed('socket-1', 'send_message')).toBe(true);
    });

    it('cleanup removes all state for socket', () => {
        for (let i = 0; i < 10; i++) {
            limiter.isAllowed('socket-1', 'send_message');
        }
        limiter.cleanup('socket-1');
        expect(limiter.isAllowed('socket-1', 'send_message')).toBe(true);
    });

    it('recordViolation returns total violations in 1 minute', () => {
        expect(limiter.recordViolation('socket-1')).toBe(1);
        expect(limiter.recordViolation('socket-1')).toBe(2);
        expect(limiter.recordViolation('socket-1')).toBe(3);
    });

    it('recordViolation reaches disconnect threshold at 3', () => {
        limiter.recordViolation('socket-1');
        limiter.recordViolation('socket-1');
        const count = limiter.recordViolation('socket-1');
        expect(count).toBeGreaterThanOrEqual(limiter.disconnectThreshold);
    });

    it('allows unknown events without rate limiting', () => {
        for (let i = 0; i < 100; i++) {
            expect(limiter.isAllowed('socket-1', 'unknown_event')).toBe(true);
        }
    });
});
