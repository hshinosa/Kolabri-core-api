## Why

Semua 14 panggilan ke AI Engine di `aiEngine.service.ts` tidak memiliki circuit breaker, retry logic, atau timeout yang tegas. Satu kegagalan transient langsung menjadi user-facing error, dan AI Engine yang lambat atau down menyebabkan cascading failure ke seluruh Core API karena request menggantung tanpa batas.

## What Changes

- Tambah **explicit timeout** untuk setiap HTTP call ke AI Engine (default: 30s untuk LLM calls, 10s untuk analytics/health)
- Tambah **retry dengan exponential backoff** untuk transient failures (max 3 retry, hanya untuk 5xx dan network errors)
- Tambah **circuit breaker** yang membuka setelah N consecutive failures dan menutup kembali setelah cooldown period
- Semua perubahan terlokalisir di `src/services/aiEngine.service.ts`
- Tambah logging untuk circuit breaker state transitions

## Capabilities

### New Capabilities

- `ai-engine-circuit-breaker`: Circuit breaker pattern untuk semua panggilan ke AI Engine — mencegah cascading failure saat AI Engine down atau degraded
- `ai-engine-retry`: Exponential backoff retry untuk transient failures pada AI Engine calls
- `ai-engine-timeout`: Explicit per-call timeout untuk semua AI Engine HTTP requests

### Modified Capabilities

- (none — semua perubahan internal di service layer, interface ke controller tidak berubah)

## Impact

- `src/services/aiEngine.service.ts` — file utama (710 baris, 14 method)
- Tidak ada dependency baru yang diperlukan (implementasi manual atau gunakan `undici` yang sudah ada)
- Behavior yang berubah: AI Engine errors sekarang bisa di-retry sebelum sampai ke user
- Circuit breaker open state akan return error cepat ke user (fail-fast) daripada menunggu timeout
