# soft-delete-consistency Specification

## Purpose
TBD - created by archiving change core-api-soft-delete-consistency. Update Purpose after archive.
## Requirements
### Requirement: Soft-deleted users cannot login
`auth.service.ts` login MUST menolak user yang memiliki `deletedAt` tidak null. Query login MUST menggunakan filter `deletedAt: null`.

#### Scenario: Soft-deleted user attempts login
- **WHEN** user yang sudah soft-deleted mencoba login dengan email + password yang valid
- **THEN** sistem mengembalikan error "Invalid credentials" (sama seperti user tidak ditemukan)

#### Scenario: Active user login succeeds
- **WHEN** user aktif (deletedAt: null) login dengan credentials yang valid
- **THEN** login berhasil dan JWT dikembalikan

### Requirement: Analytics service excludes soft-deleted entities
`analytics.service.ts` MUST menggunakan filter `deletedAt: null` saat fetch group dan course.

#### Scenario: Analytics for soft-deleted group
- **WHEN** analytics diminta untuk group yang sudah soft-deleted
- **THEN** sistem mengembalikan 404 "Group not found"

### Requirement: Socket.IO send_message rejects soft-deleted chat space
`send_message` handler MUST menolak pesan ke ChatSpace yang sudah soft-deleted.

#### Scenario: Message sent to soft-deleted chat space
- **WHEN** client emit `send_message` ke roomId yang sudah soft-deleted
- **THEN** server emit `error` event "Chat space not found" dan tidak menyimpan pesan

