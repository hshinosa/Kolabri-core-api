# chatspace-close Specification

## Purpose
TBD - created by archiving change core-api-chatspace-summary. Update Purpose after archive.
## Requirements
### Requirement: closeSession reads recent ChatLog messages

Setelah `prisma.chatSpace.update()` berhasil, service MUST query MongoDB `ChatLog.find({ chatSpaceId, isDeleted: { $ne: true }, senderType: { $in: ['student', 'lecturer'] } }).sort({ createdAt: -1 }).limit(30).lean()`.

#### Scenario: Recent messages diquery setelah close

- **GIVEN** chat space dengan beberapa message non-deleted dari student/lecturer
- **WHEN** `closeSession` dijalankan
- **THEN** service query MongoDB untuk maksimal 30 message terbaru

### Requirement: closeSession generates summary via AI Engine

Jika `recentMessages.length > 0`, service MUST memanggil `aiEngineService.generateSummary(messages, chatSpaceId)`. Messages SHALL dikirim dalam urutan kronologis (lama → baru) dengan field `sender`, `content`, `timestamp`.

#### Scenario: Summary diminta dengan messages chronological

- **GIVEN** 30 messages tersedia
- **WHEN** `closeSession` memanggil AI Engine
- **THEN** array dikirim setelah `reverse()` (chronological)
- **AND** setiap entry punya `sender`, `content`, `timestamp`

### Requirement: closeSession degrades gracefully on summary failure

Jika `recentMessages.length === 0` atau `aiEngineService.generateSummary()` gagal/throw, service MUST set `summary = null` dan SHALL tidak menggagalkan close operation.

#### Scenario: AI Engine gagal generate summary

- **GIVEN** AI Engine merespon error ketika `generateSummary` dipanggil
- **WHEN** `closeSession` memproses hasil
- **THEN** chat space tetap tertutup
- **AND** field `summary` pada return value bernilai `null`

#### Scenario: Tidak ada recent messages

- **GIVEN** chat space tidak punya message dari student/lecturer
- **WHEN** `closeSession` dijalankan
- **THEN** AI Engine tidak dipanggil
- **AND** `summary` bernilai `null`

### Requirement: closeSession return type includes summary

`closeSession` MUST mengembalikan objek `{ id, name, closedAt, closedBy, summary: string | null }`. Field `summary` SHALL berisi teks ringkasan dari AI Engine atau `null` jika tidak tersedia.

#### Scenario: Return object berisi summary

- **GIVEN** AI Engine merespon `{ success: true, summary: 'ringkasan...' }`
- **WHEN** `closeSession` selesai
- **THEN** return object berisi field `summary` dengan teks ringkasan

