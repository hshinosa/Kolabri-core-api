## 1. Dependency Setup

- [x] 1.1 Jalankan `npm install xss` di `Kolabri-core-api`
- [x] 1.2 Jalankan `npm install --save-dev @types/xss` untuk TypeScript types
- [x] 1.3 Verifikasi `xss` muncul di `package.json` dependencies

## 2. Sanitize Middleware

- [x] 2.1 Buat file `src/middleware/sanitize.ts`
- [x] 2.2 Implementasi fungsi `sanitizeValue(value: unknown): unknown` — rekursif untuk object/array, strip HTML untuk string
- [x] 2.3 Implementasi Express middleware `sanitizeBody` yang memanggil `sanitizeValue` pada `req.body`
- [x] 2.4 Skip sanitization jika `Content-Type` adalah `multipart/form-data` (file upload)
- [x] 2.5 Export middleware dari `sanitize.ts`

## 3. Integration ke App

- [x] 3.1 Baca `src/app.ts` untuk memahami middleware chain saat ini
- [x] 3.2 Import `sanitizeBody` di `src/app.ts`
- [x] 3.3 Tambah `app.use(sanitizeBody)` setelah `express.json()` dan sebelum route handlers
- [x] 3.4 Verifikasi urutan middleware: `express.json()` → `sanitizeBody` → `rateLimiter` → routes

## 4. Tests

- [x] 4.1 Buat `src/middleware/sanitize.test.ts`
- [x] 4.2 Test: string dengan HTML tags → tags di-strip
- [x] 4.3 Test: plain text → tidak berubah
- [x] 4.4 Test: nested object → semua string values di-sanitize rekursif
- [x] 4.5 Test: number/boolean/null → tidak berubah
- [x] 4.6 Test: array of strings → semua elements di-sanitize
- [x] 4.7 Jalankan `npx vitest run src/middleware/sanitize.test.ts` — semua test pass
- [x] 4.8 Jalankan `lsp_diagnostics` pada `src/middleware/sanitize.ts` — tidak ada type error

## 2. Sanitize Middleware

- [x] 2.1 Buat file `src/middleware/sanitize.ts`
- [x] 2.2 Implementasi fungsi `sanitizeValue(value: unknown): unknown` — rekursif untuk object/array, strip HTML untuk string
- [x] 2.3 Implementasi Express middleware `sanitizeBody` yang memanggil `sanitizeValue` pada `req.body`
- [x] 2.4 Skip sanitization jika `Content-Type` adalah `multipart/form-data` (file upload)
- [x] 2.5 Export middleware dari `sanitize.ts`

## 3. Integration ke App

- [x] 3.1 Baca `src/app.ts` untuk memahami middleware chain saat ini
- [x] 3.2 Import `sanitizeBody` di `src/app.ts`
- [x] 3.3 Tambah `app.use(sanitizeBody)` setelah `express.json()` dan sebelum route handlers
- [x] 3.4 Verifikasi urutan middleware: `express.json()` → `sanitizeBody` → `rateLimiter` → routes

## 4. Tests

- [x] 4.1 Buat `src/middleware/sanitize.test.ts`
- [x] 4.2 Test: string dengan HTML tags → tags di-strip
- [x] 4.3 Test: plain text → tidak berubah
- [x] 4.4 Test: nested object → semua string values di-sanitize rekursif
- [x] 4.5 Test: number/boolean/null → tidak berubah
- [x] 4.6 Test: array of strings → semua elements di-sanitize
- [x] 4.7 Jalankan `npx vitest run src/middleware/sanitize.test.ts` — semua test pass
- [x] 4.8 Jalankan `lsp_diagnostics` pada `src/middleware/sanitize.ts` — tidak ada type error
