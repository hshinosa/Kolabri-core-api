## Context

AI Engine's `notification_service.py` sends `POST {CORE_API_URL}/api/webhooks/ai-intervention` with payload `{ groupId, message, type, metadata }`. Core API has no webhook route. The Socket.IO `io` instance is created in `src/server.ts` and used in `src/socket/index.ts`. To broadcast from a webhook handler, `io` must be accessible.

Room ID format in socket/index.ts: `course_${courseId}_group_${groupId}_space_${chatSpaceId}`. The webhook only receives `groupId`, so the handler must query PostgreSQL for the group's courseId and active chatSpaces.

## Goals / Non-Goals

**Goals:**
- Receive AI Engine intervention notifications and deliver them to Socket.IO rooms
- Authenticate requests with `X-API-Key` header matching `CORE_API_SECRET`
- Save intervention to MongoDB ChatLog for persistence
- Emit `receive_message` + `quality_intervention` events to matching rooms

**Non-Goals:**
- Not a general-purpose webhook system — only handles AI Engine interventions
- Not responsible for deciding whether to intervene — AI Engine already decided

## Decisions

**D1: Export `io` from socket/index.ts**
The webhook handler needs `io`. Export it from `src/socket/index.ts` as a named export after initialization. This is the simplest approach without introducing a shared module.

**D2: Query PostgreSQL for room resolution**
The webhook receives only `groupId`. Query `prisma.group.findFirst({ include: { course, chatSpaces: { where: { closedAt: null } } } })` to get courseId and active chatSpaces, then broadcast to all matching rooms.

**D3: Save to MongoDB ChatLog**
Persist the intervention message to MongoDB so it appears in chat history when users reload. Use `senderType: 'ai'`, `isIntervention: true`.

**D4: Authenticate with X-API-Key**
Check `req.headers['x-api-key'] === process.env.CORE_API_SECRET`. Return 401 if missing or wrong.

## Risks / Trade-offs

- **[Risk] `io` not initialized when webhook is called** → Mitigation: return 503 if `io` is null
- **[Risk] Group has no active chat spaces** → Mitigation: return 200 with `{ delivered: 0 }` — not an error
- **[Risk] Multiple active chat spaces** → Expected behavior: broadcast to all of them

## Open Questions

- Should the webhook also emit `quality_intervention` event (for UI metrics display) or just `receive_message`?
