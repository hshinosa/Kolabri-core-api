## 1. Fix ingestDocument

- [x] 1.1 Baca `src/services/aiEngine.service.ts` — verifikasi current state `ingestDocument()` (timeout sudah `INGEST_TIMEOUT`, belum `resilient`)
- [x] 1.2 Wrap `ingestDocument()` dengan `resilient()`: pindahkan fetch call ke dalam `this.resilient(async () => { ... })`
- [x] 1.3 Pastikan error dari `ingestDocument` tetap di-throw agar circuit breaker bisa mendeteksi

## 2. Fix ingestBatch

- [x] 2.1 Baca current state `ingestBatch()` — timeout 300000 (5 menit, intentional)
- [x] 2.2 Pertahankan timeout 300000 (5 menit) — lebih tepat dari BATCH_INGEST_TIMEOUT untuk batch processing
- [x] 2.3 Wrap `ingestBatch()` dengan `resilient()`: baca file buffers di luar, recreate FormData di dalam callback

## 3. Verification

- [x] 3.1 Jalankan `lsp_diagnostics` pada `src/services/aiEngine.service.ts` — tidak ada type error
- [x] 3.2 Jalankan `npx vitest run` — semua test pass
