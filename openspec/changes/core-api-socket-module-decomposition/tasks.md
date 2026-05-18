## 1. Pre-flight

- [ ] 1.1 Run baseline: `npm test`
- [ ] 1.2 Read full `src/socket/index.ts`
- [ ] 1.3 List service imports of `getIO`

## 2. Extract auth module

- [ ] 2.1 Create `src/socket/auth.ts` with `authMiddleware`
- [ ] 2.2 Update `src/socket/index.ts` to import + use middleware
- [ ] 2.3 Run socket tests

## 3. Extract rooms module

- [ ] 3.1 Create `src/socket/rooms.ts` with handlers + `roomNames` helper
- [ ] 3.2 Move join/leave logic
- [ ] 3.3 Run tests

## 4. Extract messages module

- [ ] 4.1 Create `src/socket/messages.ts`
- [ ] 4.2 Move send_message, delete_message, edit_message, typing
- [ ] 4.3 Apply authorization rules from `core-api-socket-message-authorization`
- [ ] 4.4 Run tests

## 5. Extract interventions and presence modules

- [ ] 5.1 Create `src/socket/interventions.ts`
- [ ] 5.2 Create `src/socket/presence.ts` with cleanup logic
- [ ] 5.3 Run tests

## 6. Add socketEmitter adapter

- [ ] 6.1 Create `src/utils/socketEmitter.ts`
- [ ] 6.2 Wire in `src/socket/index.ts`
- [ ] 6.3 Refactor `src/services/chatSpace.service.ts` to use adapter
- [ ] 6.4 Refactor other services that import getIO

## 7. Type safety

- [ ] 7.1 Create `src/socket/types.ts` with event payload types
- [ ] 7.2 Remove `as any` and `as Record<string, unknown>` from chatSpace.service.ts

## 8. Verify

- [ ] 8.1 `npm test` passing
- [ ] 8.2 `wc -l src/socket/index.ts` < 100 LOC
- [ ] 8.3 No service imports `getIO` from socket
- [ ] 8.4 `openspec validate core-api-socket-module-decomposition --strict`
