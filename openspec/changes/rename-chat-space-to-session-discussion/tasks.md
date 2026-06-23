## 1. Core-api — DB migration

- [ ] 1.1 Edit `prisma/schema.prisma`: rename `ChatSpace` → `SessionDiscussion`, `ChatSpacePreReadCompletion` → `SessionDiscussionPreReadCompletion`, all `chatSpaceId` fields → `sessionDiscussionId`, `@@map("chat_spaces")` → `@@map("session_discussions")`, back-relations on User/Group/Course/Goal/Reflection
- [ ] 1.2 Apply SQL directly on VPS (schema drift blocks `migrate dev`):
  - `ALTER TABLE chat_spaces RENAME TO session_discussions`
  - `ALTER TABLE chat_space_pre_read_completions RENAME TO session_discussion_pre_read_completions`
  - `ALTER TABLE ... RENAME COLUMN chat_space_id TO session_discussion_id` (4 tables)
  - Rename all indexes
- [ ] 1.3 Mark migration as applied in `_prisma_migrations`
- [ ] 1.4 MongoDB rename: `db.chatlogs.updateMany({}, {$rename: {"chatSpaceId": "sessionDiscussionId"}})` + same for `silence_events`, `escalation_states`
- [ ] 1.5 `npx prisma generate`

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
- [ ] 5.3 Run MongoDB rename scripts on VPS
- [ ] 5.4 Rebuild all 3 containers
- [ ] 5.5 E2E test: login, create session, pre-read, goal, chat, close, reflection
- [ ] 5.6 Verify web 200, API 200, AI chat works

## 6. Commit + archive

- [ ] 6.1 Git commit all 3 repos
- [ ] 6.2 Archive OpenSpec in core-api
