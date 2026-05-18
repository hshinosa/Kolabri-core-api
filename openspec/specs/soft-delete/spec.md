# soft-delete Specification

## Purpose
TBD - created by archiving change core-api-soft-delete. Update Purpose after archive.
## Requirements
### Requirement: User soft delete preserves data
Sistem MUST mengimplementasikan soft delete untuk model `User`. Operasi delete MUST mengisi field `deletedAt` dengan timestamp saat ini, bukan menghapus record dari database. User yang soft-deleted MUST tidak muncul di query normal.

#### Scenario: User soft deleted
- **WHEN** admin menghapus user
- **THEN** field `deletedAt` diisi dengan timestamp saat ini dan user tidak muncul di list users

#### Scenario: Soft-deleted user excluded from queries
- **WHEN** sistem melakukan query untuk daftar users
- **THEN** users dengan `deletedAt` tidak null tidak dikembalikan

#### Scenario: Soft-deleted user token rejected
- **WHEN** user yang sudah soft-deleted mencoba login atau menggunakan token lama
- **THEN** sistem mengembalikan 401

### Requirement: Course soft delete cascades to Groups and ChatSpaces
Sistem MUST mengimplementasikan soft delete untuk model `Course`. Saat Course di-soft-delete, semua `Group` yang terkait MUST ikut di-soft-delete, dan semua `ChatSpace` dalam group tersebut MUST ikut di-soft-delete. Cascade MUST dijalankan dalam satu Prisma transaction.

#### Scenario: Course soft delete cascades
- **WHEN** lecturer menghapus course
- **THEN** course, semua groups-nya, dan semua chatspaces dalam groups tersebut memiliki `deletedAt` terisi, dalam satu atomic transaction

#### Scenario: Cascade failure rolls back
- **WHEN** cascade soft delete gagal di tengah jalan
- **THEN** seluruh transaction di-rollback dan tidak ada record yang ter-soft-delete

### Requirement: Group soft delete
Sistem MUST mengimplementasikan soft delete untuk model `Group`. Group yang soft-deleted MUST tidak muncul di query normal.

#### Scenario: Group soft deleted
- **WHEN** group dihapus
- **THEN** `deletedAt` diisi dan group tidak muncul di list groups

### Requirement: ChatSpace soft delete
Sistem MUST mengimplementasikan soft delete untuk model `ChatSpace`. ChatSpace yang soft-deleted MUST tidak muncul di query normal.

#### Scenario: ChatSpace soft deleted
- **WHEN** chatspace dihapus
- **THEN** `deletedAt` diisi dan chatspace tidak muncul di list chatspaces

### Requirement: KnowledgeBase soft delete
Sistem MUST mengimplementasikan soft delete untuk model `KnowledgeBase`. KnowledgeBase yang soft-deleted MUST tidak muncul di query normal.

#### Scenario: KnowledgeBase soft deleted
- **WHEN** document dihapus dari knowledge base
- **THEN** `deletedAt` diisi dan document tidak muncul di list documents

### Requirement: Admin hard delete endpoint available
Sistem MUST menyediakan endpoint hard delete yang hanya dapat diakses oleh admin role, untuk keperluan compliance (GDPR right to erasure).

#### Scenario: Admin hard deletes user
- **WHEN** admin memanggil hard delete endpoint untuk user
- **THEN** record dihapus permanen dari database

#### Scenario: Non-admin cannot hard delete
- **WHEN** non-admin mencoba memanggil hard delete endpoint
- **THEN** sistem mengembalikan HTTP 403

