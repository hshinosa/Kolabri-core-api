## 1. Rate Limiter Update

- [x] 1.1 Baca `src/utils/socketRateLimiter.ts` — lihat `EVENT_LIMITS` object
- [x] 1.2 Tambah `delete_message: { maxRequests: 20, windowMs: 60000 }` ke `EVENT_LIMITS`

## 2. Validator Update

- [x] 2.1 Baca `src/validators/socket.validator.ts` — lihat existing schemas
- [x] 2.2 Tambah `deleteMessageSchema = z.object({ messageId: z.string().min(1), roomId: z.string().min(1) })`
- [x] 2.3 Export `deleteMessageSchema`

## 3. Socket Handler Update

- [x] 3.1 Baca `delete_message` handler di `src/socket/index.ts`
- [x] 3.2 Import `deleteMessageSchema` di `src/socket/index.ts`
- [x] 3.3 Tambah rate limit check di awal handler: `socketRateLimiter.isAllowed(socket.id, 'delete_message')`
- [x] 3.4 Tambah payload validation: `deleteMessageSchema.safeParse(data)`, emit `validation_error` jika gagal

## 4. Verification

- [x] 4.1 Jalankan `lsp_diagnostics` pada semua file yang diubah — tidak ada type error
- [x] 4.2 Jalankan `npx vitest run` — semua test pass
