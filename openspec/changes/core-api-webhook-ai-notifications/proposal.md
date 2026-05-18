## Why

AI Engine's `notification_service.py` calls `POST {CORE_API_URL}/api/webhooks/ai-intervention` to deliver silence detection alerts and teacher notifications. This endpoint does not exist in Core API — the route file is missing entirely. All proactive interventions from AI Engine (silence, participation inequity, teacher alerts) fail silently with no delivery to users.

## What Changes

- Add `POST /api/webhooks/ai-intervention` endpoint to Core API
- Handler queries PostgreSQL for group's active chat spaces and courseId, then broadcasts intervention to all matching Socket.IO rooms
- Authenticate with `X-API-Key: {CORE_API_SECRET}` header
- Register route in `src/app.ts`

## Capabilities

### New Capabilities

- `webhook-ai-intervention`: Receives AI Engine intervention notifications and broadcasts them to the correct Socket.IO rooms as `receive_message` events with `isIntervention: true`

### Modified Capabilities

<!-- None -->

## Impact

- `src/routes/webhook.routes.ts` — new file
- `src/app.ts` — register webhook route
