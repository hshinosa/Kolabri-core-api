## Context

`chatSpace.service.ts` `closeSession()` (line 56-87): update PostgreSQL, emit `session_closed`, return `{ id, name, closedAt, closedBy }`. Tidak ada AI Engine call.

`aiEngineService.generateSummary(messages, chatRoomId)` sudah ada di `aiEngine.service.ts` — memanggil `POST /api/intervention/summary` dengan array messages dan chat_room_id.

MongoDB ChatLog menyimpan semua pesan dengan `chatSpaceId` field. Bisa di-query untuk mendapatkan pesan terakhir.

## Goals / Non-Goals

**Goals:**
- Setelah session ditutup, generate summary dari 30 pesan terakhir
- Sertakan summary dalam response `closeSession()`
- Graceful degradation jika AI Engine unavailable

**Non-Goals:**
- Tidak blocking close operation — summary generation async setelah close
- Tidak menyimpan summary ke PostgreSQL (bisa ditambahkan nanti)
- Tidak mengirim summary ke Socket.IO room (client bisa baca dari response)

## Decisions

**D1: Summary generation setelah close, non-blocking untuk close operation**
Close PostgreSQL dulu, emit `session_closed`, lalu generate summary. Jika summary gagal, tetap return response dengan `summary: null`.

**D2: Ambil 30 pesan terakhir dari MongoDB ChatLog**
```typescript
const recentMessages = await ChatLog.find({
    chatSpaceId,
    isDeleted: { $ne: true },
    senderType: { $in: ['student', 'lecturer'] },
}).sort({ createdAt: -1 }).limit(30).lean();
```
Map ke format yang dibutuhkan `generateSummary()`: `{ sender, content, timestamp }`.

**D3: Return type diperluas dengan `summary?: string`**
Client app bisa menampilkan summary kepada user setelah sesi ditutup.

## Risks / Trade-offs

- **[Risk] Summary generation menambah latency ke closeSession()** → Mitigation: acceptable karena close session bukan operasi real-time kritis. Timeout 20s sudah ada di `generateSummary()`.
- **[Risk] Tidak ada pesan** → Mitigation: jika `recentMessages.length === 0`, skip summary generation, return `summary: null`.

## Open Questions

- None.
