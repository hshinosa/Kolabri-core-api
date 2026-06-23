## Why

The internal identifier `chat_space` / `ChatSpace` / `chat_space_id` is used across all 3 services (core-api, client-app, ai-engine), PostgreSQL, and MongoDB. The user-facing term is already "sesi diskusi" — the internal naming should match for developer clarity and consistency. This is a large-scale rename that touches DB schemas, API contracts, and cross-service identifiers.

## What Changes

### Core-api (Prisma + PostgreSQL + MongoDB)
- **Prisma model**: `ChatSpace` → `SessionDiscussion` (or `DiscussionSession`)
- **PostgreSQL table**: `chat_spaces` → `session_discussions` (requires migration)
- **PostgreSQL columns**: `chat_space_id` → `session_discussion_id` on `chat_space_pre_read_completions`, `learning_goals`, `reflections`, `escalation_states`
- **PostgreSQL table**: `chat_space_pre_read_completions` → `session_discussion_pre_read_completions`
- **MongoDB collection fields**: `ChatLog.chatSpaceId` → `ChatLog.sessionDiscussionId`, `SilenceEvent.chatSpaceId`, `EscalationState.chatSpaceId`
- **API endpoints**: `/api/chat-spaces` → `/api/session-discussions`, `/api/groups/{id}/chat-spaces` → `/api/groups/{id}/session-discussions`
- **Controller/service files**: `chatSpace.controller.ts` → `sessionDiscussion.controller.ts`, `chatSpace.service.ts` → `sessionDiscussion.service.ts`
- **Route files**: `chatSpace.routes.ts` → `sessionDiscussion.routes.ts`
- **Types/interfaces**: `ChatSpace` → `SessionDiscussion`, `chatSpaceId` → `sessionDiscussionId`

### Client-app (Laravel + React)
- **Routes**: `/chat-spaces` path segments → `/session-discussions`, route names `chat-spaces.*` → `session-discussions.*`
- **Controllers**: `storeChatSpace`, `getChatSpaces`, `getChatSpaceById` → `storeSessionDiscussion`, etc.
- **TypeScript types**: `ChatSpace` interface → `SessionDiscussion`, `chatSpaceId` → `sessionDiscussionId`
- **Variables/props**: all `chatSpace*` → `sessionDiscussion*`
- **Components**: `chat-spaces/` directory → `session-discussions/`, `SpaceCard.tsx` → `SessionCard.tsx`

### AI-engine (Python)
- **Pydantic schemas**: `AskRequest.chat_space_id` (already removed), `GoalValidateBody.chat_space_id` → `session_discussion_id`
- **API route**: `/export/activity/chat-space/{chat_space_id}` → `/export/activity/session-discussion/{session_discussion_id}`
- **Service params**: `chat_space_id` → `session_discussion_id` in `orchestration.py`, `plan_vs_reality.py`, `process_mining_anomaly.py`, `export_service.py`
- **MongoDB logger**: `kwargs.get('chat_space_id')` → `kwargs.get('session_discussion_id')`

## Capabilities

### New Capabilities

_None — pure rename, no behavior change._

### Modified Capabilities

- `discussion-session-api`: All API endpoints, request/response fields, and internal identifiers use `session_discussion` / `SessionDiscussion` / `session_discussion_id` consistently across core-api, client-app, and ai-engine.
- `discussion-session-data`: Database tables, columns, and MongoDB fields use `session_discussion` naming. Prisma model is `SessionDiscussion`. Migration renames all existing tables/columns without data loss.

## Migration Notes

This is a **breaking change** that requires coordinated deployment:
1. Apply DB migration (rename tables + columns) on VPS
2. Deploy all 3 services simultaneously (old API paths will 404)
3. Clear WebSocket rooms (clients reconnect with new identifiers)
4. Update OpenAPI documentation
5. Estimated scope: ~200+ identifier changes across 3 repos
