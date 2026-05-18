## Why

Dua method di `aiEngine.service.ts` — `ingestDocument()` dan `ingestBatch()` — tidak di-wrap dengan `resilient()` saat implementasi circuit breaker sebelumnya. Keduanya masih memanggil AI Engine secara langsung tanpa circuit breaker dan retry. Ini berarti kegagalan transient pada proses ingest dokumen tidak di-retry, dan AI Engine yang down tidak memicu circuit breaker dari jalur ingest.

## What Changes

- Wrap `ingestDocument()` dengan `resilient()` menggunakan `INGEST_TIMEOUT` (60s), retryable
- Wrap `ingestBatch()` dengan `resilient()` menggunakan `BATCH_INGEST_TIMEOUT` (120s), retryable
- Pastikan `personalChatStream()` tetap tidak di-wrap (intentional — return raw `Response`)

## Capabilities

### Modified Capabilities

- `ai-engine-circuit-breaker`: Extend coverage ke `ingestDocument` dan `ingestBatch` — sebelumnya hanya cover 10 dari 12 method yang perlu dilindungi

## Impact

- `src/services/aiEngine.service.ts` — 2 method yang diupdate
- Tidak ada perubahan interface atau API contract
