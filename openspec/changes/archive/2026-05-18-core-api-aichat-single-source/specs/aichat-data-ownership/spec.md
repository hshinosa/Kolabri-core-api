## ADDED Requirements

### Requirement: AiChat session metadata stored only in PostgreSQL
Sistem MUST menyimpan AiChat session metadata (session ID, userId, provider, model, timestamps) hanya di PostgreSQL via Prisma `AiChat` model. Tidak boleh ada duplikasi session metadata di MongoDB.

#### Scenario: New AI chat session created
- **WHEN** user memulai sesi AI chat baru
- **THEN** session metadata hanya ditulis ke PostgreSQL, tidak ke MongoDB

#### Scenario: Session metadata queried
- **WHEN** sistem perlu mengambil metadata sesi AI chat
- **THEN** data dibaca dari PostgreSQL saja

#### Scenario: No duplicate session in MongoDB
- **WHEN** sesi AI chat dibuat atau diupdate
- **THEN** tidak ada write ke Mongoose model yang menyimpan session metadata

### Requirement: Chat messages stored only in MongoDB
Chat messages (konten pesan, sender, timestamp) MUST disimpan hanya di MongoDB via `ChatLog` Mongoose model. PostgreSQL tidak menyimpan konten pesan individual.

#### Scenario: Message sent in AI chat
- **WHEN** user atau AI mengirim pesan dalam sesi AI chat
- **THEN** pesan ditulis ke MongoDB ChatLog, bukan ke PostgreSQL

#### Scenario: Chat history retrieved
- **WHEN** sistem mengambil riwayat chat untuk sesi tertentu
- **THEN** pesan dibaca dari MongoDB ChatLog menggunakan session ID sebagai referensi

### Requirement: Data migration preserves existing sessions
Jika ada session data di MongoDB yang belum ada di PostgreSQL, data tersebut MUST dimigrasikan ke PostgreSQL sebelum MongoDB session data dihapus. Tidak boleh ada data loss.

#### Scenario: Migration script runs successfully
- **WHEN** migration script dijalankan
- **THEN** semua session dari MongoDB yang belum ada di PostgreSQL berhasil ditulis ke PostgreSQL dan count match diverifikasi sebelum MongoDB data dihapus
