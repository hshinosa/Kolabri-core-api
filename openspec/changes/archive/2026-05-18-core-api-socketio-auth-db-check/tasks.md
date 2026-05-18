## 1. Implementation

- [x] 1.1 Baca Socket.IO auth middleware di `src/socket/index.ts` (lines ~185-214) untuk memahami current pattern
- [x] 1.2 Tambah `import prisma from '../config/database.js'` jika belum ada (sudah ada di file)
- [x] 1.3 Update auth middleware — tambah `prisma.user.findFirst({ where: { id: decoded.userId, deletedAt: null } })` setelah `jwt.verify()`
- [x] 1.4 Jika user tidak ditemukan → `next(new Error('User not found'))`
- [x] 1.5 Jika user ditemukan → `socket.user = decoded; next()`

## 2. Verification

- [x] 2.1 Jalankan `lsp_diagnostics` pada `src/socket/index.ts` — tidak ada type error
- [x] 2.2 Jalankan `npx vitest run` — semua test pass
