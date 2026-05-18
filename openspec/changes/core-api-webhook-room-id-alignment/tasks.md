## 1. Pre-flight

- [ ] 1.1 Run baseline: `npm test`
- [ ] 1.2 Grep all room name usages: `grep -rn "io.to\|socket.join\|socket.leave" src/`

## 2. Create room name helper

- [ ] 2.1 Create `src/socket/rooms.ts` with `roomNames.chatSpace(id)`, `roomNames.user(id)` helpers
- [ ] 2.2 Export from `src/socket/index.ts`

## 3. Migrate emit sites

- [ ] 3.1 `src/routes/webhook.routes.ts:43` — replace template literal with `roomNames.chatSpace(chatSpaceId)`
- [ ] 3.2 `src/socket/index.ts` — all `io.to(...)` calls

## 4. Migrate join/leave sites

- [ ] 4.1 `src/socket/index.ts:272-275` — `socket.join(roomNames.chatSpace(id))`
- [ ] 4.2 Any `socket.leave(...)` sites

## 5. Tests

- [ ] 5.1 Integration test: webhook emit → socket client receives event
- [ ] 5.2 Unit test: `roomNames.chatSpace('abc')` returns expected string

## 6. Verify

- [ ] 6.1 `grep -rn 'course_\${' src/` returns 0 inline literals
- [ ] 6.2 `npm test` passing
- [ ] 6.3 `openspec validate core-api-webhook-room-id-alignment --strict`
