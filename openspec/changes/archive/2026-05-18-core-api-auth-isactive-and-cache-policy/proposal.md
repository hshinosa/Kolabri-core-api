# Auth Middleware: Enforce isActive and Tighten Cache Policy

## Problem Statement

Spec `core-api-jwt-db-check` claimed "DB check on every protected request". Reality:

1. `src/middleware/auth.ts:34-47` caches user lookup result for 5 minutes via `userActiveCache.ts`
2. Middleware queries with `select: { id: true }` only — `isActive` field never checked
3. `src/socket/index.ts:208-211` Socket.IO auth same — only `deletedAt: null` filter, no `isActive` check

Consequences:
- Soft-deleted users keep access for up to 5 minutes after deletion
- Deactivated users (`isActive=false`) keep access indefinitely
- Security incident response (deactivate user) has no immediate effect

## Proposed Solution

1. Add `isActive` check in both HTTP and Socket.IO auth queries
2. Reduce cache TTL from 5 minutes to 30-60 seconds for security state
3. Add cache invalidation hook on user state change (deactivate, soft-delete)

## Scope

- `src/middleware/auth.ts` — add `isActive: true` to where clause
- `src/socket/index.ts:208-211` — same
- `src/utils/userActiveCache.ts` — reduce TTL, add invalidate(userId) function
- `src/services/user.service.ts` (or wherever user state changes) — invalidate cache on deactivate/delete
- Tests for active/deactivated/deleted user paths

## Out of Scope

- JWT signature/expiry mechanism (already correct)
- Per-request DB check without cache (performance regression)
