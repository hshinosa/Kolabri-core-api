interface EventLimit {
    maxRequests: number;
    windowMs: number;
}

const EVENT_LIMITS: Record<string, EventLimit> = {
    send_message:   { maxRequests: 10, windowMs: 10000 },
    join_room:      { maxRequests: 5,  windowMs: 60000 },
    typing:         { maxRequests: 30, windowMs: 10000 },
    leave_room:     { maxRequests: 10, windowMs: 60000 },
    delete_message: { maxRequests: 20, windowMs: 60000 },
    load_more_messages: { maxRequests: 20, windowMs: 60000 },
};

const VIOLATION_WINDOW_MS = 60000;
const DISCONNECT_THRESHOLD = 3;

export class SocketRateLimiter {
    private timestamps = new Map<string, Map<string, number[]>>();
    private violations = new Map<string, number[]>();

    isAllowed(socketId: string, event: string): boolean {
        const limit = EVENT_LIMITS[event];
        if (!limit) return true;

        const now = Date.now();
        const cutoff = now - limit.windowMs;

        if (!this.timestamps.has(socketId)) {
            this.timestamps.set(socketId, new Map());
        }
        const socketEvents = this.timestamps.get(socketId)!;

        const times = (socketEvents.get(event) ?? []).filter(t => t > cutoff);
        socketEvents.set(event, times);

        if (times.length >= limit.maxRequests) {
            return false;
        }

        times.push(now);
        return true;
    }

    getRetryAfter(socketId: string, event: string): number {
        const limit = EVENT_LIMITS[event];
        if (!limit) return 0;

        const socketEvents = this.timestamps.get(socketId);
        if (!socketEvents) return 0;

        const times = socketEvents.get(event) ?? [];
        if (times.length === 0) return 0;

        const oldest = times[0];
        const retryAt = oldest + limit.windowMs;
        return Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
    }

    recordViolation(socketId: string): number {
        const now = Date.now();
        const cutoff = now - VIOLATION_WINDOW_MS;
        const times = (this.violations.get(socketId) ?? []).filter(t => t > cutoff);
        times.push(now);
        this.violations.set(socketId, times);
        return times.length;
    }

    cleanup(socketId: string): void {
        this.timestamps.delete(socketId);
        this.violations.delete(socketId);
    }

    get disconnectThreshold(): number {
        return DISCONNECT_THRESHOLD;
    }
}

export const socketRateLimiter = new SocketRateLimiter();
