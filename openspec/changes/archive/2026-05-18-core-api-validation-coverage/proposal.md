## Why

Validation coverage di Core API tidak merata — beberapa endpoint sudah divalidasi dengan Zod, sebagian lain tidak ada validasi sama sekali. Ini membuat API correctness dan safety tidak konsisten: endpoint yang tidak divalidasi bisa menerima data malformed, missing fields, atau tipe yang salah tanpa error yang jelas.

## What Changes

- Audit semua 17 route files untuk identifikasi endpoint yang belum punya Zod validation
- Buat atau lengkapi Zod schema di `src/validators/` untuk semua endpoint yang belum ter-cover
- Standarkan error response format untuk validation errors (400 dengan field-level error messages)
- Pastikan semua route menggunakan `validate` middleware yang sudah ada
- Tidak mengubah business logic — hanya menambah/melengkapi validation layer

## Capabilities

### New Capabilities

- `api-validation-standardization`: Zod validation yang konsisten untuk semua endpoint di 17 route files, dengan standar error response format yang seragam

### Modified Capabilities

- (none — ini adalah penambahan coverage, bukan perubahan requirement yang sudah ada)

## Impact

- `src/validators/` — tambah/lengkapi Zod schemas untuk semua domain
- `src/routes/` — pastikan semua route menggunakan validate middleware
- `src/middleware/validate.ts` — standarkan error response format
- Tidak ada perubahan di controller atau service layer
- Client app perlu handle 400 validation errors yang sebelumnya mungkin tidak ada
