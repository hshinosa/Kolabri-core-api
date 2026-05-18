## ADDED Requirements

### Requirement: Transient failures are retried with exponential backoff
Sistem MUST melakukan retry otomatis untuk panggilan ke AI Engine yang gagal karena transient errors (HTTP 502, 503, 504, atau network error). Retry MUST menggunakan exponential backoff dengan jitter. Maximum retry adalah 3 kali. Errors 4xx MUST NOT di-retry.

#### Scenario: Retry on 503 with backoff
- **WHEN** panggilan ke AI Engine mengembalikan HTTP 503
- **THEN** sistem melakukan retry setelah ~1 detik, kemudian ~2 detik, kemudian ~4 detik sebelum menyerah

#### Scenario: No retry on 4xx errors
- **WHEN** panggilan ke AI Engine mengembalikan HTTP 400 atau 422
- **THEN** sistem langsung mengembalikan error ke caller tanpa retry

#### Scenario: No retry on 401 from AI Engine
- **WHEN** panggilan ke AI Engine mengembalikan HTTP 401 (CORE_API_SECRET salah)
- **THEN** sistem langsung mengembalikan error tanpa retry

#### Scenario: Max retries exhausted
- **WHEN** semua 3 retry gagal
- **THEN** sistem mengembalikan error terakhir ke caller

### Requirement: Retry includes jitter to prevent thundering herd
Delay antara retry MUST menyertakan random jitter (0-500ms) untuk mencegah semua request retry menghantam AI Engine secara bersamaan.

#### Scenario: Jitter applied to retry delay
- **WHEN** retry pertama dijadwalkan
- **THEN** delay aktual adalah base delay (1000ms) ditambah random value antara 0-500ms
