# Webhook Room ID Alignment

## Problem Statement

AI Engine intervention webhooks emit notifications to the wrong Socket.IO room name:

- `src/routes/webhook.routes.ts:43` emits to `course_${courseId}_group_${groupId}_space_${chatSpaceId}`
- `src/socket/index.ts:272-275` sockets join rooms by raw `chatSpaceId`

Result: AI Engine successfully computes intervention, sends webhook, Core API emits to a room name that has zero listeners. The intervention notification is silently dropped. Feature appears broken in production with no error.

## Proposed Solution

Standardize on single room naming convention. Choose one of:

**Option A**: webhook emits to `chatSpaceId` (match current join behavior)
**Option B**: sockets join `course_${courseId}_group_${groupId}_space_${chatSpaceId}` (match webhook expectation)

Recommended: **Option A** — simpler, matches existing send_message/typing emit paths.

## Scope

- `src/routes/webhook.routes.ts:43` — change emit target to `chatSpaceId`
- Audit all `io.to(...)` calls across `src/socket/`, `src/routes/webhook.routes.ts` for consistency
- Add room name constant or helper to prevent drift

## Out of Scope

- Webhook authentication (separate concern)
- Multi-room broadcasts
