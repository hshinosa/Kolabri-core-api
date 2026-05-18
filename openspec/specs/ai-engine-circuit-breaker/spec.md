# ai-engine-circuit-breaker Specification

## Purpose
TBD - created by archiving change core-api-ai-engine-resilience. Update Purpose after archive.
## Requirements
### Requirement: Circuit breaker opens after consecutive failures
Sistem MUST mengimplementasikan circuit breaker untuk semua panggilan ke AI Engine. Setelah 5 consecutive failures, circuit breaker MUST berpindah ke state OPEN dan menolak semua request berikutnya dengan cepat (fail-fast) tanpa mencoba memanggil AI Engine.

#### Scenario: Circuit breaker opens after threshold
- **WHEN** 5 panggilan berturut-turut ke AI Engine gagal (5xx atau network error)
- **THEN** circuit breaker berpindah ke state OPEN dan request berikutnya langsung mendapat error "AI service temporarily unavailable" tanpa menunggu timeout

#### Scenario: Circuit breaker transitions to half-open after cooldown
- **WHEN** circuit breaker dalam state OPEN dan 30 detik telah berlalu
- **THEN** circuit breaker berpindah ke state HALF_OPEN dan mengizinkan satu request percobaan

#### Scenario: Circuit breaker closes after successful probe
- **WHEN** circuit breaker dalam state HALF_OPEN dan request percobaan berhasil
- **THEN** circuit breaker berpindah ke state CLOSED dan semua request kembali diteruskan ke AI Engine

#### Scenario: Circuit breaker stays open after failed probe
- **WHEN** circuit breaker dalam state HALF_OPEN dan request percobaan gagal
- **THEN** circuit breaker kembali ke state OPEN dengan cooldown baru 30 detik

### Requirement: Circuit breaker state transitions are logged
Setiap perubahan state circuit breaker (CLOSED→OPEN, OPEN→HALF_OPEN, HALF_OPEN→CLOSED) MUST dicatat di application log dengan level WARN.

#### Scenario: State transition logged
- **WHEN** circuit breaker berpindah state
- **THEN** log entry dibuat dengan format: "Circuit breaker [state]: [reason]"

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

