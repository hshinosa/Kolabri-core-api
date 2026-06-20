# Proposal: Fix Missing Teacher Notification Webhook and Engagement Data Persistence

## Problem
Two critical issues discovered in core-api that break teacher notifications and group analytics:

1. **Missing `/api/webhooks/teacher-notification` Endpoint** — AI Engine calls this endpoint when high-severity anomalies detected (silence >30min, low participation, etc.) but endpoint doesn't exist in `webhook.routes.ts`. Teachers never receive notifications. Silent failure after 3 retries.

2. **Engagement Data Not Persisted to ChatLog** — Socket handler receives orchestration result with detailed `analytics` dict (engagement_type, is_higher_order, lexical_variety) but only saves top-level fields (qualityScore, interventionType) to ChatLog. The `ChatLog.engagement` field (defined in model) is never populated. Downstream analytics aggregation may not work correctly.

## Scope
- `src/routes/webhook.routes.ts` — add `/teacher-notification` endpoint
- `src/controllers/webhook.controller.ts` — implement notification handler
- `src/services/notification.service.ts` — add `sendTeacherNotification()` method
- `src/socket/index.ts` — save orchestration `analytics` dict to `ChatLog.engagement` field

## Non-Goals
- Real-time WebSocket push notifications (separate proposal)
- Notification preference enforcement (separate proposal)
- Frontend notification UI changes

## Risk
- **Low**: Webhook endpoint addition, no existing code changes
- **Medium**: Socket handler change requires careful testing to ensure no message flow disruption
- **Low**: Engagement field already defined in model, just needs population
