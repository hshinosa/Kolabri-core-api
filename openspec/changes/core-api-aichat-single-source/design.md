## Context

`AiChat` Prisma model di PostgreSQL menyimpan session metadata (userId, provider, model, timestamps). Mongoose di MongoDB juga menyimpan data terkait AI chat session. `ChatLog` Mongoose model menyimpan pesan chat (append-only, high-volume) — ini sudah benar dan tidak perlu dipindah. Masalahnya adalah session metadata yang duplikat antara dua storage.

## Goals / Non-Goals

**Goals:**
- PostgreSQL (Prisma `AiChat`) sebagai single source of truth untuk session metadata
- MongoDB hanya untuk chat messages via `ChatLog` model
- Hapus duplikasi session data di Mongoose layer
- Tidak ada data loss selama migration

**Non-Goals:**
- Memindahkan `ChatLog` messages ke PostgreSQL (MongoDB tepat untuk ini)
- Mengubah API contract `aiChat` endpoints
- Perubahan di AI Engine

## Decisions

**1. PostgreSQL untuk session metadata, MongoDB untuk messages**
Session metadata (siapa, kapan, provider apa) adalah relational data yang cocok di PostgreSQL. Chat messages adalah append-only, high-volume, schema-flexible — cocok di MongoDB. Ini sesuai dengan data ownership yang sudah didefinisikan di CORE_API_SCOPE_BOUNDARIES.

**2. Migration sequence: read MongoDB → write PostgreSQL → verify → delete MongoDB**
Untuk zero data loss: baca semua session data dari MongoDB yang belum ada di PostgreSQL, tulis ke PostgreSQL, verifikasi count match, baru hapus dari MongoDB. Jalankan sebagai script migration terpisah.

**3. Identifikasi Mongoose models yang perlu dihapus**
Perlu inspect `src/models/` untuk identifikasi model mana yang duplikat session data. `ChatLog` dan `SilenceEvent` tetap ada.

## Risks / Trade-offs

- **[Risk] Data di MongoDB yang tidak ada di PostgreSQL hilang** → Mitigation: migration script dengan dry-run mode dulu, verifikasi count sebelum delete.
- **[Risk] aiChat.service.ts mungkin punya logic kompleks yang mix kedua storage** → Mitigation: refactor bertahap dengan test coverage yang ada.
- **[Risk] Downtime saat migration** → Mitigation: migration bisa dilakukan online karena write ke PostgreSQL dulu sebelum hapus dari MongoDB.

## Migration Plan

1. Inspect `src/models/` — identifikasi Mongoose models yang duplikat session data
2. Buat migration script: baca MongoDB sessions → tulis ke PostgreSQL (jika belum ada)
3. Jalankan migration script dengan dry-run, verifikasi output
4. Jalankan migration script untuk production data
5. Update `aiChat.service.ts` — hapus semua read/write ke Mongoose untuk session metadata
6. Hapus Mongoose model yang tidak lagi diperlukan
7. Verifikasi semua aiChat endpoints masih berfungsi
