## Why

Two courses present on the deployed system — DEVOPS102 and IMK401 — were created manually (random UUIDs, outside the demo seed). The demo seed only knows the 12 IF2xx courses, so a `db:reset:demo-data` would silently drop these two courses, and their `course_materials`/`course_weeks` metadata never exists in PostgreSQL. This breaks reproducibility (the deployed dataset cannot be recreated from seed) and leaves RAG ingest dependent on manual steps for those two courses.

## What Changes

- Add DEVOPS102 and IMK401 as first-class entries in the core-api demo seed `COURSES` array, with full content (topics, assignment questions, discussions, AI prompts/responses, goals, reflections) consistent with the existing 12 courses.
- Add matching `COURSE_WEEK_DATA` entries (core-api) and `$courseWeeks` entries (client-app `MaterialsDemoSeeder`) for both courses, using week/material titles that produce the **same PDF filenames already on disk** (so no orphaned PDFs).
- Both courses now receive deterministic UUIDs via `seedUuid("course-<CODE>")`, identical across PostgreSQL and MySQL — matching the existing pattern for the 12 IF courses.
- **BREAKING (data)**: the deterministic UUIDs differ from the manually-created live UUIDs (`3796dad2…`, `9bdb4f98…`). After a re-seed, RAG collections for these two courses must be re-ingested under the new UUIDs. The currently-running deployment is unaffected until a re-seed is run.

## Capabilities

### New Capabilities
- `demo-seed-completeness`: the demo seed MUST produce the full, reproducible course catalog (all advertised courses with weeks and materials) so a reset recreates the deployed dataset deterministically.

### Modified Capabilities
<!-- none -->

## Impact

- Code: `Kolabri-core-api/prisma/scripts/seed-demo-data.ts` (`COURSES`, `COURSE_WEEK_DATA`), `Kolabri-client-app/database/seeders/MaterialsDemoSeeder.php` (`$courseWeeks`, PDF content match).
- Data: re-seed regenerates 14 courses (was 12) with deterministic UUIDs; the two new courses get `course_materials` + `course_week_materials` rows in PostgreSQL.
- Operational: after re-seed, re-run RAG ingest for DEVOPS102/IMK401 (UUID collections). Documented in tasks.
- No runtime/API contract change.
