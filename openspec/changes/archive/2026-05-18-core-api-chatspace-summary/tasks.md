## 1. Summary Generation di closeSession()

- [x] 1.1 Import `ChatLog` dan `aiEngineService` di `chatSpace.service.ts`
- [x] 1.2 Query MongoDB: `ChatLog.find({ chatSpaceId, isDeleted: { $ne: true }, senderType: { $in: ['student', 'lecturer'] } }).sort({ createdAt: -1 }).limit(30).lean()`
- [x] 1.3 Panggil `aiEngineService.generateSummary(messages.reverse().map(...), chatSpaceId)`
- [x] 1.4 Wrap dalam try/catch — jika gagal, `summary = null`
- [x] 1.5 Tambah `summary?: string | null` ke return object

## 2. Verifikasi

- [x] 2.1 Jalankan `lsp_diagnostics` — 0 errors
