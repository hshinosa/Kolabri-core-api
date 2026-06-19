## 1. Core-API Seed

- [x] 1.1 In `prisma/scripts/seed-demo-data.ts`, add two `CourseContent` entries to `COURSES`: DEVOPS102 (name "DevOps") and IMK401 (name "Interaksi Manusia Komputer"), each with realistic topics, assignmentQuestions, hotDiscussions, aiPrompts, aiResponses, goals, reflections matching the style of the existing 12.
- [x] 1.2 In the same file, add `COURSE_WEEK_DATA` entries for DEVOPS102 and IMK401 whose week titles and material names reproduce the existing on-disk PDF filenames (DevOps: "Pengantar DevOps"/"Fundamental DevOps"/"Analisis Kasus DevOps"/"Latihan DevOps"/"Perancangan Proyek"/"Implementasi & Evaluasi"; IMK401: the same six with "Interaksi Manusia Komputer" where the fallback used the course name).

## 2. Client-App Seed

- [x] 2.1 In `database/seeders/MaterialsDemoSeeder.php`, add DEVOPS102 and IMK401 entries to `$courseWeeks` with week titles and material names identical to the core-api `COURSE_WEEK_DATA` entries, so PDF filenames (`Str::slug("{code} {topic}")`) equal the existing files.

## 3. Verification

- [x] 3.1 `npx tsc --noEmit` in core-api passes; `php -l database/seeders/MaterialsDemoSeeder.php` passes.
- [x] 3.2 Dry-run check: confirm `seedUuid("course-DEVOPS102")` / `seedUuid("course-IMK401")` resolve identically in both seeders (same MD5-UUID), and that computed PDF filenames match the existing demo-materials files.
- [x] 3.3 Document the re-seed + re-ingest operational step (stale random-UUID Qdrant collections deleted, re-ingest under new deterministic UUIDs) in the change; no live re-seed performed as part of this change unless explicitly requested.
