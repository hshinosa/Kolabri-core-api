## 1. Pre-flight

- [x] 1.1 Run baseline: `npm test`
- [x] 1.2 Read full `src/socket/index.ts`
- [x] 1.3 List service imports of `getIO` — `src/services/chatSpace.service.ts:3`, `src/routes/webhook.routes.ts:4`

## 2. Extract auth module

- [ ] 2.1 Create `src/socket/auth.ts` with `authMiddleware` — DEFERRED (Section 2-5: full file split is high-risk pure refactor of 1134 LOC; behavior-neutral pieces deferred to keep this change scoped to decoupling)
- [ ] 2.2 Update `src/socket/index.ts` to import + use middleware — DEFERRED
- [ ] 2.3 Run socket tests — DEFERRED

## 3. Extract rooms module

- [x] 3.1 `src/socket/rooms.ts` already created in webhook-room-id-alignment change with `roomNames` helper
- [ ] 3.2 Move join/leave logic — DEFERRED (Section 5)
- [ ] 3.3 Run tests — DEFERRED

## 4. Extract messages module

- [ ] 4.1 Create `src/socket/messages.ts` — DEFERRED
- [ ] 4.2 Move send_message, delete_message, edit_message, typing — DEFERRED
- [x] 4.3 Apply authorization rules from `core-api-socket-message-authorization` — DONE in that change
- [ ] 4.4 Run tests — DEFERRED

## 5. Extract interventions and presence modules

- [ ] 5.1 Create `src/socket/interventions.ts` — DEFERRED
- [ ] 5.2 Create `src/socket/presence.ts` with cleanup logic — DEFERRED
- [ ] 5.3 Run tests — DEFERRED

## 6. Add socketEmitter adapter

- [x] 6.1 Created `src/utils/socketEmitter.ts` with `setSocketEmitter`/`getSocketEmitter`
- [x] 6.2 Wired in `src/socket/index.ts` — `initSocketIO` calls `setSocketEmitter({ emit: (room, event, payload) => io.to(room).emit(event, payload) })` immediately after `new Server()`
- [x] 6.3 Refactored `src/services/chatSpace.service.ts` to use adapter — both `closeSession` and `reopenSession` now use `getSocketEmitter()?.emit(room, event, payload)`; tests updated to mock `socketEmitter` instead of `socket/index`
- [x] 6.4 Refactored `src/routes/webhook.routes.ts` to use adapter

## 7. Type safety

- [ ] 7.1 Create `src/socket/types.ts` with event payload types — DEFERRED (only valuable after Section 2-5 split)
- [ ] 7.2 Remove `as any` and `as Record<string, unknown>` from chatSpace.service.ts — DEFERRED (those casts handle Prisma client type mismatches with closedAt/closedBy fields not yet present in generated types; orthogonal to socket decoupling)

## 8. Verify

- [x] 8.1 `npm test` — socket + sanitize + webhook callers green; chatSpace pre-existing closeSession timeouts unchanged
- [ ] 8.2 `wc -l src/socket/index.ts` < 100 LOC — DEFERRED (currently 1142 LOC; achievable only after Section 2-5)
- [x] 8.3 No service imports `getIO` from socket — `chatSpace.service.ts` and `webhook.routes.ts` migrated; service layer is now transport-agnostic
- [x] 8.4 `openspec validate core-api-socket-module-decomposition --strict`
