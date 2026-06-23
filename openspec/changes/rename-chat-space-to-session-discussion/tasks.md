## 1. Core-api — DB schema + reset

- [ ] 1.1 Edit `prisma/schema.prisma`: rename `ChatSpace` → `SessionDiscussion`, `ChatSpacePreReadCompletion` → `SessionDiscussionPreReadCompletion`, all `chatSpaceId` fields → `sessionDiscussionId`, `@@map("chat_spaces")` → `@@map("session_discussions")`, `@@map("chat_space_pre_read_completions")` → `@@map("session_discussion_pre_read_completions")`, all `@map("chat_space_id")` → `@map("session_discussion_id")`, back-relations on User/Group/Course/Goal/Reflection
- [ ] 1.2 `npx prisma generate` — verify schema valid
- [ ] 1.3 On VPS: `npx prisma migrate reset --force` — drops ALL tables, recreates from migration history
- [ ] 1.4 MongoDB: `db.chatlogs.drop()`, `db.silence_events.drop()`, `db.escalation_states.drop()` — seed recreates with new field names
- [ ] 1.5 After Prisma seed: `php artisan migrate` + `MaterialsDemoSeeder` + `AttendanceDemoSeeder` (Laravel tables)

## 2. Core-api — code

- [ ] 2.1 Rename files: `chatSpace.controller.ts` → `sessionDiscussion.controller.ts`, `chatSpace.service.ts` → `sessionDiscussion.service.ts`, `chatSpace.routes.ts` → `sessionDiscussion.routes.ts`, `chatSpace.controller.test.ts` → `sessionDiscussion.controller.test.ts`
- [ ] 2.2 Edit `app.ts`: import + mount path `/api/session-discussions`
- [ ] 2.3 Edit `group.controller.ts`: `createChatSpace` → `createSessionDiscussion`, `getChatSpaces` → `getSessionDiscussions`, `getChatSpaceById` → `getSessionDiscussionById`, `updateChatSpaceWeek` → `updateSessionDiscussionWeek`
- [ ] 2.4 Edit `group.service.ts`: all `chatSpace` → `sessionDiscussion`, `ChatSpace` → `SessionDiscussion`, method names
- [ ] 2.5 Edit `group.controller.test.ts`: update mocks + test descriptions
- [ ] 2.6 Edit `analytics.controller.ts` + `analytics.routes.ts`: `getChatSpaceAnalytics` → `getSessionDiscussionAnalytics`, path `/chat-space/:chatSpaceId` → `/session-discussion/:sessionDiscussionId`
- [ ] 2.7 Edit `goal.controller.ts` + `goal.service.ts`: `getChatSpaceGoals` → `getSessionDiscussionGoals`, `chatSpaceId` → `sessionDiscussionId`
- [ ] 2.8 Edit `internal.controller.ts`: `backfillChatSpaceWeekIds` → `backfillSessionDiscussionWeekIds`
- [ ] 2.9 Edit `auth.ts` middleware: `chatSpaceId` → `sessionDiscussionId` on AuthenticatedRequest
- [ ] 2.10 Edit `chatMembership.ts` middleware: resolve `sessionDiscussionId` instead of `chatSpaceId`
- [ ] 2.11 Edit `retention-cleanup.ts`: `DataType.CHAT_SPACE` → `DataType.SESSION_DISCUSSION`
- [ ] 2.12 Edit MongoDB models: `ChatLog.ts`, `EscalationState.ts`, `SilenceEvent.ts` — rename `chatSpaceId` field + indexes
- [ ] 2.13 Edit `course.controller.ts`: `chat_space_id` → `session_discussion_id` in response mapping
- [ ] 2.14 `npx tsc --noEmit` — 0 errors
- [ ] 2.15 `npm test` — all pass

## 2b. Core-api — seeding

- [ ] 2b.1 Edit `prisma/seed-blueprint.ts`: `DemoChatSpace` → `DemoSessionDiscussion`, `chatSpaces` → `sessionDiscussions`, `chatSpaceKey` → `sessionDiscussionKey` on DemoGoal/DemoReflection/DemoDiscussion/DemoSilenceEvent interfaces, blueprint property `chatSpaces` → `sessionDiscussions`
- [ ] 2b.2 Edit `prisma/seed.ts`: `prisma.chatSpace` → `prisma.sessionDiscussion`, `chatSpaceIds` → `sessionDiscussionIds`, all `chatSpace`/`chatSpaceKey` refs, console log already fixed to "Sesi diskusi"
- [ ] 2b.3 Edit `prisma/scripts/seed-demo-data.ts`: `prisma.chatSpace` → `prisma.sessionDiscussion`, `chatSpace` variable → `sessionDiscussion`, all `chatSpaceId` → `sessionDiscussionId` on ChatMessage/LearningGoal/Reflection/ChatLog, session name "Diskusi Utama" stays
- [ ] 2b.4 Edit `prisma/scripts/seed-demo-chatlogs.ts`: `chatSpaceId` → `sessionDiscussionId` in IChatLog interface, `group.chatSpaces` → `group.sessionDiscussions`, `chatSpace` variable → `sessionDiscussion`
- [ ] 2b.5 Edit `prisma/scripts/verify-demo-data.ts`: `prisma.chatSpace` → `prisma.sessionDiscussion`, `chatSpaces` → `sessionDiscussions`, `chatSpacesWithoutMessages` → `sessionDiscussionsWithoutMessages`, labels already fixed to "sesi diskusi"
- [ ] 2b.6 Seed session names already Indonesian (Diskusi Umum, Review Prototipe, Sprint & Backlog, etc.) — no further change needed

## 3. Client-app — code

- [ ] 3.1 Rename directory: `components/chat-spaces/` → `components/session-discussions/`
- [ ] 3.2 Rename files: `SpaceCard.tsx` → `SessionCard.tsx`, page `student/chat-spaces/index.tsx` → `student/session-discussions/index.tsx`
- [ ] 3.3 Edit `routes/web.php`: all `chat-spaces` path segments → `session-discussions`, route names `chat-spaces.*` → `session-discussions.*`
- [ ] 3.4 Edit all PHP controllers: `storeChatSpace` → `storeSessionDiscussion`, `$chatSpace*` → `$sessionDiscussion*`
- [ ] 3.5 Edit `index.d.ts`: `ChatSpace` → `SessionDiscussion`, all `chatSpaceId` → `sessionDiscussionId`, `ChatSpaceItem` → `SessionDiscussionItem`, etc.
- [ ] 3.6 Edit all TSX pages: `chatSpaceId` → `sessionDiscussionId`, `ChatSpace` → `SessionDiscussion`, `showChatSpaceModal` → `showSessionDiscussionModal`, `chatSpaceForm` → `sessionDiscussionForm`, etc.
- [ ] 3.7 Edit hooks: `useSocketRoom.ts`, `use-chat-summary.ts` — `chatSpaceId` → `sessionDiscussionId`
- [ ] 3.8 Edit components: `ChatWeekMaterialsPanel.tsx`, `DiscussionHealthWidget.tsx` — `chatSpace*` → `sessionDiscussion*`
- [ ] 3.9 Edit `AssertChatMembership.php`: `chatSpaceId` → `sessionDiscussionId`
- [ ] 3.10 Edit nav: `student-nav.tsx` active page types `chat-spaces` → `session-discussions`
- [ ] 3.11 Edit shortcuts: route paths `/student/chat-spaces` → `/student/session-discussions`
- [ ] 3.12 `npx tsc --noEmit` — 0 errors

## 4. AI-engine — code

- [ ] 4.1 Edit `schemas.py`: `GoalValidateBody.chat_space_id` → `session_discussion_id`
- [ ] 4.2 Edit `routes/analytics.py`: path `/export/activity/chat-space/{chat_space_id}` → `/export/activity/session-discussion/{session_discussion_id}`
- [ ] 4.3 Edit `routes/goals.py`: `chat_space_id` → `session_discussion_id` in handler + form field
- [ ] 4.4 Edit `orchestration.py`: `validate_goal(chat_space_id)` → `validate_goal(session_discussion_id)`, all internal `chat_space_id` → `session_discussion_id`
- [ ] 4.5 Edit `plan_vs_reality.py`: `chat_space_id` param → `session_discussion_id`
- [ ] 4.6 Edit `process_mining_anomaly.py`: `chat_space_id` param → `session_discussion_id`
- [ ] 4.7 Edit `export_service.py`: method names + params `chat_space` → `session_discussion`
- [ ] 4.8 Edit `mongodb_logger.py`: `kwargs.get('chat_space_id')` → `kwargs.get('session_discussion_id')`
- [ ] 4.9 Edit all test files: `chat_space_id` → `session_discussion_id`
- [ ] 4.10 `python -m py_compile` on all changed files

## 5. Deploy + verify

- [ ] 5.1 Grep sweep: `grep -ri "chat.space" --include="*.ts" --include="*.tsx" --include="*.py" --include="*.php"` → 0 hits
- [ ] 5.2 rsync all 3 repos to VPS
- [ ] 5.3 Rebuild all 3 containers
- [ ] 5.4 DB reset: `prisma migrate reset --force` + `prisma db seed` + MongoDB drop + `php artisan migrate` + Laravel seed
- [ ] 5.5 E2E test: login, create session, pre-read, goal, chat, close, reflection
- [ ] 5.6 Verify web 200, API 200, AI chat works

## 6. Commit + archive

- [ ] 6.1 Git commit all 3 repos
- [ ] 6.2 Archive OpenSpec in core-api
