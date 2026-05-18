## goal-creation (AI Engine Bloom's Validation)

Modifikasi goal creation flow untuk menggunakan AI Engine's Bloom's taxonomy validator.

### Requirements

#### REQ-GC-01: validateGoal() di aiEngineService

Method baru di `AIEngineService`:
```typescript
async validateGoal(
  goalText: string,
  userId: string,
  chatSpaceId: string
): Promise<{
  success: boolean;
  is_valid: boolean;
  score: number;
  feedback: string;
  socratic_hint?: string;
  missing_criteria?: string[];
  error?: string;
}>
```
Memanggil `POST /api/goals/validate` dengan body `{ goal_text, user_id, chat_space_id }`. Timeout: `ANALYTICS_TIMEOUT` (15s).

#### REQ-GC-02: Urutan Validasi di goal.service.ts

1. Jalankan local `validateGoalContent(data.content)` — jika gagal, throw `ApiError.badRequest` langsung (tidak perlu panggil AI Engine)
2. Jika local lolos, panggil `aiEngineService.validateGoal()`
3. Jika AI Engine unavailable atau error → gunakan `isValidated: true` (local passed = valid)
4. Jika AI Engine available → gunakan `aiResult.is_valid` untuk `isValidated`

#### REQ-GC-03: isValidated Reflects AI Engine Result

`isValidated` di PostgreSQL harus mencerminkan hasil AI Engine, bukan hardcoded `true`.

#### REQ-GC-04: Return feedback dan socratic_hint

Response `createGoal` diperluas dengan field opsional:
```typescript
{
  id, content, isValidated, chatSpace, createdBy, createdAt,
  feedback?: string,       // dari AI Engine
  socratic_hint?: string,  // dari AI Engine
}
```

#### REQ-GC-05: Graceful Degradation

Jika AI Engine down, goal tetap dibuat dengan `isValidated: true` (local validation passed). Tidak ada error yang dilempar ke user karena AI Engine unavailable.
