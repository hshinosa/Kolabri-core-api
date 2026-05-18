# input-sanitization Specification

## Purpose
TBD - created by archiving change core-api-input-sanitization. Update Purpose after archive.
## Requirements
### Requirement: All string inputs sanitized before processing
Sistem MUST membersihkan semua string values di request body dari HTML tags sebelum request diproses oleh handler manapun. Sanitization MUST berjalan secara rekursif untuk nested objects dan arrays.

#### Scenario: HTML tags stripped from simple string field
- **WHEN** request body mengandung string dengan HTML tags seperti `"Hello <script>alert('xss')</script> World"`
- **THEN** nilai yang sampai ke handler adalah `"Hello  World"` (tags dihapus)

#### Scenario: Plain text unchanged
- **WHEN** request body mengandung string plain text tanpa HTML tags
- **THEN** nilai tidak berubah

#### Scenario: Nested object sanitized recursively
- **WHEN** request body adalah nested object seperti `{ messages: [{ content: "<b>hello</b>" }] }`
- **THEN** semua string values di semua level di-sanitize: `{ messages: [{ content: "hello" }] }`

#### Scenario: Non-string values unchanged
- **WHEN** request body mengandung number, boolean, atau null
- **THEN** nilai tidak berubah

### Requirement: Sanitization runs before Zod validation
Sanitization middleware MUST dieksekusi sebelum Zod validation middleware agar data yang divalidasi sudah dalam kondisi bersih.

#### Scenario: Sanitized data passes validation
- **WHEN** input mengandung HTML tags tapi setelah sanitization memenuhi Zod schema
- **THEN** request berhasil diproses (tidak ditolak oleh validator)

### Requirement: File uploads not affected by sanitization
Sanitization MUST NOT memproses file upload payloads (multipart/form-data yang dihandle oleh multer).

#### Scenario: File upload bypasses sanitization
- **WHEN** request adalah file upload (Content-Type: multipart/form-data)
- **THEN** file content tidak dimodifikasi oleh sanitization middleware

