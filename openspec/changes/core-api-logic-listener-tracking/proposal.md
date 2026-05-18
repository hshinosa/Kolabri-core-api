## Why

Logic Listener's `_last_message_timestamp` dict is only populated when `update_last_message_time(group_id)` is called, which only happens via `_track_message()` → `handle_message()` → `/api/chat` endpoint. This endpoint is only called when a user mentions `@AI`. Group chat without `@AI` is never tracked, so `get_all_silent_groups()` returns empty for most groups and silence detection never fires.

## What Changes

- Socket `send_message` handler calls AI Engine `POST /api/track-activity` asynchronously (fire-and-forget) for each group message
- Add `trackActivity(groupId)` method to `aiEngineService`
- AI Engine's `/api/track-activity` endpoint calls `logic_listener.update_last_message_time(group_id)` (implemented in `ai-engine-track-activity` change)

## Capabilities

### New Capabilities

<!-- None in Core API — the AI Engine endpoint is in ai-engine-track-activity change -->

### Modified Capabilities

- `socket-send-message`: After saving ChatLog, async fire-and-forget call to `aiEngineService.trackActivity(groupId)` so Logic Listener tracks all active groups, not just those using @AI

## Impact

- `src/socket/index.ts` — add async `aiEngineService.trackActivity(groupId)` call after `chatLog.save()`
- `src/services/aiEngine.service.ts` — add `trackActivity(groupId)` method calling `POST /api/track-activity`
