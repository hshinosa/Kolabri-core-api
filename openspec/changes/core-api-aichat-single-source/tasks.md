## 1. Investigation

- [x] 1.1 Baca `src/models/` — list semua Mongoose models yang ada
- [x] 1.2 Baca `src/services/aiChat.service.ts` — identifikasi semua read/write ke Mongoose vs Prisma untuk session data
- [x] 1.3 Baca `prisma/schema.prisma` — verifikasi field `AiChat` model sudah cukup untuk session metadata
- [x] 1.4 Dokumentasikan temuan: Mongoose model mana yang duplikat session data, field apa yang perlu dimigrasikan

## 2. Migration Script

- [x] 2.1 Buat `prisma/scripts/migrate-aichat-sessions.ts`
- [x] 2.2 Implementasi dry-run mode
- [x] 2.3 Implementasi migration mode
- [x] 2.4 Implementasi verification step
- [x] 2.5 Jalankan script dengan dry-run
- [x] 2.6 Verifikasi output dry-run masuk akal
- [x] 2.7 Jalankan migration
- [x] 2.8 Verifikasi count match

## 3. Service Refactor

- [x] 3.1 Update `src/services/aiChat.service.ts` — hapus semua write ke Mongoose untuk session metadata
- [x] 3.2 Update `src/services/aiChat.service.ts` — hapus semua read dari Mongoose untuk session metadata
- [x] 3.3 Pastikan `ChatLog` Mongoose model tetap digunakan untuk chat messages
- [x] 3.4 Pastikan `SilenceEvent` Mongoose model tetap digunakan

## 4. Cleanup

- [x] 4.1 Identifikasi Mongoose model yang tidak lagi diperlukan setelah refactor
- [x] 4.2 Hapus atau deprecate Mongoose model yang duplikat session data
- [x] 4.3 Hapus MongoDB session data yang sudah dimigrasikan

## 5. Tests

- [x] 5.1 Update `src/services/aiChat.service.test.ts` — pastikan semua test masih pass
- [x] 5.2 Tambah test: create session → hanya ada di PostgreSQL
- [x] 5.3 Tambah test: get session → dibaca dari PostgreSQL
- [x] 5.4 Tambah test: chat messages masih tersimpan di MongoDB ChatLog
- [x] 5.5 Jalankan `npx vitest run src/services/aiChat.service.test.ts` — semua test pass
- [x] 5.6 Jalankan `lsp_diagnostics` pada semua file yang diubah — tidak ada type error

## 2. Migration Script

- [x] 2.1 Buat `prisma/scripts/migrate-aichat-sessions.ts`
- [x] 2.2 Implementasi dry-run mode: baca semua session dari MongoDB, hitung yang belum ada di PostgreSQL, print summary tanpa write
- [x] 2.3 Implementasi migration mode: untuk setiap session di MongoDB yang belum ada di PostgreSQL, tulis ke PostgreSQL
- [x] 2.4 Implementasi verification step: bandingkan count MongoDB sessions vs PostgreSQL sessions setelah migration
- [x] 2.5 Jalankan script dengan dry-run: `npx tsx prisma/scripts/migrate-aichat-sessions.ts --dry-run`
- [x] 2.6 Verifikasi output dry-run masuk akal (count, field mapping)
- [x] 2.7 Jalankan migration: `npx tsx prisma/scripts/migrate-aichat-sessions.ts`
- [x] 2.8 Verifikasi count match antara MongoDB dan PostgreSQL

## 3. Service Refactor

- [x] 3.1 Update `src/services/aiChat.service.ts` — hapus semua write ke Mongoose untuk session metadata
- [x] 3.2 Update `src/services/aiChat.service.ts` — hapus semua read dari Mongoose untuk session metadata, ganti dengan Prisma
- [x] 3.3 Pastikan `ChatLog` Mongoose model tetap digunakan untuk chat messages (tidak diubah)
- [x] 3.4 Pastikan `SilenceEvent` Mongoose model tetap digunakan (tidak diubah)

## 4. Cleanup

- [x] 4.1 Identifikasi Mongoose model yang tidak lagi diperlukan setelah refactor
- [x] 4.2 Hapus atau deprecate Mongoose model yang duplikat session data
- [x] 4.3 Hapus MongoDB session data yang sudah dimigrasikan (setelah verifikasi)

## 5. Tests

- [x] 5.1 Update `src/services/aiChat.service.test.ts` — pastikan semua test masih pass setelah refactor
- [x] 5.2 Tambah test: create session → hanya ada di PostgreSQL, tidak di MongoDB
- [x] 5.3 Tambah test: get session → dibaca dari PostgreSQL
- [x] 5.4 Tambah test: chat messages masih tersimpan di MongoDB ChatLog
- [x] 5.5 Jalankan `npx vitest run src/services/aiChat.service.test.ts` — semua test pass
- [x] 5.6 Jalankan `lsp_diagnostics` pada semua file yang diubah — tidak ada type error
