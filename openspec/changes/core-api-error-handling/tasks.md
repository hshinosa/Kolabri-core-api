## 1. Audit

- [x] 1.1 Baca semua 14 controller files di `src/controllers/`
- [x] 1.2 Identifikasi: controller yang punya `res.status(xxx).json({ error: ... })` manual
- [x] 1.3 Identifikasi: controller yang punya empty catch block `catch(e) {}`
- [x] 1.4 Identifikasi: async handler yang tidak punya try/catch
- [x] 1.5 Buat daftar controller + issue yang ditemukan

## 2. Fix Per Controller

- [x] 2.1 Fix `auth.controller.ts` — `refresh()` dan `logout()`: ganti `res.status(400).json(...)` dengan `next(ApiError.badRequest(...))`
- [x] 2.2 Fix empty catch blocks → tidak ada yang ditemukan
- [x] 2.3 Fix async handler tanpa try/catch → semua sudah punya try/catch

## 3. Verification

- [x] 3.1 Jalankan `lsp_diagnostics` pada semua controller yang diubah — tidak ada type error
- [x] 3.2 Jalankan `npx vitest run` — semua test pass
