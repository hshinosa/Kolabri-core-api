## ADDED Requirements

### Requirement: Demo Seed Must Enumerate the Full Course Catalog

The core-api demo seed SHALL define every course in the advertised catalog, including DEVOPS102 and IMK401, as first-class `COURSES` entries. A `db:reset:demo-data` run MUST recreate all 14 courses; it MUST NOT depend on any manually-created course state.

#### Scenario: Reset recreates all advertised courses

- **WHEN** `db:reset:demo-data` runs against an empty database
- **THEN** the `courses` table contains all 14 courses (IF201–IF212, DEVOPS102, IMK401), each with a deterministic `seedUuid("course-<CODE>")` id

#### Scenario: New courses carry week and material metadata

- **WHEN** the seed creates DEVOPS102 and IMK401
- **THEN** each course has `course_weeks` rows and `course_materials` rows (with `course_week_materials` links) in PostgreSQL, identical in structure to the existing 12 courses

### Requirement: Seed Course Identifiers Must Be Deterministic and Cross-Database Consistent

The seed SHALL derive every course, week, and material UUID from `seedUuid` so that PostgreSQL (core-api) and MySQL (client-app) produce identical IDs for the same logical entity. DEVOPS102 and IMK401 MUST follow this rule, not use random UUIDs.

#### Scenario: Core-api and client-app agree on IDs

- **WHEN** both the core-api seed and the client-app `MaterialsDemoSeeder` run for DEVOPS102
- **THEN** the course, week, and material UUIDs match across PostgreSQL and MySQL because both derive from `seedUuid` with the same input keys

### Requirement: Seeded Material Titles Must Reproduce Existing PDF Filenames

The week and material titles defined for DEVOPS102 and IMK401 SHALL be chosen so the client-app `Str::slug("{code} {topic}")` filename matches the PDF files already generated on disk, preventing orphaned files on re-seed.

#### Scenario: Re-seed reuses existing PDFs

- **WHEN** the client-app seeder runs for DEVOPS102 with the new `$courseWeeks` entry and the demo-materials PDFs already exist
- **THEN** the generated filenames equal the existing on-disk filenames and no orphaned PDF is created
