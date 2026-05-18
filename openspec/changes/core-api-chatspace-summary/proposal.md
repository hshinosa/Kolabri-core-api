## Why

Saat chat space ditutup, `closeSession()` hanya update PostgreSQL dan emit `session_closed` ke Socket.IO. AI Engine punya endpoint `/api/intervention/summary` yang bisa generate ringkasan diskusi dari pesan-pesan terakhir, tapi tidak pernah dipanggil. User tidak mendapat ringkasan diskusi saat sesi berakhir — padahal ini adalah momen penting untuk refleksi dan SRL.

## What Changes

- `chatSpace.service.ts` `closeSession()`: setelah update PostgreSQL, ambil 30 pesan terakhir dari MongoDB ChatLog, kirim ke `aiEngineService.generateSummary()`, sertakan summary dalam response
- Jika AI Engine unavailable atau gagal → tetap close session, summary field `null` (graceful degradation)
- Tambah `summary?: string` ke return type `closeSession()`

## Capabilities

### Modified Capabilities

- `chatspace-close`: Setelah session ditutup, generate summary diskusi via AI Engine dan sertakan dalam response. Client app bisa menampilkan summary kepada user.

## Impact

- `src/services/chatSpace.service.ts` — tambah summary generation setelah close
