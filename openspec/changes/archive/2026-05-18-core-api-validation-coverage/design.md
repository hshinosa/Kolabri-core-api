## Context

Core API memiliki 17 route files dengan total puluhan endpoints. Beberapa sudah menggunakan Zod validation via `validate` middleware, sebagian lain tidak. `src/validators/` sudah ada tapi coverage tidak lengkap. `src/middleware/validate.ts` sudah ada dan berfungsi. Error response format untuk validation errors belum seragam.

## Goals / Non-Goals

**Goals:**
- 100% endpoint coverage dengan Zod validation untuk semua POST/PUT/PATCH endpoints
- Standarkan error response format: `{ error: "Validation failed", details: [{ field, message }] }`
- Semua validators diorganisir per domain di `src/validators/`

**Non-Goals:**
- Mengubah business logic di controllers atau services
- Menambah endpoint baru
- Validasi untuk GET endpoints dengan query params (scope terbatas ke body validation)
- Response format untuk non-validation errors

## Decisions

**1. Audit-first approach**
Sebelum menulis kode, audit semua 17 route files untuk identifikasi gap. Output audit: tabel endpoint vs validation status. Ini mencegah over-engineering dan memastikan effort tepat sasaran.

**2. Validator per domain, bukan per endpoint**
`src/validators/auth.validator.ts`, `course.validator.ts`, dll. Satu file per domain, berisi semua Zod schemas untuk domain tersebut. Lebih mudah di-maintain daripada satu file per endpoint.

**3. Standarisasi error format di `validate` middleware**
Update `src/middleware/validate.ts` untuk selalu return format yang sama: `{ error: "Validation failed", details: ZodError.issues.map(...) }`. Ini breaking change untuk client yang sudah parse error response, tapi perlu untuk consistency.

**4. Required fields only untuk existing endpoints**
Untuk endpoint yang sudah ada, hanya tambah validation untuk required fields. Jangan tambah strict validation yang bisa break existing integrations. Untuk endpoint baru, bisa lebih strict.

## Risks / Trade-offs

- **[Risk] Standarisasi error format breaking untuk client app** → Mitigation: koordinasi dengan client app team, update error handling di Laravel controllers.
- **[Risk] Audit menemukan banyak gap yang butuh effort besar** → Mitigation: prioritaskan endpoint yang handle user input langsung (auth, course, group, chat).
- **[Risk] Zod schema terlalu strict break existing data** → Mitigation: start dengan `.optional()` untuk fields yang tidak critical, tighten later.

## Migration Plan

1. Audit semua 17 route files — buat tabel gap analysis
2. Update `src/middleware/validate.ts` — standarkan error response format
3. Buat/lengkapi validator files per domain di `src/validators/`
4. Update routes untuk gunakan validate middleware
5. Update client app error handling untuk format baru
6. Run existing tests — fix yang break karena format change
