## 1. Schema Migration

- [x] 1.1 Baca `prisma/schema.prisma` untuk memahami model User, Course, Group, ChatSpace, KnowledgeBase saat ini
- [x] 1.2 Tambah field `deletedAt DateTime?` ke model `User`
- [x] 1.3 Tambah field `deletedAt DateTime?` ke model `Course`
- [x] 1.4 Tambah field `deletedAt DateTime?` ke model `Group`
- [x] 1.5 Tambah field `deletedAt DateTime?` ke model `ChatSpace`
- [x] 1.6 Tambah field `deletedAt DateTime?` ke model `KnowledgeBase`
- [x] 1.7 Tambah `@@index([deletedAt])` ke semua 5 model
- [x] 1.8 Jalankan `npx prisma migrate dev --name add-soft-delete` — migration berhasil
- [x] 1.9 Jalankan `npx prisma generate` — Prisma client ter-update

## 2. Service Layer — Soft Delete Operations

- [x] 2.1 Update `src/services/user.service.ts` — ganti `prisma.user.delete()` dengan `prisma.user.update({ data: { deletedAt: new Date() } })`
- [x] 2.2 Update `src/services/user.service.ts` — tambah `where: { deletedAt: null }` ke semua read queries
- [x] 2.3 Update `src/services/course.service.ts` — soft delete course dengan cascade ke groups dan chatspaces dalam satu Prisma transaction
- [x] 2.4 Update `src/services/course.service.ts` — tambah `where: { deletedAt: null }` ke semua read queries
- [x] 2.5 Update `src/services/group.service.ts` — soft delete + filter queries
- [x] 2.6 Update `src/services/chatSpace.service.ts` — soft delete + filter queries
- [x] 2.7 Update `src/services/knowledgeBase.service.ts` — soft delete + filter queries

## 3. Admin Hard Delete Endpoints

- [x] 3.1 Tambah method `hardDelete(id: string)` di `user.service.ts` menggunakan `prisma.user.delete()`
- [x] 3.2 Tambah endpoint `DELETE /api/admin/users/:id/hard` di route admin, hanya untuk role admin
- [x] 3.3 Tambah hard delete endpoints untuk Course, Group jika diperlukan

## 4. Tests

- [x] 4.1 Update `src/services/user.service.test.ts` — test soft delete: record tidak dihapus, `deletedAt` terisi
- [x] 4.2 Update `src/services/user.service.test.ts` — test read queries exclude soft-deleted records
- [x] 4.3 Update `src/services/course.service.test.ts` — test cascade soft delete
- [x] 4.4 Test cascade rollback: jika cascade gagal, tidak ada record yang ter-soft-delete
- [x] 4.5 Test admin hard delete: record benar-benar dihapus dari DB
- [x] 4.6 Test non-admin tidak bisa akses hard delete endpoint → 403
- [x] 4.7 Jalankan `npx vitest run` untuk semua service tests — semua pass
- [x] 4.8 Jalankan `lsp_diagnostics` pada semua file yang diubah — tidak ada type error
