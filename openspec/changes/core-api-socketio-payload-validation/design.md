## Context

4 event handlers di `src/socket/index.ts` yang perlu validasi:
- `join_room`: `{ courseId: string, groupId: string, chatSpaceId: string }`
- `send_message`: `{ roomId: string, content: string, courseId: string, groupId: string, replyTo?: {...}, attachments?: [...], mentions?: string[] }`
- `typing`: `{ roomId: string, isTyping: boolean }`
- `leave_room`: `roomId: string` (primitive, bukan object)

Zod sudah ada sebagai dependency. Pattern validasi yang sudah ada di HTTP layer bisa dijadikan referensi.

## Goals / Non-Goals

**Goals:**
- Zod schema untuk setiap event payload
- Validasi di awal handler sebelum processing
- Emit `validation_error` event ke client dengan detail field yang invalid

**Non-Goals:**
- Validasi untuk event yang tidak ada di list (misal: internal events)
- Perubahan business logic
- Rate limiting (sudah ada di change sebelumnya)

## Decisions

**1. Zod `safeParse` bukan `parse`**
`safeParse` tidak throw — lebih cocok untuk Socket.IO karena kita ingin emit error event, bukan throw exception yang bisa crash handler.

**2. Emit `validation_error` event, bukan `error`**
`error` event di Socket.IO punya semantik khusus (disconnect). `validation_error` lebih spesifik dan tidak memutus koneksi.

**3. Schema di file terpisah atau inline**
Karena hanya 4 schemas dan semuanya Socket.IO-specific, definisikan inline di `socket/index.ts` atau di `src/validators/socket.validator.ts`. Pilih `socket.validator.ts` untuk konsistensi dengan pattern validators yang sudah ada.

## Risks / Trade-offs

- **[Risk] Client app belum handle `validation_error` event** → Mitigation: document di API changelog, client app perlu update.
- **[Risk] Schema terlalu strict break existing client** → Mitigation: start dengan required fields only, gunakan `.optional()` untuk fields yang tidak critical.

## Migration Plan

1. Buat `src/validators/socket.validator.ts` dengan 4 Zod schemas
2. Update `src/socket/index.ts` — tambah validasi di 4 handlers
3. Run LSP + tests
