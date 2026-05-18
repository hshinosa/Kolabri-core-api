# socketio-payload-validation Specification

## Purpose
TBD - created by archiving change core-api-socketio-payload-validation. Update Purpose after archive.
## Requirements
### Requirement: join_room payload validated before processing
Event `join_room` MUST divalidasi sebelum diproses. Payload MUST mengandung `courseId` (UUID), `groupId` (UUID), dan `chatSpaceId` (UUID). Jika tidak valid, server MUST emit `validation_error` ke socket tersebut.

#### Scenario: join_room with missing chatSpaceId
- **WHEN** client emit `join_room` tanpa `chatSpaceId`
- **THEN** server emit `validation_error` dengan detail field yang missing dan tidak memproses join

#### Scenario: join_room with valid payload
- **WHEN** client emit `join_room` dengan semua required fields yang valid
- **THEN** server memproses join seperti biasa

### Requirement: send_message payload validated before processing
Event `send_message` MUST divalidasi. `roomId` (string non-empty), `content` (string, max 10000 chars), `courseId` (string), `groupId` (string) MUST ada. Jika tidak valid, server MUST emit `validation_error`.

#### Scenario: send_message with empty content and no attachments
- **WHEN** client emit `send_message` dengan `content: ""` dan tidak ada `attachments`
- **THEN** server emit `validation_error` dan tidak menyimpan pesan

#### Scenario: send_message with valid payload
- **WHEN** client emit `send_message` dengan payload yang valid
- **THEN** server memproses pesan seperti biasa

### Requirement: typing payload validated
Event `typing` MUST divalidasi. `roomId` (string non-empty) dan `isTyping` (boolean) MUST ada.

#### Scenario: Compliance for typing payload validated

- Given the system is operating normally
- When the requirement applies
- Then it MUST be satisfied

### Requirement: validation_error event format standardized
Semua `validation_error` events MUST dikirim dengan format: `{ event: string, details: [{ field: string, message: string }] }`.

#### Scenario: Compliance for validation_error event format standardized

- Given the system is operating normally
- When the requirement applies
- Then it MUST be satisfied

