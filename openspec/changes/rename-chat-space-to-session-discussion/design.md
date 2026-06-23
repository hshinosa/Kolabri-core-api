## Context

The `chat_space` identifier was the original internal name when the feature was first built. Over time, the product evolved to call these "sesi diskusi" (discussion sessions) in all user-facing text. The internal naming never caught up. This proposal aligns internal identifiers with the product terminology.

Current naming surface across 3 repos:

### Core-api (TypeScript + Prisma + MongoDB)
| Layer | Current | Target |
|---|---|---|
| Prisma model | `ChatSpace` | `SessionDiscussion` |
| PostgreSQL table | `chat_spaces` | `session_discussions` |
| PostgreSQL table | `chat_space_pre_read_completions` | `session_discussion_pre_read_completions` |
| PostgreSQL column | `chat_space_id` (on 4 tables) | `session_discussion_id` |
| MongoDB field | `ChatLog.chatSpaceId` | `ChatLog.sessionDiscussionId` |
| MongoDB field | `SilenceEvent.chatSpaceId` | `SilenceEvent.sessionDiscussionId` |
| MongoDB field | `EscalationState.chatSpaceId` | `EscalationState.sessionDiscussionId` |
| API path | `/api/chat-spaces` | `/api/session-discussions` |
| API path | `/api/groups/{id}/chat-spaces` | `/api/groups/{id}/session-discussions` |
| API path | `/api/groups/chat-spaces/{id}` | `/api/groups/session-discussions/{id}` |
| API path | `/api/analytics/chat-space/{chatSpaceId}` | `/api/analytics/session-discussion/{sessionDiscussionId}` |
| Controller | `ChatSpaceController` | `SessionDiscussionController` |
| Service | `ChatSpaceService` | `SessionDiscussionService` |
| Route file | `chatSpace.routes.ts` | `sessionDiscussion.routes.ts` |
| Method | `createChatSpace` | `createSessionDiscussion` |
| Method | `getChatSpaces` | `getSessionDiscussions` |
| Method | `getChatSpaceById` | `getSessionDiscussionById` |
| Method | `updateChatSpaceWeek` | `updateSessionDiscussionWeek` |
| Method | `completePreRead` (on chat space) | unchanged (method name is generic) |
| Method | `backfillChatSpaceWeekIds` | `backfillSessionDiscussionWeekIds` |
| Auth middleware | `req.chatSpaceId` | `req.sessionDiscussionId` |
| Chat membership middleware | resolves `chatSpaceId` from params | resolves `sessionDiscussionId` |
| Retention job | `DataType.CHAT_SPACE` | `DataType.SESSION_DISCUSSION` |
| Test files | `chatSpace.controller.test.ts` | `sessionDiscussion.controller.test.ts` |
| Test mocks | `mockChatSpaceService` | `mockSessionDiscussionService` |

### Client-app (Laravel + React)
| Layer | Current | Target |
|---|---|---|
| Route path | `/groups/{group}/chat-spaces` | `/groups/{group}/session-discussions` |
| Route path | `/courses/{course}/chat-spaces/{chatSpace}/pre-read` | `/courses/{course}/session-discussions/{sessionDiscussion}/pre-read` |
| Route path | `/courses/{course}/chat/{chatSpace}` | `/courses/{course}/chat/{sessionDiscussion}` |
| Route name | `chat-spaces.pre-read.show` | `session-discussions.pre-read.show` |
| Route name | `chat-spaces.close` | `session-discussions.close` |
| Route name | `chat-spaces.reflection` | `session-discussions.reflection` |
| Route name | `chat-spaces.summary` | `session-discussions.summary` |
| Route name | `groups.chat-spaces.store` | `groups.session-discussions.store` |
| Controller method | `storeChatSpace` | `storeSessionDiscussion` |
| Controller method | `chatSpaces()` | `sessionDiscussions()` |
| Controller method | `chatRoom()` | unchanged (generic) |
| Controller prop | `$chatSpaceMeta` | `$sessionDiscussionMeta` |
| TS interface | `ChatSpace` | `SessionDiscussion` |
| TS interface | `ChatSpaceItem` | `SessionDiscussionItem` |
| TS interface | `ChatSpaceMeta` | `SessionDiscussionMeta` |
| TS interface | `ChatSpaceGoal` | `SessionDiscussionGoal` |
| TS interface | `ChatSpaceData` | `SessionDiscussionData` |
| TS variable | `chatSpaceId` | `sessionDiscussionId` |
| TS variable | `activeChatSpaceId` | `activeSessionDiscussionId` |
| TS variable | `chatSpaceCount` | `sessionDiscussionCount` |
| TS function | `getChatSpaceUrl` | `getSessionDiscussionUrl` |
| TS function | `isClosedChatSpace` | `isClosedSessionDiscussion` |
| TS function | `fetchChatSpaces` | `fetchSessionDiscussions` |
| TS state | `showChatSpaceModal` | `showSessionDiscussionModal` |
| TS state | `chatSpaceForm` | `sessionDiscussionForm` |
| Directory | `components/chat-spaces/` | `components/session-discussions/` |
| File | `SpaceCard.tsx` | `SessionCard.tsx` |
| File | `EmptyState.tsx` (in chat-spaces/) | `EmptyState.tsx` (in session-discussions/) |
| File | `SearchBar.tsx` (in chat-spaces/) | `SearchBar.tsx` (in session-discussions/) |
| File | `Pagination.tsx` (in chat-spaces/) | `Pagination.tsx` (in session-discussions/) |
| Page | `student/chat-spaces/index.tsx` | `student/session-discussions/index.tsx` |
| Hook | `useSocketRoom.ts` chatSpaceId | sessionDiscussionId |
| Hook | `use-chat-summary.ts` chatSpaceId | sessionDiscussionId |
| Component | `ChatWeekMaterialsPanel.tsx` chatSpaceId | sessionDiscussionId |
| Component | `DiscussionHealthWidget.tsx` chatSpaces | sessionDiscussions |
| Validator | `AssertChatMembership.php` chatSpaceId | sessionDiscussionId |

### AI-engine (Python)
| Layer | Current | Target |
|---|---|---|
| Pydantic field | `GoalValidateBody.chat_space_id` | `session_discussion_id` |
| API path | `/export/activity/chat-space/{chat_space_id}` | `/export/activity/session-discussion/{session_discussion_id}` |
| Service param | `orchestration.py validate_goal(chat_space_id)` | `session_discussion_id` |
| Service param | `plan_vs_reality.py analyze_session(chat_space_id)` | `session_discussion_id` |
| Service param | `process_mining_anomaly.py detect_session_anomalies(chat_space_id)` | `session_discussion_id` |
| Service method | `export_service.py aggregate_activity_by_chat_space` | `aggregate_activity_by_session_discussion` |
| Service method | `export_service.py export_chat_space_activity` | `export_session_discussion_activity` |
| Service method | `export_service.py _finalize_chat_space_metrics` | `_finalize_session_discussion_metrics` |
| Mongo logger | `kwargs.get('chat_space_id')` | `kwargs.get('session_discussion_id')` |

## Goals / Non-Goals

**Goals:**
- Rename all internal identifiers from `chatSpace`/`ChatSpace`/`chat_space` to `sessionDiscussion`/`SessionDiscussion`/`session_discussion`
- Rename DB tables, columns, MongoDB fields
- Rename API paths (breaking change — coordinated deploy)
- Zero data loss (migration renames, not recreates)

**Non-Goals:**
- Changing any behavior or logic
- Adding new features
- Changing the discussion session flow

## Decisions

### D1: Naming convention — `SessionDiscussion` (not `DiscussionSession`)

**Decision**: Use `SessionDiscussion` / `session_discussion` / `sessionDiscussionId`.

**Rationale**: Consistent with `CourseWeek`, `CourseMaterial` pattern (entity-qualifier). "Session" is the entity, "Discussion" is the qualifier. Matches Indonesian "sesi diskusi" (sesi = session, diskusi = discussion).

### D2: DB migration strategy — RENAME, not DROP+CREATE

**Decision**: Use `ALTER TABLE ... RENAME TO ...` and `ALTER TABLE ... RENAME COLUMN ...` for PostgreSQL. For MongoDB, field rename via update script.

**Rationale**: Zero data loss. Preserves all FK constraints, indexes, and data.

**Migration steps**:
1. Prisma migration: rename model + `@@map`, rename fields + `@map`
2. `prisma migrate dev --name rename_chat_space_to_session_discussion`
3. If schema drift blocks `migrate dev`, apply SQL directly:
   ```sql
   ALTER TABLE chat_spaces RENAME TO session_discussions;
   ALTER TABLE chat_space_pre_read_completions RENAME TO session_discussion_pre_read_completions;
   ALTER TABLE chat_space_pre_read_completions RENAME COLUMN chat_space_id TO session_discussion_id;
   ALTER TABLE learning_goals RENAME COLUMN chat_space_id TO session_discussion_id;
   ALTER TABLE reflections RENAME COLUMN chat_space_id TO session_discussion_id;
   ALTER TABLE escalation_states RENAME COLUMN chat_space_id TO session_discussion_id;
   -- Rename indexes
   ALTER INDEX chat_spaces_group_id_idx RENAME TO session_discussions_group_id_idx;
   -- etc.
   ```
4. MongoDB: `db.chatlogs.updateMany({}, { $rename: { "chatSpaceId": "sessionDiscussionId" } })`
5. Same for `silence_events` and `escalation_states` collections.

### D3: Coordinated deployment

**Decision**: Deploy all 3 services simultaneously. No backward-compat shim.

**Rationale**: API path rename is breaking. Adding a shim would double the maintenance burden. Since all 3 services are under our control and deployed together, a clean cutover is simpler.

### D4: File renames vs in-place edits

**Decision**: Rename files (`chatSpace.controller.ts` → `sessionDiscussion.controller.ts`) AND edit contents.

**Rationale**: File names should match the primary entity they manage. Git tracks renames, so history is preserved.

## Risks / Trade-offs

| Risk | Severity | Mitigation |
|---|---|---|
| Missed identifier causes runtime error | HIGH | `grep -ri "chat.space" --include="*.ts" --include="*.tsx" --include="*.py" --include="*.php"` sweep after all edits |
| Prisma migration fails due to schema drift | MEDIUM | Apply SQL directly + mark migration as applied in `_prisma_migrations` |
| MongoDB field rename misses documents | MEDIUM | Run `updateMany` with `$rename` on all 3 collections; verify count before/after |
| API clients break during deploy | MEDIUM | Deploy all 3 services in quick succession; brief downtime acceptable |
| Test files break | LOW | Update test files in same commit |
| Large diff hard to review | LOW | Split into: (1) core-api Prisma+DB, (2) core-api code, (3) client-app, (4) ai-engine |

## Execution Order

1. **Core-api DB migration** (Prisma schema + SQL + MongoDB)
2. **Core-api code** (controllers, services, routes, middleware, types, tests)
3. **Client-app code** (routes, controllers, types, components, pages, hooks)
4. **AI-engine code** (schemas, routes, services, tests)
5. **Verify**: `tsc --noEmit` (both JS repos), `py_compile` (ai-engine), grep sweep
6. **Deploy**: rsync all 3 → rebuild all containers → run MongoDB rename scripts
7. **E2E test**: login, create session, pre-read, goal, chat, close, reflection
8. **Commit + archive**

## Estimated Scope

| Repo | Files | Identifier changes |
|---|---|---|
| core-api | ~25 files | ~80 |
| client-app | ~35 files | ~100 |
| ai-engine | ~12 files | ~30 |
| **Total** | **~72 files** | **~210** |
