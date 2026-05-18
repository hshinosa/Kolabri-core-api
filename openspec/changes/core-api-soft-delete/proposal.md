## Why

Semua delete operations di Core API bersifat hard delete — data hilang permanen. Tidak ada cara recovery, audit trail tidak lengkap untuk operasi penghapusan, dan rollback bisnis (misalnya restore course yang tidak sengaja dihapus) tidak mungkin dilakukan.

## What Changes

- Tambah field `deletedAt DateTime?` ke model-model penting di `prisma/schema.prisma`: `User`, `Course`, `Group`, `ChatSpace`, `KnowledgeBase`
- Buat Prisma migration untuk schema changes
- Update semua delete operations di service layer menjadi soft delete (`update({ deletedAt: new Date() })`)
- Update semua read queries untuk exclude soft-deleted records (`where: { deletedAt: null }`)
- Tambah admin endpoint untuk hard delete permanen (jika diperlukan)
- Model `AuditLog`, `ChatMessage`, `Reflection` tidak perlu soft delete (append-only by nature)

## Capabilities

### New Capabilities

- `soft-delete`: Mekanisme soft delete untuk model User, Course, Group, ChatSpace, dan KnowledgeBase — data tidak dihapus permanen, hanya ditandai dengan timestamp deletedAt

### Modified Capabilities

- (none — perubahan ini adalah penambahan behavior, bukan perubahan requirement yang sudah ada)

## Impact

- `prisma/schema.prisma` — tambah `deletedAt` ke 5 model
- `prisma/migrations/` — migration baru
- `src/services/course.service.ts`, `group.service.ts`, `chatSpace.service.ts`, `knowledgeBase.service.ts`, `user.service.ts` — update delete + read queries
- `src/controllers/` yang bersangkutan — tidak perlu diubah (perubahan di service layer)
- **BREAKING**: Query yang sebelumnya return semua records sekarang exclude soft-deleted records
