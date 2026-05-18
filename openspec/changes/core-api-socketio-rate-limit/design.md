## Context

Socket.IO handler ada di `src/socket/index.ts`. Saat ini tidak ada rate limiting pada event apapun. `express-rate-limit` yang sudah ada hanya berlaku untuk HTTP routes, tidak untuk Socket.IO events. Deployment saat ini adalah single instance.

## Goals / Non-Goals

**Goals:**
- Per-socket per-event rate limiting menggunakan in-memory counter
- Emit error event ke client saat rate limit terlampaui
- Disconnect socket otomatis untuk abuse yang parah

**Non-Goals:**
- Distributed rate limiting via Redis (single instance cukup)
- Rate limiting untuk admin/system sockets
- Persistent rate limit state across server restarts

## Decisions

**1. In-memory Map, bukan Redis**
`Map<socketId, Map<eventName, { count: number, resetAt: number }>>` cukup untuk single-instance deployment. Redis menambah complexity dan latency untuk use case ini.
Alternatif ditolak: Redis — overkill untuk single instance.

**2. Sliding window bukan fixed window**
Fixed window lebih sederhana tapi bisa di-exploit (burst di akhir window). Sliding window lebih fair. Implementasi: simpan timestamp array per socket per event, filter yang sudah expired.
Alternatif ditolak: token bucket — lebih complex untuk implement.

**3. Limits per event type**
| Event | Limit | Window |
|---|---|---|
| `send_message` | 10 | 10s |
| `join_room` | 5 | 60s |
| `typing` | 30 | 10s |
| `leave_room` | 10 | 60s |

**4. Response: emit `rate_limit_exceeded`, bukan silent drop**
Client perlu tahu request-nya di-reject agar bisa show feedback ke user. Emit `{ event, retryAfter }` ke socket yang bersangkutan.

**5. Disconnect threshold: 3x limit dalam 1 menit**
Jika socket melebihi 3x limit dalam 1 menit → disconnect. Ini untuk mencegah abuse yang terus-menerus.

**6. Cleanup on disconnect**
Hapus entry dari Map saat socket disconnect untuk mencegah memory leak.

## Risks / Trade-offs

- **[Risk] Memory leak jika cleanup tidak berjalan** → Mitigation: cleanup di `socket.on('disconnect')` handler.
- **[Risk] Legitimate burst traffic (misal: paste panjang dipecah jadi banyak message)** → Mitigation: limit 10/10s cukup longgar untuk penggunaan normal.
- **[Risk] In-memory tidak work untuk multi-instance** → Mitigation: acceptable untuk deployment saat ini. Jika scale out, migrate ke Redis.

## Migration Plan

1. Tambah `RateLimiter` class di `src/utils/socketRateLimiter.ts`
2. Update `src/socket/index.ts` — wrap event handlers dengan rate limiter
3. Update client app untuk handle `rate_limit_exceeded` event (UI feedback)
4. Deploy — tidak ada breaking change untuk normal usage
