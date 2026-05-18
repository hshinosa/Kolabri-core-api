## Why

Data AiChat session tersimpan di dua tempat sekaligus: PostgreSQL via Prisma model `AiChat` dan MongoDB via Mongoose. Duplikasi ini menciptakan risiko data drift, membuat sinkronisasi sulit dikelola, dan melanggar prinsip single source of truth yang sudah didefinisikan di CORE_API_SCOPE_BOUNDARIES.

## What Changes

- Tetapkan **PostgreSQL (Prisma `AiChat` model)** sebagai single source of truth untuk AiChat session metadata (session ID, user, timestamps, provider, model)
- **MongoDB** hanya menyimpan chat messages/logs (append-only, high-volume) — ini sudah sesuai dengan `ChatLog` model Mongoose yang ada
- Identifikasi dan hapus duplikasi di Mongoose layer yang menyimpan session metadata
- Update `src/services/aiChat.service.ts` untuk hanya baca/tulis session metadata ke PostgreSQL
- Pastikan tidak ada data loss — migration jika ada data di MongoDB yang belum ada di PostgreSQL

## Capabilities

### New Capabilities

- `aichat-data-ownership`: Konsolidasi AiChat session metadata ke PostgreSQL sebagai single source of truth, dengan MongoDB hanya untuk chat message logs

### Modified Capabilities

- (none — ini adalah perbaikan internal data ownership, bukan perubahan API contract)

## Impact

- `src/services/aiChat.service.ts` — refactor data access layer
- `src/models/` — review dan cleanup Mongoose models yang duplikat session data
- `prisma/schema.prisma` — kemungkinan perlu extend `AiChat` model jika ada field yang hilang
- Data migration jika ada session data di MongoDB yang perlu dipindah ke PostgreSQL
