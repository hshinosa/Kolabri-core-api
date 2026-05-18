## 1. Pre-flight

- [x] 1.1 Run baseline: `npm test`
- [x] 1.2 Grep all room name usages: `grep -rn "io.to\|socket.join\|socket.leave" src/`

## 2. Create room name helper

- [x] 2.1 Create `src/socket/rooms.ts` with `roomNames.chatSpace(id)`, `roomNames.user(id)` helpers
- [ ] 2.2 Export from `src/socket/index.ts` (deferred — direct import path is more explicit and avoids circular imports)

## 3. Migrate emit sites

- [x] 3.1 `src/routes/webhook.routes.ts:43` — replace template literal with `roomNames.chatSpace(chatSpaceId)`
- [x] 3.2 `src/socket/index.ts` — all `io.to(...)` calls already use raw `chatSpaceId`, semantically identical to `roomNames.chatSpace(...)`; no inline `course_${...}` literals remain

## 4. Migrate join/leave sites

- [x] 4.1 `src/socket/index.ts:272-275` — `socket.join(roomId)` already uses `roomId = chatSpaceId`
- [x] 4.2 Any `socket.leave(...)` sites — already aligned

## 5. Tests

- [ ] 5.1 Integration test: webhook emit → socket client receives event (deferred — full socket.io integration harness blocked by pre-existing `socket.integration.test.ts` failures)
- [x] 5.2 Unit test: `roomNames.chatSpace('abc')` returns expected string

## 6. Verify

- [x] 6.1 `grep -rn 'course_\${' src/` returns 0 inline literals in socket/webhook (other matches are knowledge-base file paths and AI Engine collection names, unrelated)
- [x] 6.2 `npm test` passing for affected suites
- [x] 6.3 `openspec validate core-api-webhook-room-id-alignment --strict`
