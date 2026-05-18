# socketio-rate-limiting Specification

## Purpose
TBD - created by archiving change core-api-socketio-rate-limit. Update Purpose after archive.
## Requirements
### Requirement: send_message event rate limited per socket
Sistem MUST membatasi jumlah event `send_message` yang dapat dikirim oleh satu socket. Limit: maksimum 10 pesan per 10 detik per socket. Jika limit terlampaui, sistem MUST mengembalikan error event ke socket tersebut.

#### Scenario: Message within rate limit
- **WHEN** socket mengirim 10 atau kurang event `send_message` dalam 10 detik
- **THEN** semua pesan diproses normal

#### Scenario: Message exceeds rate limit
- **WHEN** socket mengirim lebih dari 10 event `send_message` dalam 10 detik
- **THEN** sistem emit event `rate_limit_exceeded` ke socket tersebut dengan payload `{ event: "send_message", retryAfter: <seconds> }` dan pesan tidak diproses

### Requirement: join_room event rate limited per socket
Sistem MUST membatasi event `join_room`: maksimum 5 kali per 60 detik per socket.

#### Scenario: join_room exceeds rate limit
- **WHEN** socket mencoba join room lebih dari 5 kali dalam 60 detik
- **THEN** sistem emit `rate_limit_exceeded` ke socket tersebut

### Requirement: Abusive socket disconnected automatically
Jika socket melebihi rate limit sebanyak 3 kali dalam 1 menit (untuk event apapun), sistem MUST memutus koneksi socket tersebut.

#### Scenario: Socket disconnected after repeated abuse
- **WHEN** socket telah menerima 3 `rate_limit_exceeded` events dalam 1 menit
- **THEN** socket diputus koneksinya oleh server

### Requirement: Rate limit state cleaned up on disconnect
Saat socket disconnect, semua state rate limiting untuk socket tersebut MUST dihapus dari memory untuk mencegah memory leak.

#### Scenario: Memory cleaned on disconnect
- **WHEN** socket disconnect (normal atau karena abuse)
- **THEN** semua rate limit counters untuk socket ID tersebut dihapus dari memory

