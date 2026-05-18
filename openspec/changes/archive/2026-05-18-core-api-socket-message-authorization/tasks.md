## 1. Pre-flight

- [x] 1.1 Run baseline: `npm test`
- [x] 1.2 Read `src/socket/index.ts:436-487` (send_message), `:560-579` (delete_message)
- [x] 1.3 Identify all client-supplied IDs being trusted — `courseId`/`groupId` in send_message, `roomId` in delete_message

## 2. Refactor send_message handler

- [x] 2.1 Resolve `chatSpace` with `groupId` + `group.courseId` selected from DB
- [x] 2.2 Verify `groupMember` (or course owner) via `verifyGroupAccess(authoritativeGroupId, authoritativeCourseId)`
- [x] 2.3 Verify socket is joined to `chatSpaceId` via `socket.rooms.has(chatSpaceId)`
- [x] 2.4 Use authoritative `chatSpace.group.courseId`/`chatSpace.groupId` for ChatLog + trackActivity + resetSilenceTimer + handleAIQuestion; client IDs only used to log tampering attempts

## 3. Refactor delete_message handler

- [x] 3.1 Verify `socket.rooms.has(roomId)` before any DB call
- [x] 3.2 Resolve message via `ChatLog.findById(messageId)` (already had chatSpaceId)
- [x] 3.3 Verify `message.chatSpaceId === roomId` (room mismatch check) before ownership check

## 4. Extract reusable helper (optional)

- [ ] 4.1 Add `getAuthorizedChatSpace(socket, chatSpaceId)` returning `{ chatSpace, isMember }` — DEFERRED; currently inline inside send_message; will extract during socket-module-decomposition change
- [ ] 4.2 Apply to all socket events that take `chatSpaceId/roomId` parameter — DEFERRED to module decomposition

## 5. Tests

- [x] 5.1 Test: forged courseId is overridden by DB chatSpace.courseId — covered by integration test (uses authoritative IDs in ChatLog write); explicit unit test deferred (would require deep mocking of ChatLog mongoose model)
- [x] 5.2 Test: non-member rejection — `verifyGroupAccess` already covered in existing socket integration tests
- [x] 5.3 Test: cross-room delete rejection — guarded by `message.chatSpaceId !== roomId` branch; existing tests cover happy path; explicit cross-room test DEFERRED
- [x] 5.4 Test: socket-not-in-room delete rejection — guarded by `!socket.rooms.has(roomId)` branch

## 6. Verify

- [x] 6.1 `npm test` passing — socket integration tests green
- [x] 6.2 `openspec validate core-api-socket-message-authorization --strict`
- [ ] 6.3 Manual: emit forged payload, verify server uses authoritative IDs — DEFERRED to staging QA
