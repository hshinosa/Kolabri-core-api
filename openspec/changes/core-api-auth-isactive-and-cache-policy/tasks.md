## 1. Pre-flight

- [ ] 1.1 Run baseline: `npm test`
- [ ] 1.2 Read `src/middleware/auth.ts`, `src/socket/index.ts:200-220`, `src/utils/userActiveCache.ts`
- [ ] 1.3 Search `prisma.user.findFirst|findUnique` usage to find all auth points

## 2. Update auth queries to check isActive

- [ ] 2.1 `src/middleware/auth.ts:36-39` — add `isActive: true` to where clause
- [ ] 2.2 `src/socket/index.ts:208-211` — same
- [ ] 2.3 Verify `User.isActive` field exists in `prisma/schema.prisma`

## 3. Tighten cache policy

- [ ] 3.1 `src/utils/userActiveCache.ts` — reduce TTL constant from 5min to 30s
- [ ] 3.2 Add `invalidate(userId: string)` function
- [ ] 3.3 Add `invalidateAll()` function for emergency

## 4. Wire invalidation on state change

- [ ] 4.1 Find user deactivation handler (likely admin user service)
- [ ] 4.2 Call `userActiveCache.invalidate(userId)` after state change
- [ ] 4.3 Same for soft-delete

## 5. Tests

- [ ] 5.1 Test HTTP auth rejects deactivated user (after invalidation or TTL)
- [ ] 5.2 Test Socket.IO auth rejects deactivated user
- [ ] 5.3 Test cache invalidation immediately reflects state change

## 6. Verify

- [ ] 6.1 `npm test` — all passing
- [ ] 6.2 `openspec validate core-api-auth-isactive-and-cache-policy --strict`
- [ ] 6.3 Manual: deactivate user, immediately attempt request, verify 401
