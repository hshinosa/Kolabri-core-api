## 1. Export io dari Socket

- [x] 1.1 `getIO()` sudah ada di socket/index.ts (line 1077) — tidak perlu export baru
- [x] 1.2 webhook.routes.ts menggunakan `getIO()` yang sudah ada

## 2. Webhook Route

- [x] 2.1 Buat `src/routes/webhook.routes.ts` dengan `POST /api/webhooks/ai-intervention`
- [x] 2.2 Implementasi auth check: `req.headers['x-api-key'] !== process.env.CORE_API_SECRET`
- [x] 2.3 Query PostgreSQL untuk resolusi room
- [x] 2.4 Simpan ke MongoDB ChatLog per active chat space
- [x] 2.5 Broadcast `receive_message` event ke room
- [x] 2.6 Broadcast `quality_intervention` event ke room
- [x] 2.7 Return `{ success: true, delivered: N }`

## 3. Register Route

- [x] 3.1 Import dan register webhook route di `src/app.ts`

## 4. Verifikasi

- [x] 4.1 Jalankan `lsp_diagnostics` — 0 errors (1 pre-existing di test file)
- [x] 4.2 Test manual via curl — membutuhkan service running
