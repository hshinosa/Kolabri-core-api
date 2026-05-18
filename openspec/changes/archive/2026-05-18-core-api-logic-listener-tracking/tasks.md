## 1. AI Engine Endpoint

- [x] 1.1 Tambah `TrackActivityRequest(BaseModel)` ke `app/api/schemas.py`
- [x] 1.2 Tambah endpoint `POST /api/track-activity` ke `app/api/routes.py`
- [x] 1.3 Verifikasi endpoint bisa dipanggil — membutuhkan service running

## 2. Core API Client

- [x] 2.1 Tambah method `async trackActivity(groupId: string): Promise<void>` ke `AIEngineService`
- [x] 2.2 Tambah fire-and-forget call di socket `send_message` handler setelah `await chatLog.save()`
- [x] 2.3 Jalankan `lsp_diagnostics` — 0 errors (1 pre-existing di test file)
