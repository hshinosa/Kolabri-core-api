## 1. Validator File

- [x] 1.1 Buat `src/validators/socket.validator.ts`
- [x] 1.2 Definisikan `joinRoomSchema` — courseId, groupId, chatSpaceId (UUID)
- [x] 1.3 Definisikan `sendMessageSchema` — roomId, content, courseId, groupId + optional fields
- [x] 1.4 Definisikan `typingSchema` — roomId, isTyping
- [x] 1.5 Export helper `emitValidationError(socket, event, issues)` yang emit `validation_error`

## 2. Integration ke Socket.IO Handlers

- [x] 2.1 Import schemas di `src/socket/index.ts`
- [x] 2.2 Tambah validasi di `join_room` handler — `safeParse`, emit `validation_error` jika gagal, return
- [x] 2.3 Tambah validasi di `send_message` handler — `safeParse`, emit `validation_error` jika gagal, return
- [x] 2.4 Tambah validasi di `typing` handler — `safeParse`, silent return jika gagal

## 3. Verification

- [x] 3.1 Jalankan `lsp_diagnostics` pada file yang diubah — tidak ada type error
- [x] 3.2 Jalankan `npx vitest run` — semua test pass
