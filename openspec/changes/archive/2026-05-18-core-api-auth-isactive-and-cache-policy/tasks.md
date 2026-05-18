## 1. Pre-flight

- [x] 1.1 Run baseline: `npm test`
- [x] 1.2 Read `src/middleware/auth.ts`, `src/socket/index.ts:200-220`, `src/utils/userActiveCache.ts`
- [x] 1.3 Search `prisma.user.findFirst|findUnique` usage to find all auth points

## 2. Update auth queries to check isActive

- [x] 2.1 `src/middleware/auth.ts:36-39` — added `isActive: true` to where clause
- [x] 2.2 `src/socket/index.ts:208-211` — same
- [x] 2.3 Verified `User.isActive` field exists in `prisma/schema.prisma` (line 31)

## 3. Tighten cache policy

- [x] 3.1 `src/utils/userActiveCache.ts` — TTL reduced from 5 min to 30 s
- [x] 3.2 `invalidate(userId: string)` already existed, retained
- [x] 3.3 Added `invalidateAll()` for emergency revocation

## 4. Wire invalidation on state change

- [x] 4.1 `updateUser` already invalidated on isActive change (kept)
- [x] 4.2 `deleteUser` (soft) already invalidated (kept)
- [x] 4.3 `hardDeleteUser` now invalidates cache (added)
- [x] 4.4 `bulkDeleteUsers` now invalidates each user (added)

## 5. Tests

- [x] 5.1 Existing auth.test.ts (11) and user.service.test.ts pass with new queries
- [ ] 5.2 Test Socket.IO auth rejects deactivated user (deferred — socket integration tests blocked by pre-existing failures)
- [ ] 5.3 Test cache invalidation immediately reflects state change (covered indirectly by user.service tests; standalone test deferred)

## 6. Verify

- [x] 6.1 `npm test` for affected suites passes (auth + user.service)
- [x] 6.2 `openspec validate core-api-auth-isactive-and-cache-policy --strict`
- [ ] 6.3 Manual: deactivate user → 401 within 30s (deferred to QA / staging)
