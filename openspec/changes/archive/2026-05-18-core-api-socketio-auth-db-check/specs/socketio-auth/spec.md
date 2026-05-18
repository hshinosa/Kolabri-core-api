## ADDED Requirements

### Requirement: Socket.IO connection rejected for deleted users
Socket.IO auth middleware MUST melakukan DB lookup setelah JWT signature berhasil diverifikasi. Koneksi MUST ditolak jika user tidak ditemukan atau soft-deleted.

#### Scenario: Valid token but user deleted
- **WHEN** client mencoba connect ke Socket.IO dengan JWT yang valid namun user-nya sudah dihapus dari database
- **THEN** koneksi ditolak dengan error "User not found" dan client menerima `connect_error` event

#### Scenario: Valid token but user soft-deleted
- **WHEN** client mencoba connect ke Socket.IO dengan JWT yang valid namun user memiliki `deletedAt` yang tidak null
- **THEN** koneksi ditolak dengan error "User not found"

#### Scenario: Valid token and user active
- **WHEN** client mencoba connect ke Socket.IO dengan JWT yang valid dan user masih aktif
- **THEN** koneksi diterima dan `socket.user` diisi dengan JWT payload
