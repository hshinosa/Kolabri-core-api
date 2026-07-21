## Context

Semua delete operations di Core API saat ini adalah hard delete via Prisma `delete()`. Model target: `User`, `Course`, `Group`, `ChatSpace`, `KnowledgeBase`. Model yang tidak perlu soft delete: `ChatMessage`, `Reflection`, `AuditLog` (append-only by nature), `CourseStudent`, `GroupMember` (junction tables, hard delete OK).

## Goals / Non-Goals

**Goals:**
- Tambah `deletedAt DateTime?` ke 5 model target
- Update semua delete operations ke soft delete
- Update semua read queries untuk exclude soft-deleted records
- Cascade soft delete: Course → Groups → ChatSpaces

**Non-Goals:**
- Automatic purge/cleanup setelah periode tertentu
- Soft delete untuk junction tables (CourseStudent, GroupMember)
- Restore endpoint untuk semua model (hanya admin yang perlu)
- Soft delete untuk ChatMessage, Reflection, AuditLog

## Decisions

**1. Field `deletedAt DateTime?` (nullable timestamp)**
Standard pattern untuk soft delete. `null` = aktif, timestamp = dihapus. Lebih informatif dari boolean `isDeleted` karena menyimpan kapan dihapus.
Alternatif ditolak: boolean `isDeleted` — tidak menyimpan timestamp penghapusan.

**2. Filter di service layer, bukan Prisma middleware**
Prisma mendukung middleware untuk auto-filter, tapi ini bisa menyembunyikan behavior dan sulit di-debug. Filter eksplisit `where: { deletedAt: null }` di setiap query lebih transparan.
Alternatif ditolak: Prisma middleware — terlalu magic, sulit di-override untuk admin queries.

**3. Cascade soft delete via service layer**
Saat Course di-soft-delete → service juga soft-delete semua Groups-nya → soft-delete semua ChatSpaces-nya. Ini dilakukan di `course.service.ts` dalam satu transaction Prisma.

**4. Admin hard delete endpoint**
Tambah `DELETE /api/admin/users/:id/hard` dan equivalennya untuk model lain. Hanya accessible oleh admin role. Ini untuk compliance .

**5. Index pada `deletedAt`**
Tambah `@@index([deletedAt])` ke semua model yang di-soft-delete untuk performa query `WHERE deletedAt IS NULL`.

## Risks / Trade-offs

- **[Risk] Developer lupa tambah `deletedAt: null` filter di query baru** → Mitigation: code review checklist, tambah ke CORE_API_SCOPE_BOUNDARIES.md.
- **[Risk] BREAKING: queries yang return semua records sekarang exclude soft-deleted** → Mitigation: document di changelog, test semua existing queries.
- **[Risk] Data volume bertambah (soft-deleted records tidak dihapus)** → Mitigation: acceptable untuk skala TA. Tambah purge job jika perlu di masa depan.

## Migration Plan

1. Update `prisma/schema.prisma` — tambah `deletedAt` + index ke 5 model
2. Jalankan `prisma migrate dev --name add-soft-delete`
3. Update service files: `course.service.ts`, `group.service.ts`, `chatSpace.service.ts`, `knowledgeBase.service.ts`, `user.service.ts`
4. Tambah admin hard delete endpoints
5. Update integration tests
6. Rollback: revert migration + service changes (data yang sudah soft-deleted akan kembali muncul)
