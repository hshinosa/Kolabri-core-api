## Context

`delete_message` event handler ada di `src/socket/index.ts`. Event ini menerima `{ messageId: string, roomId: string }`. Rate limiter sudah ada (`socketRateLimiter`), validator sudah ada (`socket.validator.ts`). Tinggal extend keduanya.

## Goals / Non-Goals

**Goals:**
- Rate limit `delete_message`: 20 per 60 detik per socket (lebih longgar dari `send_message` karena delete lebih jarang)
- Zod schema untuk payload `{ messageId: string, roomId: string }`
- Validasi di handler sebelum processing

**Non-Goals:**
- Perubahan business logic delete message
- Rate limit untuk event lain yang belum di-cover

## Decisions

**Rate limit 20/60s**
Delete message adalah aksi yang lebih jarang dari send message. 20 per menit cukup untuk penggunaan normal tapi mencegah spam delete.

**Schema minimal**
`{ messageId: z.string().min(1), roomId: z.string().min(1) }` — cukup untuk validasi basic. Tidak perlu UUID validation karena messageId adalah MongoDB ObjectId (bukan UUID).

## Risks / Trade-offs

- **[Risk] Rate limit terlalu ketat untuk edge case** → Mitigation: 20/60s cukup longgar.

## Migration Plan

1. Tambah `delete_message: { maxRequests: 20, windowMs: 60000 }` ke `EVENT_LIMITS` di `socketRateLimiter.ts`
2. Tambah `deleteMessageSchema` ke `socket.validator.ts`
3. Update `delete_message` handler di `socket/index.ts`
4. Run LSP + tests
