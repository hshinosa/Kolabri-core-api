# api-validation-standardization Specification

## Purpose
TBD - created by archiving change core-api-validation-coverage. Update Purpose after archive.
## Requirements
### Requirement: All POST/PUT/PATCH endpoints have Zod validation
Setiap endpoint yang menerima request body (POST, PUT, PATCH) MUST memiliki Zod schema validation yang dijalankan sebelum handler. Endpoint tanpa validation MUST ditolak saat code review.

#### Scenario: Valid request body passes validation
- **WHEN** request body memenuhi semua Zod schema requirements
- **THEN** request diteruskan ke handler

#### Scenario: Invalid request body rejected
- **WHEN** request body tidak memenuhi Zod schema (missing required field, wrong type)
- **THEN** sistem mengembalikan HTTP 400 sebelum handler dieksekusi

#### Scenario: Missing required field rejected
- **WHEN** request body tidak mengandung field yang required oleh schema
- **THEN** sistem mengembalikan HTTP 400 dengan detail field mana yang missing

### Requirement: Validation errors return standardized 400 response
Semua validation errors MUST mengembalikan response dengan format yang seragam: `{ error: "Validation failed", details: [{ field: string, message: string }] }`.

#### Scenario: Single field validation error
- **WHEN** satu field tidak valid
- **THEN** response adalah `{ "error": "Validation failed", "details": [{ "field": "email", "message": "Invalid email format" }] }`

#### Scenario: Multiple field validation errors
- **WHEN** beberapa field tidak valid sekaligus
- **THEN** response mengandung semua error dalam array `details`, satu entry per field yang invalid

### Requirement: Validators organized per domain
Semua Zod schemas MUST diorganisir dalam file per domain di `src/validators/`. Setiap domain memiliki satu file validator (misal: `auth.validator.ts`, `course.validator.ts`).

#### Scenario: New endpoint uses domain validator
- **WHEN** endpoint baru ditambahkan untuk domain yang sudah ada
- **THEN** Zod schema ditambahkan ke file validator domain yang sesuai, bukan membuat file baru

