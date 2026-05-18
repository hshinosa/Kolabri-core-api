## MODIFIED Requirements

### Requirement: delete_message event rate limited
Event `delete_message` MUST dibatasi: maksimum 20 per 60 detik per socket.

#### Scenario: delete_message within rate limit
- **WHEN** socket mengirim 20 atau kurang `delete_message` dalam 60 detik
- **THEN** semua diproses normal

#### Scenario: delete_message exceeds rate limit
- **WHEN** socket mengirim lebih dari 20 `delete_message` dalam 60 detik
- **THEN** server emit `rate_limit_exceeded` ke socket tersebut

### Requirement: delete_message payload validated
Event `delete_message` MUST divalidasi. `messageId` (string non-empty) dan `roomId` (string non-empty) MUST ada.

#### Scenario: delete_message with missing messageId
- **WHEN** client emit `delete_message` tanpa `messageId`
- **THEN** server emit `validation_error` dan tidak memproses delete

#### Scenario: delete_message with valid payload
- **WHEN** client emit `delete_message` dengan `messageId` dan `roomId` yang valid
- **THEN** server memproses delete seperti biasa
