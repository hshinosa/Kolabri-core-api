## Context

3 lokasi yang perlu difix:

1. `auth.service.ts` login — query `prisma.user.findUnique({ where: { email } })` tidak cek `deletedAt`. Perlu ganti ke `findFirst({ where: { email, deletedAt: null } })`.

2. `analytics.service.ts` — `prisma.group.findUnique({ where: { id: groupId } })` dan `prisma.course.findUnique({ where: { id: courseId } })` tidak cek `deletedAt`. Perlu ganti ke `findFirst` dengan `deletedAt: null`.

3. `socket/index.ts` send_message — `prisma.chatSpace.findUnique({ where: { id: chatSpaceId } })` tidak cek `deletedAt`. Perlu ganti ke `findFirst` dengan `deletedAt: null`.

## Goals / Non-Goals

**Goals:**
- Semua query yang fetch entity yang bisa soft-deleted harus filter `deletedAt: null`
- Konsisten dengan pattern yang sudah ada di service layer lain

**Non-Goals:**
- Audit exhaustive semua query di seluruh codebase (scope terbatas ke 3 lokasi yang teridentifikasi)
- Perubahan business logic

## Decisions

**`findUnique` → `findFirst` dengan `deletedAt: null`**
`findUnique` hanya bisa filter by unique fields. Untuk tambah `deletedAt: null`, perlu ganti ke `findFirst` yang support arbitrary where conditions. Behavior identik untuk kasus normal (entity ada dan tidak soft-deleted).

## Risks / Trade-offs

- **[Risk] `findFirst` sedikit lebih lambat dari `findUnique`** → Mitigation: perbedaan tidak signifikan untuk single-record lookup.
- **[Risk] Auth login menolak soft-deleted user** → Ini behavior yang diinginkan.

## Migration Plan

1. Fix `auth.service.ts` login query
2. Fix `analytics.service.ts` group + course queries
3. Fix `socket/index.ts` chatSpace query
4. Run LSP + tests
