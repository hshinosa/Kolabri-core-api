## 1. AI Engine Client Method

- [x] 1.1 Tambah method `async validateGoal(goalText, userId, chatSpaceId)` ke `AIEngineService`
- [x] 1.2 Return type: `{ success, is_valid, score, feedback, socratic_hint?, missing_criteria?, error? }`

## 2. Goal Service Update

- [x] 2.1 Import `aiEngineService` di `goal.service.ts`
- [x] 2.2 Setelah local validation lolos, call `aiEngineService.validateGoal()`
- [x] 2.3 Jika AI Engine `is_valid === false` → throw `ApiError.badRequest(feedback)`
- [x] 2.4 Jika AI Engine unavailable → lanjut dengan `isValidated: true`
- [x] 2.5 Update return object dengan `feedback` dan `socratic_hint`

## 3. Verifikasi

- [x] 3.1 Jalankan `lsp_diagnostics` — 0 errors (1 pre-existing di test file)
