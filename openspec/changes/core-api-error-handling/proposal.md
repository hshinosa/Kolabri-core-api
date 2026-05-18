## Why

Error handling di Core API tidak konsisten antar controller. Beberapa controller menggunakan `try/catch` dengan format response yang berbeda-beda, beberapa melempar error langsung ke `next()`, dan beberapa mengembalikan response manual tanpa menggunakan `ApiError`. Ini membuat debugging sulit dan client app harus handle berbagai format error.

## What Changes

- Audit semua 14 controller untuk identifikasi pola error handling yang tidak konsisten
- Standarisasi: semua error harus lewat `next(error)` atau `next(ApiError.xxx())`
- Tidak boleh ada `res.status(xxx).json({ error: ... })` manual di controller — semua lewat `errorHandler` middleware
- Tidak boleh ada empty catch block `catch(e) {}`
- Pastikan semua async controller handler di-wrap dengan try/catch

## Capabilities

### Modified Capabilities

- (none — ini adalah perbaikan internal, tidak ada perubahan API contract)

## Impact

- `src/controllers/` — semua 14 controller file
- `src/middleware/errorHandler.ts` — mungkin perlu extend untuk cover edge cases baru
- Tidak ada perubahan di routes atau services
