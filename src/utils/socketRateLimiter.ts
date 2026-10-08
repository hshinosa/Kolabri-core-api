interface EventLimit {
    maxRequests: number;
    windowMs: number;
}

// Batas LONGGAR (rancangan Spesifikasi-Batas-RateLimit-Kolabri §4):
//   - send_message     : 120/menit per koneksi (manusia <10/menit; sisanya
//                        margin utk burst & uji beban)
//   - send_message_ai  : 180/menit per koneksi — PALING longgar dari sisi
//                        socket sesuai permintaan; kuota harian AI tetap jadi
//                        batas utama pemakaian AI
//   - join_room        : 30/menit (navigasi normal jauh di bawah ini)
// Env: SOCKET_MSG_RATE_MAX / SOCKET_AI_RATE_MAX utk penyesuaian tanpa deploy.
const envNum = (name: string, fallback: number): number =>
    Number(process.env[name]) || fallback;

const EVENT_LIMITS: Record<string, EventLimit> = {
    send_message: {
        maxRequests: envNum("SOCKET_MSG_RATE_MAX", 120),
        windowMs: 60000,
    },
    send_message_ai: {
        maxRequests: envNum("SOCKET_AI_RATE_MAX", 180),
        windowMs: 60000,
    },
    join_room: { maxRequests: 30, windowMs: 60000 },
    typing: { maxRequests: 30, windowMs: 10000 },
    leave_room: { maxRequests: 30, windowMs: 60000 },
    delete_message: { maxRequests: 30, windowMs: 60000 },
    edit_message: { maxRequests: 30, windowMs: 60000 },
    load_more_messages: { maxRequests: 30, windowMs: 60000 },
};

const VIOLATION_WINDOW_MS = 60000;
const DISCONNECT_THRESHOLD = 3;

// Matikan sementara (env SOCKET_RATE_LIMIT=0): semua event socket lolos tanpa
// dibatasi — dipakai saat menonaktifkan anti-spam untuk penggunaan internal.
const SOCKET_RATE_LIMIT_ENABLED = process.env.SOCKET_RATE_LIMIT !== "0";

export class SocketRateLimiter {
    private timestamps = new Map<string, Map<string, number[]>>();
    private violations = new Map<string, number[]>();

    isAllowed(socketId: string, event: string): boolean {
        if (!SOCKET_RATE_LIMIT_ENABLED) return true;
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
        if (!SOCKET_RATE_LIMIT_ENABLED) return 0;
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

// Pemilihan event rate untuk pesan chat: mention @ai memakai limit terpisah
// yang lebih longgar (SOCKET_AI_RATE_MAX) — diuji unit tanpa server socket.
export function pickRateEvent(content: string | undefined): "send_message" | "send_message_ai" {
    return typeof content === "string" && content.includes("@ai")
        ? "send_message_ai"
        : "send_message";
}

export const socketRateLimiter = new SocketRateLimiter();
