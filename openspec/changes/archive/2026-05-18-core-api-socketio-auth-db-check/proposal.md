## Why

Socket.IO auth middleware di `src/socket/index.ts` menggunakan `jwt.verify()` langsung tanpa mengecek apakah user masih ada dan aktif di database. Token milik user yang sudah dihapus atau soft-deleted tetap bisa digunakan untuk membuat koneksi Socket.IO baru — celah keamanan yang sama dengan yang sudah kita fix di HTTP `verifyToken` middleware.

## What Changes

- Tambah Prisma DB lookup di Socket.IO auth middleware setelah `jwt.verify()` berhasil
- Cek user exists + `deletedAt: null` (soft delete sudah ada)
- Return error ke client dan reject koneksi jika user tidak ditemukan atau soft-deleted
- Pattern async Socket.IO middleware berbeda dari Express middleware — perlu `next(new Error(...))` bukan `next(ApiError.xxx())`

## Capabilities

### Modified Capabilities

- `socketio-auth`: Socket.IO auth sekarang memverifikasi keberadaan user di database, konsisten dengan HTTP auth middleware

## Impact

- `src/socket/index.ts` — auth middleware section (lines ~185-214)
- Tidak ada perubahan di API contract atau event structure
- Koneksi Socket.IO dari user yang sudah dihapus akan ditolak
