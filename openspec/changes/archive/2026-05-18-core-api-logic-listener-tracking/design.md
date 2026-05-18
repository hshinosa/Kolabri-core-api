## Context

Logic Listener's `update_last_message_time(group_id)` is the only way to register a group as active. It's called from `_track_message()` in orchestration, which is only triggered by `/api/chat`. Socket `send_message` handler already calls `aiEngineService.analyzeEngagement()` asynchronously (from the previous fix). Adding `trackActivity()` is a similar fire-and-forget pattern.

AI Engine's `ai-engine-track-activity` change adds `POST /api/track-activity` endpoint. This Core API change adds the client-side call.

## Goals / Non-Goals

**Goals:**
- Every group message updates Logic Listener's timestamp in AI Engine
- Call is async, non-blocking — must not add latency to message delivery
- Errors are silently ignored — tracking failure must not affect chat

**Non-Goals:**
- Not responsible for implementing the AI Engine endpoint (that's `ai-engine-track-activity`)
- Not tracking individual user activity — only group-level timestamp

## Decisions

**D1: Fire-and-forget pattern**
Same pattern as `analyzeEngagement()` already in the socket handler: `.then(() => {}).catch(() => {})`. No await, no error propagation.

**D2: Call after `chatLog.save()`**
Tracking should happen after the message is persisted. If tracking fails, the message is still saved.

**D3: Add `trackActivity(groupId)` to `aiEngineService`**
Simple method: `POST /api/track-activity` with `{ group_id: groupId }`. No retry needed — if it fails, the next message will update the timestamp.

## Risks / Trade-offs

- **[Risk] High message volume → many tracking calls** → Mitigation: AI Engine endpoint is O(1), no LLM, no DB write — just in-memory dict update. Negligible overhead.
- **[Risk] AI Engine down** → Mitigation: fire-and-forget, errors ignored. Silence detection degrades gracefully.

## Open Questions

- Should tracking be rate-limited (e.g., max once per 30s per group) to reduce AI Engine load? For now, track every message.
