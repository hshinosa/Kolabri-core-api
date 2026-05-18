## 1. Fix auth.service.ts

- [x] 1.1 Baca `src/services/auth.service.ts` — identifikasi query login yang pakai `findUnique`
- [x] 1.2 Ganti `prisma.user.findUnique({ where: { email } })` → `prisma.user.findFirst({ where: { email, deletedAt: null } })`
- [x] 1.3 Pastikan error message tetap "Invalid credentials" (tidak expose bahwa user soft-deleted)

## 2. Fix analytics.service.ts

- [x] 2.1 Baca `src/services/analytics.service.ts` — identifikasi semua `findUnique` untuk group dan course
- [x] 2.2 Ganti `prisma.group.findUnique({ where: { id: groupId } })` → `prisma.group.findFirst({ where: { id: groupId, deletedAt: null } })`
- [x] 2.3 Ganti `prisma.course.findUnique({ where: { id: courseId } })` → `prisma.course.findFirst({ where: { id: courseId, deletedAt: null } })`

## 3. Fix socket/index.ts

- [x] 3.1 Baca `send_message` handler di `src/socket/index.ts` — identifikasi `prisma.chatSpace.findUnique`
- [x] 3.2 Ganti `prisma.chatSpace.findUnique({ where: { id: chatSpaceId } })` → `prisma.chatSpace.findFirst({ where: { id: chatSpaceId, deletedAt: null } })`

## 4. Verification

- [x] 4.1 Jalankan `lsp_diagnostics` pada semua file yang diubah — tidak ada type error
- [x] 4.2 Jalankan `npx vitest run` — semua test pass
