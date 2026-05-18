## 1. Circuit Breaker Utility

- [x] 1.1 Buat file `src/utils/circuitBreaker.ts`
- [x] 1.2 Implementasi `CircuitBreaker` class dengan state machine: CLOSED → OPEN → HALF_OPEN
- [x] 1.3 Implementasi method `execute<T>(fn: () => Promise<T>): Promise<T>` — entry point untuk semua calls
- [x] 1.4 Implementasi threshold: 5 consecutive failures → OPEN, 30s cooldown → HALF_OPEN
- [x] 1.5 Tambah logging untuk setiap state transition (WARN level)
- [x] 1.6 Export `CircuitBreaker` class dan singleton instance untuk AI Engine

## 2. Timeout Implementation

- [x] 2.1 Baca `src/services/aiEngine.service.ts` untuk memahami semua 14 method dan HTTP call pattern
- [x] 2.2 Buat helper `fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response>`
- [x] 2.3 Definisikan timeout constants: `LLM_TIMEOUT=30000`, `ANALYTICS_TIMEOUT=10000`, `INGEST_TIMEOUT=60000`, `BATCH_INGEST_TIMEOUT=120000`, `INTERVENTION_TIMEOUT=15000`, `HEALTH_TIMEOUT=5000`
- [x] 2.4 Ganti semua `fetch()` calls di `aiEngine.service.ts` dengan `fetchWithTimeout()` menggunakan timeout yang sesuai per method

## 3. Retry Implementation

- [x] 3.1 Buat helper `withRetry<T>(fn: () => Promise<T>, maxRetries: number): Promise<T>`
- [x] 3.2 Implementasi exponential backoff: delay = `1000 * 2^attempt + random(0, 500)` ms
- [x] 3.3 Retry hanya untuk: network error, HTTP 502, 503, 504
- [x] 3.4 Tidak retry untuk: HTTP 400, 401, 403, 404, 422

## 4. Integration ke aiEngine.service.ts

- [x] 4.1 Wrap semua 14 method dengan circuit breaker + retry + timeout
- [x] 4.2 Method LLM: `ask()`, `orchestratedChat()`, `personalChat()`, `personalChatStream()` — timeout 30s
- [x] 4.3 Method ingest: `ingestDocument()` — timeout 60s, `ingestBatch()` — timeout 120s
- [x] 4.4 Method analytics: `getGroupAnalytics()`, `analyzeEngagement()`, `exportProcessMiningData()` — timeout 10s
- [x] 4.5 Method intervention: `analyzeIntervention()`, `generateSummary()`, `generatePrompt()` — timeout 15s
- [x] 4.6 Method health: `isAvailable()` — timeout 5s, tidak perlu retry
- [x] 4.7 Method delete: `deleteDocument()` — timeout 10s

## 5. Tests

- [x] 5.1 Buat `src/utils/circuitBreaker.test.ts`
- [x] 5.2 Test: 5 failures → circuit opens
- [x] 5.3 Test: circuit open → request langsung gagal tanpa memanggil fn
- [x] 5.4 Test: setelah 30s → HALF_OPEN, probe berhasil → CLOSED
- [x] 5.5 Test: setelah 30s → HALF_OPEN, probe gagal → OPEN lagi
- [x] 5.6 Update `src/services/aiEngine.service.test.ts` — tambah test untuk timeout dan retry behavior
- [x] 5.7 Jalankan `npx vitest run src/utils/circuitBreaker.test.ts` — semua test pass
- [x] 5.8 Jalankan `lsp_diagnostics` pada semua file yang diubah — tidak ada type error

## 2. Timeout Implementation

- [x] 2.1 Baca `src/services/aiEngine.service.ts` untuk memahami semua 14 method dan HTTP call pattern
- [x] 2.2 Buat helper `fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response>`
- [x] 2.3 Definisikan timeout constants: `LLM_TIMEOUT=30000`, `ANALYTICS_TIMEOUT=10000`, `INGEST_TIMEOUT=60000`, `BATCH_INGEST_TIMEOUT=120000`, `INTERVENTION_TIMEOUT=15000`, `HEALTH_TIMEOUT=5000`
- [x] 2.4 Ganti semua `fetch()` calls di `aiEngine.service.ts` dengan `fetchWithTimeout()` menggunakan timeout yang sesuai per method

## 3. Retry Implementation

- [x] 3.1 Buat helper `withRetry<T>(fn: () => Promise<T>, maxRetries: number): Promise<T>`
- [x] 3.2 Implementasi exponential backoff: delay = `1000 * 2^attempt + random(0, 500)` ms
- [x] 3.3 Retry hanya untuk: network error, HTTP 502, 503, 504
- [x] 3.4 Tidak retry untuk: HTTP 400, 401, 403, 404, 422

## 4. Integration ke aiEngine.service.ts

- [x] 4.1 Wrap semua 14 method dengan circuit breaker + retry + timeout
- [x] 4.2 Method LLM: `ask()`, `orchestratedChat()`, `personalChat()`, `personalChatStream()` — timeout 30s
- [x] 4.3 Method ingest: `ingestDocument()` — timeout 60s, `ingestBatch()` — timeout 120s
- [x] 4.4 Method analytics: `getGroupAnalytics()`, `analyzeEngagement()`, `exportProcessMiningData()` — timeout 10s
- [x] 4.5 Method intervention: `analyzeIntervention()`, `generateSummary()`, `generatePrompt()` — timeout 15s
- [x] 4.6 Method health: `isAvailable()` — timeout 5s, tidak perlu retry
- [x] 4.7 Method delete: `deleteDocument()` — timeout 10s

## 5. Tests

- [x] 5.1 Buat `src/utils/circuitBreaker.test.ts`
- [x] 5.2 Test: 5 failures → circuit opens
- [x] 5.3 Test: circuit open → request langsung gagal tanpa memanggil fn
- [x] 5.4 Test: setelah 30s → HALF_OPEN, probe berhasil → CLOSED
- [x] 5.5 Test: setelah 30s → HALF_OPEN, probe gagal → OPEN lagi
- [x] 5.6 Update `src/services/aiEngine.service.test.ts` — tambah test untuk timeout dan retry behavior
- [x] 5.7 Jalankan `npx vitest run src/utils/circuitBreaker.test.ts` — semua test pass
- [x] 5.8 Jalankan `lsp_diagnostics` pada semua file yang diubah — tidak ada type error
