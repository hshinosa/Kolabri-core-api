## socket-send-message (Logic Listener Tracking)

Modifikasi socket `send_message` handler untuk memanggil AI Engine track-activity setiap pesan dikirim.

### Requirements

#### REQ-SSM-01: Fire-and-Forget trackActivity Call

Setelah `await chatLog.save()`, tambahkan:
```typescript
aiEngineService.trackActivity(groupId).catch(() => {});
```
Tidak ada `await` — tidak boleh menambah latency ke message delivery.

#### REQ-SSM-02: trackActivity() di aiEngineService

Method baru di `AIEngineService`:
```typescript
async trackActivity(groupId: string): Promise<void>
```
Memanggil `POST /api/track-activity` dengan body `{ group_id: groupId }`. Tidak perlu return value. Timeout: 3 detik (lebih pendek dari analytics timeout karena ini fire-and-forget).

#### REQ-SSM-03: Tidak Ada Retry

`trackActivity()` tidak menggunakan `resilient()` wrapper — tidak perlu retry untuk operasi tracking. Jika gagal, pesan berikutnya akan update timestamp.

#### REQ-SSM-04: Error Handling

Semua error di `trackActivity()` di-catch dan di-log sebagai `debug` (bukan `error`) — tracking failure bukan critical error.
