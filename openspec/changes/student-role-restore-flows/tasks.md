## 1. Goal creation — null week context

- [x] 1.1 Confirmed BFF `GoalController.php` injects `week_context: null` from MySQL `CourseWeek::find()` when week unseeded
- [x] 1.2 Confirmed zod `.optional()` rejects explicit `null` (NULL_REJECTED, UNDEF_ACCEPTED in zod 3.25.76)
- [x] 1.3 `goal.validator.ts` → `weekContext` field `.nullish()`
- [x] 1.4 `goal.service.ts` → normalize `data.week_context ?? undefined` at call boundary
- [x] 1.5 `tsc --noEmit` clean

## 2. Weekly reflection — courseId support

- [x] 2.1 Added `Reflection.courseId String? @map("course_id")` + `course Course? @relation(... onDelete: SetNull)` + `@@index([courseId, userId])` + `Course.reflections Reflection[]`
- [x] 2.2 Hand-wrote additive migration `20260619090000_add_reflection_course_id` (column + index + FK); `prisma migrate dev` blocked by pre-existing co-mingled-Laravel-tables drift
- [x] 2.3 `reflection.validator.ts` — `goalId`/`courseId` both `.nullish()`, `type: z.enum(['session','weekly']).default('weekly')`, `content` 20..2000, `.refine(d => d.goalId || d.courseId)`
- [x] 2.4 `reflection.service.ts` — branch session (goalId → group membership) vs weekly (courseId → `courseStudent` enrollment, force `type:'weekly'`); `getMyReflections` resolves `sourceCourse = r.course ?? sourceGroup?.course`
- [x] 2.5 BFF `ReflectionController::store()` — validate `goal_id`/`course_id`/`type`/`content`(min:20), map to camelCase, post to `/api/reflections`
- [x] 2.6 Updated `reflection.service.test.ts` session assertion (now carries `type:'session'`); added 2 weekly tests (enrolled success + not-enrolled 403)
- [x] 2.7 Applied migration via `prisma migrate deploy`; verified column/index/FK via `information_schema`
- [x] 2.8 Live: `POST /api/reflections {courseId,type:weekly}` → 201; unenrolled → 403; appears in `/api/reflections/me` with course

## 3. Student activity feed

- [x] 3.1 Confirmed dashboard hit lecturer-only `requireLecturer` route → 403
- [x] 3.2 `analytics.service.ts` — `getStudentRecentActivity(userId, limit)`: student's groups → Mongo `ChatLog` filtered, mapped with `type:'message'`, senderName, content, groupName, courseName
- [x] 3.3 `student-analytics.controller.ts` — `getRecentActivity` handler with 401 guard
- [x] 3.4 `student.routes.ts` — `GET /activity/recent` (mounted `/api/student`)
- [x] 3.5 BFF `DashboardController` — repoint to `/api/student/activity/recent`
- [x] 3.6 Live: `GET /api/student/activity/recent` → 200, items with `type`/`groupName`/`courseName`

## 4. Group owner controls

- [x] 4.1 Confirmed `getGroupById` omitted `creator`; frontend `groups/show.tsx` reads `group.creator?.id`
- [x] 4.2 `group.service.ts` — resolve `creator` from `Group.createdBy` (null-guarded), include in return (mirrors `getGroupDetails`)
- [x] 4.3 Live: `GET /api/groups/:id` → 200, `creator` populated

## 5. Discussion session integrity

- [x] 5.1 `group.service.ts` `assertCourseWeekBelongsToCourse` — catch re-throws `ApiError.badRequest` instead of fabricating week
- [x] 5.2 `socket/index.ts` `join_room` — student-only gate after membership check: pre-read completion (if weekId) + learning goal exists; emits `PRE_READ_REQUIRED`/`GOAL_REQUIRED`; skips closed sessions
- [x] 5.3 `chatSpace.service.ts` `closeSession` — `else` branch sets `summaryError` on AI `success:false`
- [x] 5.4 `features/chat/summary/parse-summary.ts` — `parseSummaryText(text, roomId, generatedAt) → ChatDiscussionSummary | null`
- [x] 5.5 `use-chat-summary.ts` (both fetch paths + retry) and `room.tsx` (close + retry) use shared parser; removed 3 duplicate inline parsers
- [x] 5.6 Added `parse-summary.test.ts` (empty/blank, markdown parse, 5-cap bullets, default headline)

## 6. Verification

- [x] 6.1 core-api `tsc --noEmit` + `npm run build` clean
- [x] 6.2 client-app `tsc --noEmit` clean; `php -l` on changed controllers clean
- [x] 6.3 core-api targeted tests: 91 passed (reflection/goal/chatSpace/group services + controllers)
- [x] 6.4 client-app summary tests: 6 + 4 passed (AISummaryButton, chat-summary, parse-summary)
- [x] 6.5 Live smoke (student `andi.pratama`, core-api `:3000` rebuilt) — all 5 flows verified, test data cleaned up
