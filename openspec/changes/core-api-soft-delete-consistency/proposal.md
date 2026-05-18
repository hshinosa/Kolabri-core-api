## Why

Setelah implementasi soft delete, ditemukan 3 tempat di Core API yang masih menggunakan query tanpa filter `deletedAt: null`:

1. **`auth.service.ts` login** — user soft-deleted masih bisa login dan mendapat JWT baru. JWT DB check akan menolak mereka di request berikutnya, tapi mereka tetap bisa mendapat token baru.
2. **`analytics.service.ts`** — `prisma.group.findUnique` dan `prisma.course.findUnique` tanpa `deletedAt: null`. Service baru yang dibuat saat refactor analytics controller.
3. **`socket/index.ts` send_message handler** — `prisma.chatSpace.findUnique` tanpa `deletedAt: null`. ChatSpace yang soft-deleted masih bisa menerima pesan via Socket.IO.

## What Changes

- `auth.service.ts`: tambah `deletedAt: null` ke query login user
- `analytics.service.ts`: ganti `findUnique` → `findFirst` dengan `deletedAt: null` untuk group dan course
- `socket/index.ts`: tambah `deletedAt: null` ke `prisma.chatSpace.findUnique` di `send_message` handler

## Capabilities

### Modified Capabilities

- `soft-delete`: Extend coverage ke auth login, analytics service, dan Socket.IO send_message handler — konsisten dengan soft delete yang sudah ada di service layer lain

## Impact

- `src/services/auth.service.ts` — query login
- `src/services/analytics.service.ts` — 2 query (group + course)
- `src/socket/index.ts` — 1 query di send_message handler
