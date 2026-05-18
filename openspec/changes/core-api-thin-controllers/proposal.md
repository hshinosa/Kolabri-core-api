## Why

Beberapa controller di Core API masih "tebal" — mengandung business logic yang seharusnya ada di service layer. Controller seharusnya hanya bertugas: terima request, validasi input, panggil service, return response. Logic seperti transformasi data, kondisi bisnis, dan query langsung ke Prisma tidak boleh ada di controller.

## What Changes

- Audit semua 14 controller untuk identifikasi business logic yang salah tempat
- Pindahkan business logic dari controller ke service yang sesuai
- Controller harus tipis: parse input → call service → return response
- Tidak boleh ada `prisma.*` calls langsung di controller
- Tidak boleh ada kondisi bisnis (`if user.role === ...`) di controller — itu tugas service atau middleware

## Capabilities

### Modified Capabilities

- (none — ini adalah refactoring internal, tidak ada perubahan API contract atau behavior)

## Impact

- `src/controllers/` — controller yang teridentifikasi tebal
- `src/services/` — service yang menerima logic yang dipindah
- Tidak ada perubahan di routes, validators, atau middleware
