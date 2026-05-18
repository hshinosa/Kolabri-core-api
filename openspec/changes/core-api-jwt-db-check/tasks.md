## 1. Setup

- [x] 1.1 Baca `src/middleware/auth.ts` untuk memahami flow JWT verification saat ini
- [x] 1.2 Baca `src/config/database.ts` untuk memastikan Prisma client tersedia
- [x] 1.3 Cek apakah Redis client sudah tersedia di `src/config/redis.ts`

## 2. Core Implementation

- [x] 2.1 Update `src/middleware/auth.ts` — tambah Prisma lookup setelah `jwt.verify()` berhasil
- [x] 2.2 Cek `user.id` dari JWT payload ada di database (`prisma.user.findFirst`)
- [x] 2.3 Return HTTP 401 dengan pesan "User not found" jika user tidak ditemukan
- [x] 2.4 Jika soft delete sudah ada: tambah cek `deletedAt: null`, return 401 "User account is inactive" jika soft-deleted

## 3. Redis Cache Layer (opsional, jika Redis tersedia)

- [x] 3.1 Tambah cache lookup sebelum DB query: key `user:active:{userId}`, TTL 5 menit
- [x] 3.2 Jika cache hit → skip DB query, lanjutkan request
- [x] 3.3 Jika cache miss → DB query, simpan hasil ke cache
- [x] 3.4 Handle Redis unavailable gracefully (fallback ke DB lookup langsung)

## 4. Cache Invalidation

- [x] 4.1 Update `src/services/user.service.ts` — invalidate cache key saat user di-delete
- [x] 4.2 Update `src/services/user.service.ts` — invalidate cache key saat user di-update

## 5. Tests

- [x] 5.1 Update `src/middleware/auth.test.ts` — tambah test: valid token tapi user tidak ada di DB → 401
- [x] 5.2 Tambah test: valid token dan user ada → request diteruskan
- [x] 5.3 Tambah test: valid token tapi user soft-deleted → 401 (jika soft delete sudah ada)
- [x] 5.4 Jalankan `npx vitest run src/middleware/auth.test.ts` — semua test pass
- [x] 5.5 Jalankan `lsp_diagnostics` pada `src/middleware/auth.ts` — tidak ada type error

## 2. Core Implementation

- [x] 2.1 Update `src/middleware/auth.ts` — tambah Prisma lookup setelah `jwt.verify()` berhasil
- [x] 2.2 Cek `user.id` dari JWT payload ada di database (`prisma.user.findUnique`)
- [x] 2.3 Return HTTP 401 dengan pesan "User not found" jika user tidak ditemukan
- [x] 2.4 Jika soft delete sudah ada: tambah cek `deletedAt: null`, return 401 "User account is inactive" jika soft-deleted

## 3. Redis Cache Layer (opsional, jika Redis tersedia)

- [x] 3.1 Tambah cache lookup sebelum DB query: key `user:active:{userId}`, TTL 5 menit
- [x] 3.2 Jika cache hit → skip DB query, lanjutkan request
- [x] 3.3 Jika cache miss → DB query, simpan hasil ke cache
- [x] 3.4 Handle Redis unavailable gracefully (fallback ke DB lookup langsung)

## 4. Cache Invalidation

- [x] 4.1 Update `src/services/user.service.ts` — invalidate cache key saat user di-delete
- [x] 4.2 Update `src/services/user.service.ts` — invalidate cache key saat user di-update

## 5. Tests

- [x] 5.1 Update `src/middleware/auth.test.ts` — tambah test: valid token tapi user tidak ada di DB → 401
- [x] 5.2 Tambah test: valid token dan user ada → request diteruskan
- [x] 5.3 Tambah test: valid token tapi user soft-deleted → 401 (jika soft delete sudah ada)
- [x] 5.4 Jalankan `npx vitest run src/middleware/auth.test.ts` — semua test pass
- [x] 5.5 Jalankan `lsp_diagnostics` pada `src/middleware/auth.ts` — tidak ada type error
