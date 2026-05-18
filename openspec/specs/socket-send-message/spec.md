# socket-send-message Specification

## Purpose
TBD - created by archiving change core-api-logic-listener-tracking. Update Purpose after archive.
## Requirements
### Requirement: Socket send_message fires AI Engine track-activity

Setelah `await chatLog.save()` di handler `send_message`, kode MUST memanggil `aiEngineService.trackActivity(groupId).catch(() => {})`. Pemanggilan SHALL berupa fire-and-forget tanpa `await` agar tidak menambah latency ke message delivery.

#### Scenario: Track activity dipanggil setelah message persistence

- **GIVEN** user mengirim message ke chat space yang valid
- **WHEN** `chatLog.save()` selesai
- **THEN** `aiEngineService.trackActivity(groupId)` dipanggil tanpa `await`
- **AND** error apapun dari pemanggilan tersebut tidak boleh mempengaruhi delivery `receive_message`

### Requirement: AIEngineService exposes trackActivity method

`AIEngineService` MUST menyediakan method `async trackActivity(groupId: string, userId: string): Promise<void>` yang melakukan `POST /api/track-activity` dengan body yang sesuai. Timeout SHALL 3 detik (lebih pendek dari analytics timeout).

#### Scenario: trackActivity HTTP request

- **GIVEN** `aiEngineService.trackActivity('group-1', 'user-1')` dipanggil
- **WHEN** request berhasil dikirim
- **THEN** body request berisi identifier group dan user
- **AND** timeout dibatasi pada 3 detik

### Requirement: trackActivity does not retry

`trackActivity()` MUST tidak menggunakan `resilient()` retry wrapper. Pesan berikutnya yang masuk akan memperbarui timestamp tracking, jadi retry per-call tidak diperlukan.

#### Scenario: trackActivity gagal tanpa retry

- **GIVEN** AI Engine merespon error atau timeout pada `trackActivity`
- **WHEN** caller menjalankan method tersebut
- **THEN** caller tidak boleh mencoba ulang request

### Requirement: trackActivity errors logged as debug

Semua error di `trackActivity()` SHALL di-catch dan di-log dengan level `debug` (bukan `error`), karena kegagalan tracking bukan critical error.

#### Scenario: Logging level untuk error tracking

- **GIVEN** AI Engine error saat handling `trackActivity`
- **WHEN** error sampai ke caller
- **THEN** logger tidak boleh menghasilkan entry level `error` atau `warn`
- **AND** logger SHALL menghasilkan entry level `debug`

