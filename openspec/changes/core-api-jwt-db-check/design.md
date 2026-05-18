## Context

Auth middleware di `src/middleware/auth.ts` saat ini hanya memverifikasi JWT signature menggunakan `jsonwebtoken.verify()`. Setelah signature valid, request langsung diteruskan ke handler tanpa mengecek apakah user yang bersangkutan masih ada di database atau masih aktif. Prisma client sudah tersedia via `src/config/database.ts`.

## Goals / Non-Goals

**Goals:**
- Tambah DB lookup ke PostgreSQL setelah JWT signature berhasil diverifikasi
- Return 401 jika user tidak ditemukan atau tidak aktif
- Optional: cache hasil lookup di Redis untuk mengurangi DB hit per request

**Non-Goals:**
- Token refresh mechanism
- OAuth / SSO integration
- Session-based auth
- Perubahan JWT payload structure

## Decisions

**1. Prisma langsung di middleware (bukan inject via service)**
Middleware adalah cross-cutting concern. Menggunakan Prisma client langsung lebih sederhana daripada membuat `UserService` dependency di middleware. Prisma client sudah singleton via `database.ts`.

**2. Redis cache opsional dengan TTL 5 menit**
Setiap request ke protected route akan trigger DB lookup tanpa cache. Untuk mengurangi latency, cache hasil `{ exists: true, active: true }` di Redis dengan key `user:active:{userId}` dan TTL 5 menit. Cache di-invalidate saat user di-update atau di-delete.
Alternatif yang ditolak: cache di memory (tidak aman untuk multi-instance).

**3. Return 401, bukan 403**
User yang tidak ditemukan atau tidak aktif → 401 Unauthorized (bukan 403 Forbidden). Alasan: 403 mengimplikasikan user dikenali tapi tidak punya akses. 401 lebih tepat karena identity tidak bisa dikonfirmasi.

**4. Field yang dicek: `id` dan `deletedAt` (jika soft delete sudah ada)**
Cek minimal: user dengan `id` tersebut ada di database. Jika soft delete sudah diimplementasikan, tambah cek `deletedAt: null`.

## Risks / Trade-offs

- **[Risk] Latency naik per request** → Mitigation: Redis cache dengan TTL 5 menit. Tanpa cache, tambahan ~2-5ms per request (local DB).
- **[Risk] Cache stale setelah user dihapus** → Mitigation: invalidate cache key saat delete/update user di `user.service.ts`.
- **[Risk] Redis tidak tersedia** → Mitigation: fallback ke DB lookup langsung (Redis optional, bukan hard dependency).

## Migration Plan

1. Update `src/middleware/auth.ts` — tambah DB lookup setelah `jwt.verify()`
2. Update `src/services/user.service.ts` — tambah cache invalidation saat delete/update
3. Deploy — tidak ada data migration, tidak ada breaking change ke API contract
4. Rollback: revert `auth.ts` ke versi sebelumnya
