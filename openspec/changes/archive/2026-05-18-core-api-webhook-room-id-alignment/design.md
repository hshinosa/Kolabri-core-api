# Design

## Current Mismatch

```typescript
// src/routes/webhook.routes.ts:43 (webhook handler)
io.to(`course_${courseId}_group_${groupId}_space_${chatSpaceId}`).emit('intervention', payload);
// Room: "course_abc_group_def_space_ghi"

// src/socket/index.ts:272-275 (join handler)
socket.join(chatSpaceId);
// Room: "ghi"
```

The two strings don't match. `io.to('course_abc_group_def_space_ghi')` emits to an empty set.

## Proposed Fix (Option A)

Standardize on raw `chatSpaceId`:

```typescript
// src/routes/webhook.routes.ts:43
io.to(chatSpaceId).emit('intervention', payload);
```

## Helper to Prevent Drift

```typescript
// src/socket/rooms.ts (NEW)
export const roomNames = {
    chatSpace: (chatSpaceId: string) => chatSpaceId,
    user: (userId: string) => `user_${userId}`,
};
```

All `io.to(...)` and `socket.join(...)` use `roomNames.chatSpace(id)`. Single source of truth.

## Audit Checklist

Files to inspect for `io.to(`, `socket.join(`, `socket.leave(`:
- `src/routes/webhook.routes.ts`
- `src/socket/index.ts`
- Any other route handlers using `io` from `req.app.get('io')`

## Migration Steps

1. Inspect every emit/join/leave site
2. Replace string concatenation with `roomNames.*` helpers
3. Verify webhook → join name match
4. Add integration test: emit via webhook, verify socket client receives event
