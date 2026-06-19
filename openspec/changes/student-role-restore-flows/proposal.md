## Why

A student-role audit (dashboard, goal creation, weekly reflections, discussion sessions, group detail) surfaced 8 confirmed bugs that broke core student flows end-to-end. The user reported "banyak error saat pembuatan goals dan sesi diskusi" (many errors creating goals and discussion sessions). Three of these (weekly reflection 422, empty activity feed, broken group owner controls) made entire pages non-functional for students; the rest silently corrupted data (fabricated week bindings) or bypassed access gates (socket join).

This change spans **two services** — `Kolabri-core-api` (Node/TS + Prisma, API owner) and `Kolabri-client-app` (Laravel BFF + React/Inertia). The BFF forwards student requests to core-api, so several bugs required a coordinated fix on both sides.

## What Changes

- **Goal creation rejects null week context** — BFF sends `week_context: null` when the chat space has no bound week; the zod `.optional()` validator rejected an explicit `null`, returning 400 "Validation failed". Switched to `.nullish()` and normalized `null → undefined` at the service boundary.
- **Weekly reflection always 422** — the reflection form posts `{course_id, content, type: 'weekly'}`, but core-api required a `goalId` and had no `courseId` column. Added a nullable `Reflection.courseId` (FK to `Course`, `onDelete: SetNull`), branched `createReflection` into session (goal + group-membership) and weekly (course + enrollment) paths, and wired the BFF `ReflectionController` to forward `goalId`/`courseId`/`type`.
- **Student activity feed empty (403)** — the student dashboard called `GET /api/analytics/activity/recent`, a `requireLecturer` route. Added a student-scoped `GET /api/student/activity/recent` that returns only the student's own group activity, and repointed the BFF `DashboardController`.
- **Group owner controls dead** — `GroupService.getGroupById` never returned `creator`, so the group detail page could not detect the leader and hid kick/transfer controls. Now resolves `creator` from `Group.createdBy`.
- **Week binding fabricated on query error** — `assertCourseWeekBelongsToCourse` swallowed any `$queryRaw` failure and returned a synthetic week (`week_index: 0, title: ''`), silently binding sessions to a bogus week. Now re-throws a 400.
- **Socket join bypasses access gates** — `join_room` only checked group membership, letting a student socket directly into a session and skip pre-read + goal gates enforced on the HTTP path. Added a student-only gate (pre-read completion when a week is bound, plus a learning goal) before joining.
- **Missing AI summary not retryable** — on AI `success: false`, `closeSession` set neither `summary` nor `summaryError`, so the client never saw a retryable error state. Now sets `summaryError`.
- **Summary card broken on reload** — `getSummary` returns a raw markdown string but `use-chat-summary` (and `room.tsx`) expected a structured object; three duplicate inline parsers existed. Extracted a shared `parseSummaryText(text, roomId, generatedAt)` helper and wired it into every fetch path.

## Capabilities

### New Capabilities
- `student-role-restore-flows`: Restores correctness of student dashboard, goal creation, weekly reflections, discussion-session entry, and group detail across core-api and the BFF.

### Modified Capabilities
<!-- No prior spec requirements change; these flows had no formal spec. Captured here as the canonical behavior. -->

## Impact

**Affected Files — Kolabri-core-api:**
- `prisma/schema.prisma` — `Reflection.courseId` + `Course.reflections` relation + index
- `prisma/migrations/20260619090000_add_reflection_course_id/migration.sql` — additive column, index, FK
- `src/validators/goal.validator.ts`, `src/services/goal.service.ts` — null week context
- `src/validators/reflection.validator.ts`, `src/services/reflection.service.ts` (+ `reflection.service.test.ts`) — weekly/session branching
- `src/services/group.service.ts` — re-throw on week-verify error; return `creator` in `getGroupById`
- `src/socket/index.ts` — pre-read + goal gate on `join_room`
- `src/services/chatSpace.service.ts` — set `summaryError` on AI failure
- `src/controllers/student-analytics.controller.ts`, `src/routes/student.routes.ts`, `src/services/analytics.service.ts` — student activity endpoint

**Affected Files — Kolabri-client-app:**
- `app/Http/Controllers/ReflectionController.php` — forward goalId/courseId/type
- `app/Http/Controllers/DashboardController.php` — repoint to `/api/student/activity/recent`
- `resources/js/features/chat/summary/parse-summary.ts` (+ test) — shared summary parser
- `resources/js/features/chat/summary/use-chat-summary.ts`, `resources/js/pages/student/chat/room.tsx` — use shared parser

**Systems:**
- Student dashboard, goals, reflections, discussion sessions, group detail
- Database schema (additive: `reflections.course_id`)
- Realtime socket access control

**No Impact:**
- Lecturer flows (lecturer activity route unchanged)
- Existing session reflections (goal path preserved)
- Public API signatures other than the new student activity route
