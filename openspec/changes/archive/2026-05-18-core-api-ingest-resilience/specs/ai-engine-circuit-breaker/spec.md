## ADDED Requirements

### Requirement: Circuit breaker covers ingestDocument
`ingestDocument()` MUST diproteksi oleh circuit breaker dan retry logic yang sama dengan method LLM lainnya.

#### Scenario: ingestDocument retried on 503
- **WHEN** `ingestDocument()` gagal dengan HTTP 503
- **THEN** sistem melakukan retry dengan exponential backoff sebelum mengembalikan error

#### Scenario: ingestDocument contributes to circuit breaker
- **WHEN** `ingestDocument()` gagal 5 kali berturut-turut
- **THEN** circuit breaker terbuka dan semua AI Engine calls berikutnya langsung gagal

### Requirement: Circuit breaker covers ingestBatch
`ingestBatch()` MUST diproteksi oleh circuit breaker dan retry logic. Timeout MUST 120 detik.

#### Scenario: ingestBatch uses correct timeout
- **WHEN** `ingestBatch()` dipanggil
- **THEN** request dibatalkan setelah 120 detik jika tidak ada response
