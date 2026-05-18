## Why

JWT middleware hanya memverifikasi signature token tanpa mengecek apakah user masih ada dan aktif di database. Token milik user yang sudah dihapus atau dinonaktifkan tetap dianggap valid sampai expired — membuka celah authorization bypass yang serius.

## What Changes

- Tambah database lookup di `src/middleware/auth.ts` setelah JWT signature berhasil diverifikasi
- Cek user exists di PostgreSQL (via Prisma)
- Cek user tidak dalam status nonaktif/dihapus (jika soft delete sudah ada)
- Return 401 jika user tidak ditemukan atau tidak aktif
- Cache hasil lookup di Redis (opsional, untuk mengurangi DB hit per request)

## Capabilities

### New Capabilities

- `jwt-user-validation`: Validasi keberadaan dan status user ke database setiap kali JWT diverifikasi, memastikan token hanya valid selama user masih aktif di sistem

### Modified Capabilities

- (none — perubahan ini adalah penambahan behavior di middleware yang sudah ada, bukan perubahan requirement level capability)

## Impact

- `src/middleware/auth.ts` — file utama yang diubah
- `src/config/database.ts` — Prisma client sudah tersedia, tinggal digunakan
- Semua 17 route yang menggunakan auth middleware terdampak (latency sedikit naik karena DB lookup)
- Redis cache opsional untuk mitigasi latency
