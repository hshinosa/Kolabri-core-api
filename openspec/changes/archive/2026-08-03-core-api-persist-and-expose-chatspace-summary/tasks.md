## 1. Pre-flight

- [x] 1.1 Run baseline `npm run test:run`
- [x] 1.2 Verify Prisma migration tooling configured

## 2. Schema + migration

- [x] 2.1 Add `summary String? @db.Text` and `summaryGeneratedAt DateTime?` to ChatSpace model
- [x] 2.2 Run `npx prisma migrate dev --name add-chatspace-summary`
- [x] 2.3 Verify migration applied cleanly

## 3. Service: persist summary in closeSession

- [x] 3.1 Update `closeSession()` to persist summary via `prisma.chatSpace.update`
- [x] 3.2 Include `summary` + `summaryGeneratedAt` in return value
- [x] 3.3 Run existing close session tests (should still pass)

## 4. Service: getSummary method

- [x] 4.1 Add `ChatSpaceService.getSummary(chatSpaceId, userId, userRole)`
- [x] 4.2 Authorization: student member, lecturer owner, admin all allowed
- [x] 4.3 Throw NotFound for non-existent / deleted chatSpace
- [x] 4.4 Throw Forbidden for unauthorized
- [x] 4.5 Return `{ summary, generatedAt }`

## 5. Controller + route

- [x] 5.1 Add `ChatSpaceController.getSummary` handler
- [x] 5.2 Register `router.get('/:id/summary', ...)` in chatspace.routes.ts
- [x] 5.3 Verify route appears in `npm run dev` output

## 6. Tests

- [x] 6.1 Test: closeSession persists summary
- [x] 6.2 Test: getSummary returns persisted summary
- [x] 6.3 Test: getSummary rejects non-member students
- [x] 6.4 Test: getSummary returns null for sessions not yet closed
- [x] 6.5 Test: getSummary returns 404 for deleted chatSpace

## 7. Verify

- [x] 7.1 `npm run test:run` — all passing
- [x] 7.2 `npx tsc --noEmit` clean
- [x] 7.3 `openspec validate core-api-persist-and-expose-chatspace-summary --strict`

## 8. Client-app coordination (separate commit)

- [x] 8.1 Update Laravel proxy URL from `/api/chatspaces/...` to `/api/chat-spaces/...`
- [x] 8.2 Verify client-app vitest still passes
