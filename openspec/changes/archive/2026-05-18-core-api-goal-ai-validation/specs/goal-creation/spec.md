## ADDED Requirements

### Requirement: AIEngineService exposes validateGoal method

`AIEngineService` MUST menyediakan method `async validateGoal(goalText, userId, chatSpaceId)` yang memanggil `POST /api/goals/validate` dengan body `{ goal_text, user_id, chat_space_id }`. Timeout SHALL menggunakan `ANALYTICS_TIMEOUT` (15s). Return type berisi `success`, `is_valid`, `score`, `feedback`, `socratic_hint`, `missing_criteria`, `error`.

#### Scenario: validateGoal HTTP request

- **GIVEN** `aiEngineService.validateGoal('Memahami SOLID', 'user-1', 'cs-1')` dipanggil
- **WHEN** request dibuat
- **THEN** body request berisi `goal_text`, `user_id`, `chat_space_id`
- **AND** timeout dibatasi 15 detik

### Requirement: Goal creation runs local validation first

`GoalService.createGoal` MUST menjalankan `validateGoalContent(data.content)` terlebih dulu. Jika validasi lokal gagal, service SHALL throw `ApiError.badRequest` tanpa memanggil AI Engine.

#### Scenario: Local validation gagal

- **GIVEN** content goal kosong atau melanggar Bloom verb whitelist lokal
- **WHEN** `createGoal` dipanggil
- **THEN** service melempar `ApiError.badRequest`
- **AND** AI Engine tidak dipanggil

#### Scenario: Local validation lolos

- **GIVEN** content goal valid menurut helper lokal
- **WHEN** `createGoal` dipanggil
- **THEN** service memanggil `aiEngineService.validateGoal(...)`

### Requirement: isValidated reflects AI Engine result

Setelah local validation lolos, `isValidated` di PostgreSQL MUST diisi dari hasil `aiResult.is_valid`. Hardcoded `true` SHALL tidak diizinkan ketika AI Engine merespon sukses.

#### Scenario: AI Engine memvalidasi sebagai valid

- **GIVEN** `aiEngineService.validateGoal` returns `{ success: true, is_valid: true, ... }`
- **WHEN** goal disimpan
- **THEN** field `isValidated` bernilai `true`

#### Scenario: AI Engine memvalidasi sebagai invalid

- **GIVEN** `aiEngineService.validateGoal` returns `{ success: true, is_valid: false, feedback, missing_criteria }`
- **WHEN** service memproses hasil
- **THEN** service melempar `ApiError.badRequest` dengan pesan `feedback` dan saran refinement

### Requirement: createGoal response includes AI feedback

Response object `createGoal` MUST diperluas dengan field opsional `feedback` dan `socratic_hint` yang diisi dari AI Engine ketika tersedia.

#### Scenario: AI Engine mengembalikan feedback dan hint

- **GIVEN** `aiEngineService.validateGoal` returns `is_valid: true` dengan `feedback` dan `socratic_hint`
- **WHEN** `createGoal` selesai
- **THEN** response memuat field `feedback` dan `socratic_hint`

### Requirement: Graceful degradation when AI Engine unavailable

Jika `aiEngineService.validateGoal` throw atau return `success: false`, goal MUST tetap dibuat dengan `isValidated: true` (mengikuti hasil local validation). Service SHALL tidak melempar error tambahan ke caller karena AI Engine offline.

#### Scenario: AI Engine timeout

- **GIVEN** `aiEngineService.validateGoal` melempar timeout/network error
- **WHEN** `createGoal` memproses error
- **THEN** goal tetap di-persist dengan `isValidated: true`
- **AND** caller menerima respons sukses
