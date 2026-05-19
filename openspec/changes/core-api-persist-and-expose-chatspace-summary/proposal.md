# Persist Chat Space Summary + Expose GET Endpoint

## Problem Statement

`ChatSpaceService.closeSession()` generates an AI summary via `aiEngineService.generateSummary()` and returns it inline in the close response. The summary is **NOT persisted** to the database, and there is **no GET endpoint** to retrieve it.

Consequences (discovered in client-app edge case audit):
- Client-app captures summary from close response into React state
- On page refresh, React state lost
- `useChatSummary` falls back to GET — Core returns 404 — frontend shows empty state
- User loses summary permanently after one refresh

## Proposed Solution

1. Add `summary` (Text, nullable) and `summaryGeneratedAt` (DateTime, nullable) fields to `ChatSpace` model
2. `closeSession()`: store generated summary to DB
3. New `GET /api/chat-spaces/:id/summary` endpoint returning `{ summary, generatedAt }`
4. Authorization: same as `getStatus` (student member of group OR course owner OR admin)

## Scope

- `prisma/schema.prisma` — ChatSpace model fields
- New Prisma migration
- `src/services/chatSpace.service.ts::closeSession` — persist summary
- `src/services/chatSpace.service.ts::getSummary` — new method
- `src/controllers/chatSpace.controller.ts::getSummary` — new handler
- `src/routes/chatspace.routes.ts` — register `GET /:id/summary`
- Tests

## Out of Scope

- Summary regeneration endpoint
- Summary editing
- Multi-language summaries
