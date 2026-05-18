## Context

`aiEngine.service.ts` sudah punya `resilient()` private method dan `aiEngineCircuitBreaker` singleton. Saat implementasi sebelumnya, 10 dari 12 method yang perlu dilindungi sudah di-wrap. Yang terlewat: `ingestDocument()` (timeout sudah diupdate ke `INGEST_TIMEOUT` tapi belum di-wrap) dan `ingestBatch()` (masih pakai `this.timeout` = 30s, belum di-wrap).

## Goals / Non-Goals

**Goals:**
- Wrap `ingestDocument()` dengan `resilient()` + `INGEST_TIMEOUT`
- Wrap `ingestBatch()` dengan `resilient()` + `BATCH_INGEST_TIMEOUT`

**Non-Goals:**
- `personalChatStream()` — intentionally tidak di-wrap (return raw `Response`, tidak compatible dengan `resilient()` wrapper)
- Perubahan timeout values yang sudah ada

## Decisions

**1. `ingestDocument` — retryable = true**
Ingest dokumen adalah idempotent (AI Engine handle duplikasi via file_id). Aman untuk di-retry.

**2. `ingestBatch` — retryable = true**
Sama dengan ingestDocument, batch ingest idempotent via course_id + file names.

**3. Pattern sama dengan method lain yang sudah di-wrap**
```typescript
return await this.resilient(async () => {
    // existing fetch code
}, true);
```

## Risks / Trade-offs

- **[Risk] Retry pada ingest besar bisa lambat** → Mitigation: exponential backoff sudah ada, max 3 retry.
- **[Risk] Circuit breaker terbuka karena ingest timeout** → Mitigation: acceptable, circuit breaker melindungi semua method.

## Migration Plan

1. Update `ingestDocument()` — wrap dengan `resilient()`
2. Update `ingestBatch()` — wrap dengan `resilient()` + fix timeout ke `BATCH_INGEST_TIMEOUT`
3. Run LSP + tests
