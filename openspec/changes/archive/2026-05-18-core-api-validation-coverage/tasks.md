## 1. Audit

- [x] 1.1 Baca semua 17 route files di `src/routes/` — catat endpoint mana yang sudah punya validate middleware dan mana yang belum
- [x] 1.2 Baca `src/validators/` — catat Zod schemas yang sudah ada
- [x] 1.3 Buat tabel gap analysis: endpoint vs validation status (ada/tidak ada)
- [x] 1.4 Prioritaskan endpoint yang handle user input langsung: auth, course, group, chatSpace, goal, reflection

## 2. Middleware Standardization

- [x] 2.1 Baca `src/middleware/validate.ts` untuk memahami implementasi saat ini
- [x] 2.2 Update `src/middleware/validate.ts` — standarkan error response format: `{ error: "Validation failed", details: [{ field: string, message: string }] }`
- [x] 2.3 Map `ZodError.issues` ke format `{ field: issue.path.join('.'), message: issue.message }`
- [x] 2.4 Pastikan HTTP status selalu 400 untuk validation errors

## 3. Validator Files

- [x] 3.1 Buat/update `src/validators/auth.validator.ts` — schemas untuk register, login
- [x] 3.2 Buat/update `src/validators/course.validator.ts` — schemas untuk create, update course
- [x] 3.3 Buat/update `src/validators/group.validator.ts` — schemas untuk create, update group
- [x] 3.4 Buat/update `src/validators/chatSpace.validator.ts` — schemas untuk create chatSpace
- [x] 3.5 Buat/update `src/validators/goal.validator.ts` — schemas untuk create, update goal
- [x] 3.6 Buat/update `src/validators/reflection.validator.ts` — schemas untuk submit reflection
- [x] 3.7 Buat/update `src/validators/aiChat.validator.ts` — schemas untuk create AI chat session
- [x] 3.8 Buat/update `src/validators/knowledgeBase.validator.ts` — schemas untuk upload document

## 4. Route Updates

- [x] 4.1 Update `src/routes/auth.routes.ts` — tambah validate middleware ke semua POST endpoints
- [x] 4.2 Update `src/routes/course.routes.ts` — tambah validate middleware ke POST/PUT/PATCH
- [x] 4.3 Update `src/routes/group.routes.ts` — tambah validate middleware ke POST/PUT/PATCH
- [x] 4.4 Update `src/routes/chatSpace.routes.ts` — tambah validate middleware
- [x] 4.5 Update `src/routes/goal.routes.ts` — tambah validate middleware
- [x] 4.6 Update `src/routes/reflection.routes.ts` — tambah validate middleware
- [x] 4.7 Update routes lain yang teridentifikasi di audit (task 1.1)

## 5. Tests

- [x] 5.1 Update `src/middleware/validate.test.ts` — test format error response baru
- [x] 5.2 Tambah test per domain: invalid body → 400 dengan format standar
- [x] 5.3 Tambah test: missing required field → 400 dengan field name yang benar di `details`
- [x] 5.4 Tambah test: valid body → request diteruskan ke handler
- [x] 5.5 Jalankan `npx vitest run` untuk semua test — semua pass (atau pre-existing failures dicatat)
- [x] 5.6 Jalankan `lsp_diagnostics` pada semua file yang diubah — tidak ada type error

## 2. Middleware Standardization

- [x] 2.1 Baca `src/middleware/validate.ts` untuk memahami implementasi saat ini
- [x] 2.2 Update `src/middleware/validate.ts` — standarkan error response format: `{ error: "Validation failed", details: [{ field: string, message: string }] }`
- [x] 2.3 Map `ZodError.issues` ke format `{ field: issue.path.join('.'), message: issue.message }`
- [x] 2.4 Pastikan HTTP status selalu 400 untuk validation errors

## 3. Validator Files

- [x] 3.1 Buat/update `src/validators/auth.validator.ts` — schemas untuk register, login
- [x] 3.2 Buat/update `src/validators/course.validator.ts` — schemas untuk create, update course
- [x] 3.3 Buat/update `src/validators/group.validator.ts` — schemas untuk create, update group
- [x] 3.4 Buat/update `src/validators/chatSpace.validator.ts` — schemas untuk create chatSpace
- [x] 3.5 Buat/update `src/validators/goal.validator.ts` — schemas untuk create, update goal
- [x] 3.6 Buat/update `src/validators/reflection.validator.ts` — schemas untuk submit reflection
- [x] 3.7 Buat/update `src/validators/aiChat.validator.ts` — schemas untuk create AI chat session
- [x] 3.8 Buat/update `src/validators/knowledgeBase.validator.ts` — schemas untuk upload document

## 4. Route Updates

- [x] 4.1 Update `src/routes/auth.routes.ts` — tambah validate middleware ke semua POST endpoints
- [x] 4.2 Update `src/routes/course.routes.ts` — tambah validate middleware ke POST/PUT/PATCH
- [x] 4.3 Update `src/routes/group.routes.ts` — tambah validate middleware ke POST/PUT/PATCH
- [x] 4.4 Update `src/routes/chatSpace.routes.ts` — tambah validate middleware
- [x] 4.5 Update `src/routes/goal.routes.ts` — tambah validate middleware
- [x] 4.6 Update `src/routes/reflection.routes.ts` — tambah validate middleware
- [x] 4.7 Update routes lain yang teridentifikasi di audit (task 1.1)

## 5. Tests

- [x] 5.1 Update `src/middleware/validate.test.ts` — test format error response baru
- [x] 5.2 Tambah test per domain: invalid body → 400 dengan format standar
- [x] 5.3 Tambah test: missing required field → 400 dengan field name yang benar di `details`
- [x] 5.4 Tambah test: valid body → request diteruskan ke handler
- [x] 5.5 Jalankan `npx vitest run` untuk semua test — semua pass (atau pre-existing failures dicatat)
- [x] 5.6 Jalankan `lsp_diagnostics` pada semua file yang diubah — tidak ada type error
