## 1. Rate Limiter Utility

- [x] 1.1 Buat file `src/utils/socketRateLimiter.ts`
- [x] 1.2 Implementasi `SocketRateLimiter` class dengan sliding window counter menggunakan `Map<socketId, Map<eventName, number[]>>`
- [x] 1.3 Implementasi method `isAllowed(socketId: string, event: string): boolean` — cek apakah event masih dalam limit
- [x] 1.4 Implementasi method `recordViolation(socketId: string): number` — catat pelanggaran, return total violations dalam 1 menit
- [x] 1.5 Implementasi method `cleanup(socketId: string): void` — hapus semua state untuk socket yang disconnect
- [x] 1.6 Definisikan limits per event: `send_message` (10/10s), `join_room` (5/60s), `typing` (30/10s), `leave_room` (10/60s)

## 2. Socket.IO Integration

- [x] 2.1 Baca `src/socket/index.ts` untuk memahami event handler structure saat ini
- [x] 2.2 Import `SocketRateLimiter` di `src/socket/index.ts`
- [x] 2.3 Inisialisasi satu instance `SocketRateLimiter` (shared across all sockets)
- [x] 2.4 Wrap handler `send_message` — cek `isAllowed()` sebelum proses, emit `rate_limit_exceeded` jika tidak allowed
- [x] 2.5 Wrap handler `join_room` — cek `isAllowed()` sebelum proses
- [x] 2.6 Wrap handler `typing` — cek `isAllowed()` sebelum proses
- [x] 2.7 Tambah logic disconnect otomatis: jika `recordViolation()` return >= 3 → `socket.disconnect(true)`
- [x] 2.8 Tambah `socket.on('disconnect', () => rateLimiter.cleanup(socket.id))` untuk cleanup

## 3. Error Event Format

- [x] 3.1 Pastikan `rate_limit_exceeded` event dikirim dengan payload: `{ event: string, retryAfter: number, message: string }`
- [x] 3.2 Hitung `retryAfter` berdasarkan sisa window time untuk event tersebut

## 4. Tests

- [x] 4.1 Buat `src/utils/socketRateLimiter.test.ts`
- [x] 4.2 Test: 10 messages dalam 10s → semua allowed
- [x] 4.3 Test: message ke-11 dalam 10s → tidak allowed
- [x] 4.4 Test: setelah window reset → allowed lagi
- [x] 4.5 Test: cleanup menghapus semua state untuk socket
- [x] 4.6 Test: 3 violations → disconnect threshold tercapai
- [x] 4.7 Jalankan `npx vitest run src/utils/socketRateLimiter.test.ts` — semua test pass
- [x] 4.8 Jalankan `lsp_diagnostics` pada file yang diubah — tidak ada type error

## 2. Socket.IO Integration

- [x] 2.1 Baca `src/socket/index.ts` untuk memahami event handler structure saat ini
- [x] 2.2 Import `SocketRateLimiter` di `src/socket/index.ts`
- [x] 2.3 Inisialisasi satu instance `SocketRateLimiter` (shared across all sockets)
- [x] 2.4 Wrap handler `send_message` — cek `isAllowed()` sebelum proses, emit `rate_limit_exceeded` jika tidak allowed
- [x] 2.5 Wrap handler `join_room` — cek `isAllowed()` sebelum proses
- [x] 2.6 Wrap handler `typing` — cek `isAllowed()` sebelum proses
- [x] 2.7 Tambah logic disconnect otomatis: jika `recordViolation()` return >= 3 → `socket.disconnect(true)`
- [x] 2.8 Tambah `socket.on('disconnect', () => rateLimiter.cleanup(socket.id))` untuk cleanup

## 3. Error Event Format

- [x] 3.1 Pastikan `rate_limit_exceeded` event dikirim dengan payload: `{ event: string, retryAfter: number, message: string }`
- [x] 3.2 Hitung `retryAfter` berdasarkan sisa window time untuk event tersebut

## 4. Tests

- [x] 4.1 Buat `src/utils/socketRateLimiter.test.ts`
- [x] 4.2 Test: 10 messages dalam 10s → semua allowed
- [x] 4.3 Test: message ke-11 dalam 10s → tidak allowed
- [x] 4.4 Test: setelah window reset → allowed lagi
- [x] 4.5 Test: cleanup menghapus semua state untuk socket
- [x] 4.6 Test: 3 violations → disconnect threshold tercapai
- [x] 4.7 Jalankan `npx vitest run src/utils/socketRateLimiter.test.ts` — semua test pass
- [x] 4.8 Jalankan `lsp_diagnostics` pada file yang diubah — tidak ada type error
