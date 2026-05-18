## Context

`src/services/aiEngine.service.ts` (710 baris) berisi 14 method yang semuanya memanggil AI Engine via HTTP. Saat ini tidak ada timeout, retry, atau circuit breaker. Semua call menggunakan `fetch` atau `undici` (sudah ada di dependencies). AI Engine adalah dependency kritis — jika down, semua fitur AI di Core API ikut gagal.

## Goals / Non-Goals

**Goals:**
- Explicit timeout per call type (LLM: 30s, analytics: 10s, health: 5s)
- Retry dengan exponential backoff untuk transient failures (max 3x, hanya 5xx + network error)
- Circuit breaker yang membuka setelah 5 consecutive failures, cooldown 30s

**Non-Goals:**
- Mengubah AI Engine API contract
- Menambah endpoint baru
- Distributed circuit breaker state (Redis) — in-memory cukup untuk single instance
- Retry untuk 4xx errors (client errors tidak perlu di-retry)

## Decisions

**1. Implementasi manual, tidak pakai library**
Library seperti `opossum` atau `cockatiel` bisa dipakai, tapi menambah dependency. Implementasi manual circuit breaker sederhana (state machine: CLOSED → OPEN → HALF_OPEN) cukup untuk kebutuhan ini dan lebih transparan.
Alternatif ditolak: `opossum` — terlalu besar untuk use case ini.

**2. AbortController untuk timeout**
`undici` dan native `fetch` mendukung `AbortController` + `AbortSignal.timeout()`. Ini cara paling clean untuk implement timeout tanpa wrapper tambahan.

**3. Timeout berbeda per call type**
- LLM calls (`ask`, `chat`, `personalChat`): 30s — LLM generation membutuhkan waktu
- Analytics calls (`analyzeEngagement`, `getGroupAnalytics`): 10s
- Ingest calls (`ingestDocument`, `ingestBatch`): 60s — document processing bisa lama
- Health check: 5s
- Intervention calls: 15s

**4. Retry hanya untuk idempotent + transient failures**
Retry untuk: network error, 502, 503, 504. Tidak retry untuk: 400, 401, 403, 404, 422 (client errors). POST calls yang tidak idempotent (seperti `ingestDocument`) tetap di-retry karena AI Engine sudah handle idempotency via document ID.

**5. Circuit breaker threshold: 5 failures / 30s cooldown**
Setelah 5 consecutive failures → OPEN (fail fast). Setelah 30s → HALF_OPEN (coba 1 request). Jika berhasil → CLOSED. Jika gagal → OPEN lagi.

## Risks / Trade-offs

- **[Risk] Retry amplifies load pada AI Engine yang sudah degraded** → Mitigation: exponential backoff dengan jitter (1s, 2s, 4s + random 0-500ms).
- **[Risk] Circuit breaker open → semua AI features fail sekaligus** → Mitigation: log state transition, return error message yang jelas ke user ("AI service temporarily unavailable").
- **[Risk] In-memory state hilang saat restart** → Mitigation: acceptable, circuit breaker akan reset ke CLOSED state yang aman.

## Migration Plan

1. Tambah `CircuitBreaker` class di `src/utils/circuitBreaker.ts`
2. Update semua 14 method di `aiEngine.service.ts` — wrap dengan timeout + retry + circuit breaker
3. Tambah unit tests untuk circuit breaker logic
4. Deploy — tidak ada breaking change ke interface
5. Rollback: revert `aiEngine.service.ts` dan hapus `circuitBreaker.ts`
