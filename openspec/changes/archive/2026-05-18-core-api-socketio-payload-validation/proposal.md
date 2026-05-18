## Why

Event handlers di Socket.IO (`send_message`, `join_room`, `typing`, `leave_room`) tidak memvalidasi payload yang diterima. User bisa mengirim `roomId: null`, `content: undefined`, atau field yang hilang sama sekali, dan server langsung memproses tanpa cek. Ini menyebabkan runtime errors yang tidak terprediksi dan membuka vektor abuse.

## What Changes

- Definisikan Zod schemas untuk setiap event payload
- Tambah validasi di awal setiap event handler sebelum processing
- Emit `validation_error` event ke client jika payload tidak valid (bukan silent fail)
- Tidak mengubah business logic yang sudah ada — hanya tambah guard di depan

## Capabilities

### New Capabilities

- `socketio-payload-validation`: Validasi Zod untuk semua event payload di Socket.IO handler, dengan error feedback ke client

## Impact

- `src/socket/index.ts` — tambah validasi di 4 event handlers
- Client app perlu handle `validation_error` event untuk feedback ke user
- Tidak ada perubahan di rate limiter atau auth middleware
