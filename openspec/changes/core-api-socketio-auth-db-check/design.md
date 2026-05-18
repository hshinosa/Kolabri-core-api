## Context

Socket.IO auth middleware di `src/socket/index.ts` (sekitar lines 185-214) menggunakan pattern callback async:
```typescript
io.use(async (socket, next) => {
    try {
        const decoded = jwt.verify(token, secret) as JwtPayload;
        socket.user = decoded;
        next();
    } catch (error) {
        next(new Error('Invalid token'));
    }
});
```

Berbeda dari Express middleware, Socket.IO middleware menggunakan `next(new Error(...))` untuk reject koneksi. Prisma client sudah tersedia via `src/config/database.js`.

## Goals / Non-Goals

**Goals:**
- Tambah DB lookup setelah `jwt.verify()` berhasil
- Cek `deletedAt: null` (soft delete sudah ada)
- Reject koneksi dengan `next(new Error('User not found'))` jika user tidak ada atau soft-deleted

**Non-Goals:**
- Redis cache (tidak ada Redis config)
- Perubahan JWT payload structure
- Perubahan event handlers

## Decisions

**1. Prisma `findFirst` dengan `deletedAt: null`**
Konsisten dengan fix di HTTP auth middleware. Satu query, cek exists + soft delete sekaligus.

**2. `next(new Error(...))` bukan `next(ApiError.xxx())`**
Socket.IO middleware tidak menggunakan Express error handling. Error yang di-pass ke `next()` akan menjadi `connect_error` event di client dengan `message` dari error tersebut.

**3. Tidak ada cache**
Sama dengan keputusan di HTTP auth — tidak ada Redis config, fallback ke DB lookup langsung.

## Risks / Trade-offs

- **[Risk] Latency naik saat connect** → Mitigation: hanya saat initial connection, bukan per-event. Acceptable.
- **[Risk] DB down → semua Socket.IO connections gagal** → Mitigation: sama dengan HTTP auth, acceptable trade-off untuk security.

## Migration Plan

1. Update Socket.IO auth middleware di `src/socket/index.ts`
2. Run LSP + tests
