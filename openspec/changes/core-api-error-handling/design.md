## Context

14 controller files di `src/controllers/`. Pola yang ada saat ini bervariasi — beberapa sudah konsisten menggunakan `next(error)`, beberapa masih ada yang return response manual atau punya empty catch. Audit diperlukan sebelum bisa menentukan scope perubahan yang tepat.

## Goals / Non-Goals

**Goals:**
- Semua error di controller lewat `next(error)` atau `next(ApiError.xxx())`
- Tidak ada `res.status(xxx).json({ error: ... })` manual
- Tidak ada empty catch block
- Semua async handler punya try/catch

**Non-Goals:**
- Mengubah error messages yang sudah ada
- Mengubah HTTP status codes
- Mengubah business logic

## Decisions

**1. Audit-first**
Baca semua 14 controller, identifikasi pattern yang tidak konsisten, baru fix.

**2. Minimal change**
Hanya ubah error handling pattern, tidak refactor logic lain.

**3. Gunakan `ApiError` yang sudah ada**
Tidak perlu tambah error type baru.

## Risks / Trade-offs

- **[Risk] Mengubah error format yang sudah diexpect client** → Mitigation: hanya standarisasi yang sudah lewat `errorHandler`, format response tidak berubah.

## Migration Plan

1. Audit 14 controller — list semua inconsistency
2. Fix per controller
3. Run tests
