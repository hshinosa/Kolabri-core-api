# student-role-restore-flows Specification

## Purpose
TBD - created by archiving change student-role-restore-flows. Update Purpose after archive.
## Requirements
### Requirement: Goal creation SHALL accept a null week context

The goal creation endpoint SHALL accept requests where `week_context` is explicitly `null`, not only requests where the field is absent. A `null` week context represents a chat space with no bound course week and MUST be treated identically to an omitted field.

**Root Cause Classification**: validation-too-strict (zod `.optional()` rejects explicit `null`)

**Affected Files**: `src/validators/goal.validator.ts`, `src/services/goal.service.ts`

#### Scenario: Goal created in a chat space with no bound week

- **WHEN** a student creates a goal in a chat space whose week is unseeded and the BFF forwards `week_context: null`
- **THEN** validation SHALL pass (field declared `.nullish()`)
- **AND** the service SHALL normalize `null` to `undefined` before persistence
- **AND** the goal SHALL be created without a 400 "Validation failed" response

### Requirement: Weekly reflections SHALL be created against a course

A reflection SHALL be creatable either against a learning goal (session reflection) or against a course (weekly reflection). The `Reflection` model SHALL carry a nullable `courseId` foreign key to `Course` with `onDelete: SetNull`. Exactly one of `goalId` or `courseId` MUST be present.

**Root Cause Classification**: missing-schema-and-validation (no `courseId` column; validator required `goalId`)

**Affected Files**: `prisma/schema.prisma`, `prisma/migrations/20260619090000_add_reflection_course_id/`, `src/validators/reflection.validator.ts`, `src/services/reflection.service.ts`, BFF `app/Http/Controllers/ReflectionController.php`

#### Scenario: Enrolled student creates a weekly reflection

- **WHEN** a student enrolled in a course posts `{ courseId, type: 'weekly', content }` with `content` length 20..2000
- **THEN** the service SHALL verify enrollment via `courseStudent`
- **AND** SHALL persist the reflection with `type: 'weekly'` and the given `courseId`
- **AND** SHALL return 201 with the resolved `course` populated

#### Scenario: Non-enrolled student is rejected

- **WHEN** a student posts a weekly reflection for a course they are not enrolled in
- **THEN** the service SHALL respond 403 "You are not enrolled in this course"
- **AND** SHALL NOT create any reflection

#### Scenario: Session reflection path is preserved

- **WHEN** a student posts `{ goalId, content }` for a goal whose group they belong to
- **THEN** the reflection SHALL persist with `type: 'session'` and the given `goalId`
- **AND** a student outside the group SHALL be rejected 403

#### Scenario: Weekly reflection appears in the reflection list

- **WHEN** the student fetches `GET /api/reflections/me`
- **THEN** a course-only reflection SHALL resolve its source course directly (`r.course`), falling back to the group's course only when `r.course` is null

### Requirement: Students SHALL see their own recent activity

The student dashboard SHALL be served recent activity from a student-scoped endpoint, not a lecturer-only route. The endpoint SHALL return only activity from groups the requesting student belongs to.

**Root Cause Classification**: wrong-authorization-scope (student called `requireLecturer` route → 403)

**Affected Files**: `src/services/analytics.service.ts`, `src/controllers/student-analytics.controller.ts`, `src/routes/student.routes.ts`, BFF `app/Http/Controllers/DashboardController.php`

#### Scenario: Student fetches recent activity

- **WHEN** a student requests `GET /api/student/activity/recent?limit=N`
- **THEN** the service SHALL resolve the student's groups and return chat activity scoped to those groups only
- **AND** each item SHALL include `type: 'message'`, `senderName`, `content`, `groupName`, and `courseName`
- **AND** the response SHALL be 200, never 403

### Requirement: Group detail SHALL identify the group creator

`GroupService.getGroupById` SHALL return a `creator` object resolved from `Group.createdBy`, so the group detail page can detect the leader and render owner-only controls (kick, transfer).

**Root Cause Classification**: missing-field-in-response (`creator` never returned)

**Affected File**: `src/services/group.service.ts`

#### Scenario: Group detail returns the creator

- **WHEN** `GET /api/groups/:id` is called
- **THEN** the response SHALL include `creator` with `{ id, name, email }` resolved from `createdBy`
- **AND** `creator` SHALL be `null` when `createdBy` is absent (no fabricated creator)

### Requirement: Week-binding verification SHALL fail loudly

`assertCourseWeekBelongsToCourse` SHALL NOT fabricate a synthetic week when its database query fails. On query error it SHALL re-throw, surfacing the failure rather than silently binding a session to a bogus week.

**Root Cause Classification**: error-swallowed-with-fabricated-data

**Affected File**: `src/services/group.service.ts`

#### Scenario: Week query fails

- **WHEN** the `$queryRaw` week lookup throws
- **THEN** the method SHALL re-throw `ApiError.badRequest('Unable to verify week_id...')`
- **AND** SHALL NOT return a synthetic week (`week_index: 0, title: ''`)

### Requirement: Socket join SHALL enforce pre-read and goal gates

The realtime `join_room` handler SHALL apply the same access gates as the HTTP session-entry path for students: pre-read completion (when the chat space has a bound week) and an existing learning goal. Closed sessions SHALL skip both gates.

**Root Cause Classification**: access-gate-bypass (socket path skipped HTTP gates)

**Affected File**: `src/socket/index.ts`

#### Scenario: Student joins an open, week-bound session without pre-read

- **WHEN** a student emits `join_room` for an open chat space that has a `weekId` and the student has no pre-read completion
- **THEN** the server SHALL emit `PRE_READ_REQUIRED` and SHALL NOT join the room

#### Scenario: Student joins without a learning goal

- **WHEN** a student emits `join_room` for an open chat space and has no learning goal
- **THEN** the server SHALL emit `GOAL_REQUIRED` and SHALL NOT join the room

#### Scenario: Closed session skips gates

- **WHEN** the chat space is closed (`closedAt` set)
- **THEN** the server SHALL NOT apply pre-read or goal gates

### Requirement: Discussion summary failures SHALL be retryable

When AI summary generation reports `success: false`, `closeSession` SHALL record `summaryError` so the client can present a retryable error state rather than an empty card.

**Root Cause Classification**: missing-error-state

**Affected File**: `src/services/chatSpace.service.ts`

#### Scenario: AI summary returns success: false

- **WHEN** `closeSession` receives an AI summary result with `success: false`
- **THEN** it SHALL set `summaryError` to the reported error (or a default message)
- **AND** SHALL NOT leave both `summary` and `summaryError` unset

### Requirement: Summary text SHALL parse to a structured shape via a shared helper

The client SHALL parse a raw markdown summary string into the structured `ChatDiscussionSummary` shape through a single shared `parseSummaryText` helper, eliminating duplicated inline parsers.

**Root Cause Classification**: shape-mismatch-and-duplication (`getSummary` returns string; hook expected object; 3 inline parsers)

**Affected Files**: `resources/js/features/chat/summary/parse-summary.ts`, `resources/js/features/chat/summary/use-chat-summary.ts`, `resources/js/pages/student/chat/room.tsx`

#### Scenario: Markdown summary is parsed for the card

- **WHEN** `parseSummaryText(text, roomId, generatedAt)` receives a non-empty markdown string
- **THEN** it SHALL return a `ChatDiscussionSummary` with `roomId`, `headline` (first heading line, default 'Ringkasan diskusi' when blank), `keyPoints` (bullet lines, stripped of markers, capped at 5), `detailedSummary` (the full text), and `generatedAt`

#### Scenario: Empty input yields null

- **WHEN** `parseSummaryText` receives null, undefined, or a blank string
- **THEN** it SHALL return `null`

#### Scenario: Both fetch paths use the shared helper

- **WHEN** the summary is fetched on close or on retry
- **THEN** both `use-chat-summary` paths and `room.tsx` SHALL produce the structured shape via `parseSummaryText`, with no duplicated inline parsing logic

