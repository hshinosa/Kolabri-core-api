# Design

## Current State

### HTTP Auth
```typescript
// src/middleware/auth.ts:36-39
const user = await prisma.user.findFirst({
    where: { id: decoded.userId, deletedAt: null },
    select: { id: true },
});
```

### Socket.IO Auth
```typescript
// src/socket/index.ts:208-211
const user = await prisma.user.findFirst({
    where: { id: decoded.userId, deletedAt: null },
    select: { id: true },
});
```

### Cache
```typescript
// src/utils/userActiveCache.ts — 5 minute TTL, no invalidation API
```

## Target State

### Both auth paths

```typescript
const user = await prisma.user.findFirst({
    where: { id: decoded.userId, deletedAt: null, isActive: true },
    select: { id: true },
});
```

### Cache with shorter TTL + invalidation

```typescript
export const userActiveCache = {
    ttlMs: 30_000, // 30 seconds (down from 5 min)
    isAllowed(userId: string): boolean { ... },
    setAllowed(userId: string, allowed: boolean): void { ... },
    invalidate(userId: string): void { ... }, // NEW
    invalidateAll(): void { ... }, // for admin recovery
};
```

### Service-side invalidation

When user state changes:
- `deactivateUser(userId)` → `userActiveCache.invalidate(userId)`
- `softDeleteUser(userId)` → same
- `reactivateUser(userId)` → same

## Trade-offs

- **TTL reduction (5min → 30s)**: 10x more DB queries. Acceptable given users are O(thousands), not O(millions). Indexed lookup is sub-millisecond.
- **Active invalidation**: requires touching admin/user services. One-time cost.
- **Alternative**: per-request DB check (no cache) — rejected, too costly for hot endpoints.
