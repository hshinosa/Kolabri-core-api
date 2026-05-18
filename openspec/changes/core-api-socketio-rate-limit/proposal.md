## Why

Socket.IO events tidak memiliki rate limiting. User bisa spam event `send_message` dan event lainnya tanpa batas, membuka vektor abuse, degraded performance untuk semua user di room yang sama, dan potensi denial-of-service pada layer realtime.

## What Changes

- Tambah per-socket rate limiter di `src/socket/index.ts`
- Rate limit per event type: `send_message` paling ketat (misal: 10 pesan/10 detik per socket)
- Event lain seperti `join_room`, `typing` juga dibatasi tapi lebih longgar
- Implementasi menggunakan in-memory counter per socket ID (tidak butuh Redis untuk MVP)
- Emit error event ke client jika rate limit terlampaui, bukan silent drop
- Disconnect socket jika abuse terdeteksi (threshold lebih tinggi)

## Capabilities

### New Capabilities

- `socketio-rate-limiting`: Rate limiting per-socket per-event-type pada Socket.IO handler, dengan error feedback ke client dan disconnect otomatis untuk abuse

### Modified Capabilities

- (none)

## Impact

- `src/socket/index.ts` — file utama yang diubah
- Tidak ada dependency baru yang diperlukan (implementasi in-memory)
- Client app perlu handle error event dari rate limiter (UI feedback)
