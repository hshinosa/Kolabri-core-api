# webhook-ai-intervention Specification

## Purpose
TBD - created by archiving change core-api-webhook-ai-notifications. Update Purpose after archive.
## Requirements
### Requirement: Webhook endpoint POST /api/webhooks/ai-intervention

Endpoint MUST menerima payload `{ groupId, message, type, metadata }` dengan `type` salah satu dari `silence | participation_inequity | low_quality | teacher_alert`.

#### Scenario: Payload valid diterima

- **GIVEN** request `POST /api/webhooks/ai-intervention` dengan body lengkap
- **WHEN** server memproses request
- **THEN** handler mem-parse `groupId`, `message`, `type`, `metadata`
- **AND** memproses ke pipeline broadcast

### Requirement: Webhook authenticates via X-API-Key header

Request MUST menyertakan header `X-API-Key` yang nilainya sama dengan `process.env.CORE_API_SECRET`. Jika header tidak ada atau tidak cocok, server SHALL membalas `401 Unauthorized`.

#### Scenario: Header valid

- **GIVEN** request menyertakan `X-API-Key` yang benar
- **WHEN** middleware verifikasi
- **THEN** request dilanjutkan ke handler

#### Scenario: Header tidak valid

- **GIVEN** request tanpa header atau dengan nilai salah
- **WHEN** middleware verifikasi
- **THEN** response status `401`
- **AND** body memuat error message

### Requirement: Webhook resolves rooms via PostgreSQL

Server MUST query `prisma.group.findFirst({ where: { id: groupId, deletedAt: null }, include: { course: { select: { id: true } }, chatSpaces: { where: { closedAt: null }, select: { id: true } } } })`. Room ID untuk broadcast SHALL gunakan `roomNames.chatSpace(chatSpace.id)` (= `chatSpace.id`).

#### Scenario: Group ditemukan dengan chat spaces aktif

- **GIVEN** `groupId` valid dan punya chat spaces aktif
- **WHEN** handler resolve room
- **THEN** setiap `chatSpace.id` digunakan sebagai roomId
- **AND** broadcast dikirim ke semua chat spaces aktif

#### Scenario: Group tidak ditemukan

- **GIVEN** `groupId` tidak ada atau soft-deleted
- **WHEN** handler query
- **THEN** server membalas `404 Not Found`

### Requirement: Webhook broadcasts events to Socket.IO rooms

Untuk setiap chat space aktif, handler MUST emit dua events ke room:

1. `receive_message` dengan `senderType: 'ai'`, `isIntervention: true`, `interventionType: type`
2. `quality_intervention` dengan `interventionType`, `metadata`, `timestamp`

#### Scenario: Broadcast ke ruang aktif

- **GIVEN** group punya 2 chat spaces aktif
- **WHEN** handler memproses payload
- **THEN** kedua room menerima event `receive_message`
- **AND** kedua room menerima event `quality_intervention`

### Requirement: Webhook persists ChatLog ke MongoDB

Untuk setiap chat space aktif, handler MUST membuat document `ChatLog` dengan `senderType: 'ai'`, `senderName: 'AI Assistant'`, `isIntervention: true`, `content: message`.

#### Scenario: ChatLog tersimpan

- **GIVEN** group punya 1 chat space aktif
- **WHEN** handler menerima payload
- **THEN** terdapat 1 ChatLog baru di MongoDB
- **AND** ChatLog mempunyai `senderType: 'ai'` dan `isIntervention: true`

### Requirement: Webhook returns delivery count

Endpoint MUST membalas `{ success: true, delivered: N }` dengan N jumlah room yang menerima broadcast. Status code SHALL `200` meski N = 0.

#### Scenario: Group tanpa chat space aktif

- **GIVEN** group ada tapi semua chat spaces tertutup
- **WHEN** handler memproses payload
- **THEN** response status `200`
- **AND** body `{ success: true, delivered: 0 }`

