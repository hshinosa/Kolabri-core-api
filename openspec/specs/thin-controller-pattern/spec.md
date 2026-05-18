# thin-controller-pattern Specification

## Purpose
TBD - created by archiving change core-api-thin-controllers. Update Purpose after archive.
## Requirements
### Requirement: Controllers contain no direct Prisma calls
Controller MUST NOT memanggil `prisma.*` secara langsung. Semua database access harus lewat service layer.

#### Scenario: Controller needs data from database
- **WHEN** controller perlu data dari database
- **THEN** controller memanggil method di service yang sesuai, bukan `prisma.*` langsung

### Requirement: Business logic lives in service layer
Kondisi bisnis (authorization checks, data transformation, business rules) MUST ada di service layer, bukan di controller.

#### Scenario: Controller receives request
- **WHEN** controller menerima request yang valid
- **THEN** controller hanya: parse input → call service → return response (max 20 lines per handler)

