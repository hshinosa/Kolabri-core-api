## 1. Audit

- [x] 1.1 Baca semua 14 controller files di `src/controllers/`
- [x] 1.2 Identifikasi: controller yang punya `prisma.*` calls langsung
- [x] 1.3 Identifikasi: controller yang punya business logic
- [x] 1.4 Rank controller dari paling tebal ke paling tipis
- [x] 1.5 Pilih top 3-5 controller yang paling perlu direfactor

## 2. Refactor Per Controller

- [x] 2.1 Refactor `analytics.controller.ts` (488 baris → 80 baris) — buat `analytics.service.ts`, pindahkan semua prisma + ChatLog + business logic ke service
- [x] 2.2 Jalankan tests setelah refactor — semua pass
- [x] 2.3 Semua controller lain sudah tipis — tidak perlu refactor

## 3. Verification

- [x] 3.1 Jalankan `lsp_diagnostics` pada semua file yang diubah — tidak ada type error
- [x] 3.2 Jalankan `npx vitest run` — semua test pass
