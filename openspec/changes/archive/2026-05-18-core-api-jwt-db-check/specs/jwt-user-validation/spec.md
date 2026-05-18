## ADDED Requirements

### Requirement: JWT validation includes user existence check
Setelah JWT signature berhasil diverifikasi, sistem MUST melakukan lookup ke database untuk memastikan user dengan ID tersebut masih ada. Jika user tidak ditemukan, request MUST ditolak dengan HTTP 401.

#### Scenario: Valid token but user deleted
- **WHEN** request dikirim dengan JWT yang valid secara signature namun user-nya sudah dihapus dari database
- **THEN** sistem mengembalikan HTTP 401 dengan pesan "User not found"

#### Scenario: Valid token and user exists
- **WHEN** request dikirim dengan JWT yang valid dan user masih ada di database
- **THEN** request diteruskan ke handler

#### Scenario: Invalid JWT signature
- **WHEN** request dikirim dengan JWT yang signature-nya tidak valid
- **THEN** sistem mengembalikan HTTP 401 (behavior tidak berubah dari sebelumnya)

### Requirement: JWT validation includes user active status check
Jika sistem sudah mengimplementasikan soft delete, sistem MUST memeriksa bahwa user tidak dalam status soft-deleted (`deletedAt` is null). User yang soft-deleted MUST ditolak dengan HTTP 401.

#### Scenario: Valid token but user soft-deleted
- **WHEN** request dikirim dengan JWT yang valid namun user memiliki `deletedAt` yang tidak null
- **THEN** sistem mengembalikan HTTP 401 dengan pesan "User account is inactive"

#### Scenario: Valid token and user active
- **WHEN** request dikirim dengan JWT yang valid dan user memiliki `deletedAt` null
- **THEN** request diteruskan ke handler

### Requirement: DB lookup result cached in Redis
Untuk mengurangi latency, hasil DB lookup SHOULD di-cache di Redis dengan TTL 5 menit. Cache MUST di-invalidate saat user di-update atau di-delete.

#### Scenario: Cache hit on subsequent requests
- **WHEN** request kedua dikirim dengan JWT yang sama dalam window 5 menit
- **THEN** sistem menggunakan cached result tanpa DB lookup tambahan

#### Scenario: Cache invalidated after user deletion
- **WHEN** user dihapus dan kemudian request dikirim dengan token lama
- **THEN** cache di-invalidate dan DB lookup dilakukan, menghasilkan 401
