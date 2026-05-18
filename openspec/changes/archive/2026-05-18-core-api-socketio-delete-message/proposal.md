## Why

Event `delete_message` di Socket.IO tidak memiliki rate limiting dan tidak ada validasi payload. Berbeda dengan `send_message`, `join_room`, dan `typing` yang sudah di-cover di change sebelumnya, `delete_message` terlewat. User bisa spam delete requests atau mengirim payload yang tidak valid.

## What Changes

- Tambah `delete_message` ke `SocketRateLimiter` limits: 20 deletes per 60 detik per socket
- Tambah `deleteMessageSchema` di `src/validators/socket.validator.ts`
- Tambah rate limit check + payload validation di `delete_message` handler di `src/socket/index.ts`

## Capabilities

### Modified Capabilities

- `socketio-rate-limiting`: Extend coverage ke `delete_message` event
- `socketio-payload-validation`: Extend coverage ke `delete_message` event

## Impact

- `src/utils/socketRateLimiter.ts` — tambah limit untuk `delete_message`
- `src/validators/socket.validator.ts` — tambah `deleteMessageSchema`
- `src/socket/index.ts` — tambah rate limit + validation di `delete_message` handler
