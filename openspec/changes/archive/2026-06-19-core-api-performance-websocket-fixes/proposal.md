# Core-API Performance & WebSocket Fixes

## Status
proposed

## Summary
Five fixes targeting WebSocket broadcast efficiency, cache stability, stampede protection, and database indexing.

---

## HIGH-03: Scope `activity_feed` Broadcast

### Problem
`socket/index.ts:536` — `io.emit('activity_feed', ...)` broadcasts to ALL connected WebSocket clients regardless of which room/course they're in.

### Fix
Replace global emit with room-scoped emit:

```typescript
// Before (socket/index.ts:536):
io.emit('activity_feed', {
    id: chatLog._id?.toString(),
    senderName: user.name,
    // ...
});

// After:
io.to(`course:${authoritativeCourseId}`).emit('activity_feed', {
    id: chatLog._id?.toString(),
    senderName: user.name,
    // ...
});
```

### Pre-requisite
Verify clients join `course:<courseId>` room on `join_room`. If not, add it:

```typescript
// In join_room handler, add:
socket.join(`course:${courseId}`);
```

### Alternative
If no frontend consumer exists for `activity_feed`, remove the emit entirely. Check client-app for `activity_feed` listeners first.

### Risk
- **Low**: Scoping broadcast to relevant clients. If removing entirely, verify no frontend depends on it.

---

## HIGH-04: Debounce Dashboard Cache Invalidation

### Problem
`socket/index.ts:309, 534` — `invalidateDashboardCache()` called on every `join_room` and `send_message`. With active discussions, cache is invalidated hundreds of times per minute, making it effectively useless.

### Fix
Add debounced invalidation utility:

```typescript
// src/utils/debouncedInvalidation.ts
import { invalidateDashboardCache } from '../services/dashboard.service.js';

let pendingTimeout: NodeJS.Timeout | null = null;
const DEBOUNCE_MS = 5000;

export function debouncedInvalidateDashboard(): void {
    if (pendingTimeout) return; // Already scheduled
    pendingTimeout = setTimeout(() => {
        invalidateDashboardCache();
        pendingTimeout = null;
    }, DEBOUNCE_MS);
}
```

Replace calls in `socket/index.ts`:

```typescript
// Lines 309, 534:
// Before: invalidateDashboardCache();
// After:
debouncedInvalidateDashboard();
```

### Risk
- **Very Low**: Dashboard data is already cached with 30s TTL. Debouncing just prevents thrashing within that window.

---

## PERF-CACHE-03: Cache Stampede Protection

### Problem
`cache.ts` — Concurrent cache misses for the same key result in N identical DB queries hitting the database simultaneously.

### Fix
Add `getOrSet()` method with in-flight promise deduplication:

```typescript
// cache.ts — add to SimpleCache class
private inFlight = new Map<string, Promise<unknown>>();

async getOrSet<T>(key: string, factory: () => Promise<T>, ttl?: number): Promise<T> {
    // Check cache first
    const cached = this.get<T>(key);
    if (cached !== null) return cached;

    // Deduplicate concurrent requests for same key
    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<T>;

    const promise = factory()
        .then((result) => {
            this.set(key, result, ttl);
            return result;
        })
        .finally(() => {
            this.inFlight.delete(key);
        });

    this.inFlight.set(key, promise);
    return promise;
}
```

### Migration
Existing `cache.get()` + `cache.set()` patterns in services should be migrated to `cache.getOrSet()` where appropriate. Priority:
1. `course.service.ts:130-199` (getMyCourses)
2. `dashboard.service.ts:62-69` (getStats)

### Risk
- **Low**: Additive change. Existing `get()`/`set()` API unchanged. `getOrSet()` is opt-in.

---

## PERF-WS-01: Silence Timer Leak Audit

### Problem
`socket/index.ts:312, 547, 816, 829` — Multiple `setTimeout` calls per room for silence timers. Unclear cleanup on disconnect or room empty.

### Fix
Audit and verify:
1. Read `startSilenceTimer()` and `resetSilenceTimer()` implementations
2. Verify all timers are tracked in a map keyed by room ID
3. Verify `clearTimeout` is called on:
   - `disconnect` event
   - Room becoming empty (all users left)
   - New timer replacing old timer (reset)
4. Add missing cleanup if gaps found

If timers are already properly tracked (likely, since this is existing code), document the cleanup path. If not:

```typescript
// Ensure silenceTimers map exists and cleanup is wired:
const silenceTimers = new Map<string, NodeJS.Timeout>();

function startSilenceTimer(roomId, courseId, groupId, chatSpaceId) {
    // Clear existing
    const existing = silenceTimers.get(roomId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
        // ... silence logic ...
        silenceTimers.delete(roomId);
    }, SILENCE_TIMEOUT_MS);

    silenceTimers.set(roomId, timer);
}

// In disconnect handler:
// Check if user was last in room → clear timer
socket.on('disconnect', () => {
    for (const roomId of socket.rooms) {
        if (io.sockets.adapter.rooms.get(roomId)?.size === 0) {
            const timer = silenceTimers.get(roomId);
            if (timer) {
                clearTimeout(timer);
                silenceTimers.delete(roomId);
            }
        }
    }
});
```

### Risk
- **Low**: Audit-first approach. Only modify if gaps found.

---

## PERF-DB-04: Add Notification Compound Index

### Problem
`notification.service.ts:11-14` — `prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })` has no compound index. Full scan per query.

### Fix
Add Prisma schema index:

```prisma
model Notification {
    // ... existing fields ...
    
    @@index([userId, createdAt(sort: Desc)])
}
```

Then run:
```bash
npx prisma migrate dev --name add-notification-userid-createdat-index
```

### Risk
- **Very Low**: Index-only change. No query logic modified. Migration is non-destructive.

---

## Files Changed
- `src/socket/index.ts` — HIGH-03 (scoped emit), HIGH-04 (debounce), PERF-WS-01 (timer audit)
- `src/utils/cache.ts` — PERF-CACHE-03 (getOrSet with stampede protection)
- `src/utils/debouncedInvalidation.ts` — HIGH-04 (new utility file)
- `src/services/course.service.ts` — PERF-CACHE-03 (migrate to getOrSet)
- `src/services/dashboard.service.ts` — PERF-CACHE-03 (migrate to getOrSet)
- `prisma/schema.prisma` — PERF-DB-04 (add index)

## Testing
- WebSocket: verify `activity_feed` only received by course members
- Cache: concurrent test with 10 parallel getOrSet calls, verify single factory invocation
- DB: verify index exists post-migration, query plan uses index
- Timer: verify no orphaned timers after room disconnect

## Estimated Impact
- HIGH-03: Eliminates irrelevant broadcasts (bandwidth + CPU savings)
- HIGH-04: Dashboard cache becomes effective (reduces DB load)
- PERF-CACHE-03: Prevents DB query storms under load
- PERF-WS-01: Prevents memory leaks from orphaned timers
- PERF-DB-04: Notification list query goes from O(n) to O(log n)
